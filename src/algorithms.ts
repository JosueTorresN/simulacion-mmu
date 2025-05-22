import type {
  PageFrame,
  LogicalPage,
  ProcessInstruction,
  PageReplacementContext,
  PageReplacementDecision,
  AlgorithmName,
  PageReplacementAlgorithmFn,
} from './types';

// --- Helper: Obtener la LogicalPage a partir de un PageFrame y la MMU ---
const getLogicalPageFromFrame = (
  frame: PageFrame,
  mmu: ReadonlyArray<LogicalPage>
): LogicalPage | undefined => {
  if (!frame.isOccupied || !frame.logicalPageId) return undefined;
  return mmu.find(p => p.id === frame.logicalPageId);
};

// --- FIFO ---
export const fifoAlgorithm: PageReplacementAlgorithmFn = (context) => {
  let oldestFrame: PageFrame | null = null;
  for (const frame of context.ramFrames) {
    if (frame.isOccupied) {
      // loadedTimestamp en PageFrame es el momento en que la página actual en ese marco fue cargada.
      if (!oldestFrame || (frame.loadedTimestamp! < oldestFrame.loadedTimestamp!)) {
        oldestFrame = frame;
      }
    }
  }
  if (!oldestFrame) {
    throw new Error("[FIFO] No hay marcos ocupados para elegir una víctima. Esto no debería ocurrir si la RAM está llena.");
  }
  return {
    victimFrameId: oldestFrame.frameId,
    victimLogicalPageId: oldestFrame.logicalPageId,
  };
};

// --- SC---
// La lógica principal de SC
export const scAlgorithm: PageReplacementAlgorithmFn = (context) => {
  const numFrames = context.ramFrames.length;
  let currentHandPos = context.scHandPosition === undefined ? 0 : context.scHandPosition;
  const pagesToClearRBit: string[] = [];

  while (true) {
    const frame = context.ramFrames[currentHandPos];
    if (frame.isOccupied) {
      const logicalPage = getLogicalPageFromFrame(frame, context.mmu);
      if (logicalPage) {
        if (logicalPage.referencedBit) {

          pagesToClearRBit.push(logicalPage.id);

          currentHandPos = (currentHandPos + 1) % numFrames;
        } else {

          return {
            victimFrameId: frame.frameId,
            victimLogicalPageId: frame.logicalPageId,
            nextScHandPosition: (currentHandPos + 1) % numFrames,
            pagesWhoseRBitShouldBeCleared: pagesToClearRBit,
          };
        }
      } else {
         // Marco ocupado pero sin página lógica mapeada? Error.
         currentHandPos = (currentHandPos + 1) % numFrames; // Avanzar para evitar bucle infinito
      }
    } else {
        currentHandPos = (currentHandPos + 1) % numFrames;
    }

    const occupiedFrameCount = context.ramFrames.filter(f => f.isOccupied).length;
    if (pagesToClearRBit.length >= occupiedFrameCount && occupiedFrameCount > 0) {

        const originalHandFrame = context.ramFrames[context.scHandPosition === undefined ? 0 : context.scHandPosition];
         if (!originalHandFrame.isOccupied) throw new Error("[SC] Error: Fallback de SC a marco no ocupado.");
        return {
            victimFrameId: originalHandFrame.frameId,
            victimLogicalPageId: originalHandFrame.logicalPageId,
            nextScHandPosition: ( (context.scHandPosition === undefined ? 0 : context.scHandPosition) + 1) % numFrames,
            pagesWhoseRBitShouldBeCleared: pagesToClearRBit.filter(id => id !== originalHandFrame.logicalPageId),
        };
    }
  }
};

// --- MRU ---
export const mruAlgorithm: PageReplacementAlgorithmFn = (context) => {
  let mostRecentFrame: PageFrame | null = null;
  let mostRecentAccessTime = -1;

  for (const frame of context.ramFrames) {
    if (frame.isOccupied) {
      const logicalPage = getLogicalPageFromFrame(frame, context.mmu);
      if (logicalPage && logicalPage.ramLastAccessTimestamp !== undefined) {
        if (logicalPage.ramLastAccessTimestamp > mostRecentAccessTime) {
          mostRecentAccessTime = logicalPage.ramLastAccessTimestamp;
          mostRecentFrame = frame;
        }
      } else if (logicalPage && !mostRecentFrame) {
        mostRecentFrame = frame; 
      }
    }
  }

  if (!mostRecentFrame) {
    throw new Error("[MRU] No hay marcos ocupados para elegir una víctima.");
  }
  return {
    victimFrameId: mostRecentFrame.frameId,
    victimLogicalPageId: mostRecentFrame.logicalPageId,
  };
};

// --- LRU ---
export const lruAlgorithm: PageReplacementAlgorithmFn = (context) => {
  let mostRecentFrame: PageFrame | null = null;
  let mostRecentAccessTime = Infinity;

  for (const frame of context.ramFrames) {
    if (frame.isOccupied) {
      const logicalPage = getLogicalPageFromFrame(frame, context.mmu);
      if (logicalPage && logicalPage.ramLastAccessTimestamp !== undefined) {
        if (logicalPage.ramLastAccessTimestamp < mostRecentAccessTime) {
          mostRecentAccessTime = logicalPage.ramLastAccessTimestamp;
          mostRecentFrame = frame;
        }
      } else if (logicalPage && !mostRecentFrame) {
        mostRecentFrame = frame;
      }
    }
  }

  if (!mostRecentFrame) {
    throw new Error("[MRU] No hay marcos ocupados para elegir una víctima.");
  }
  return {
    victimFrameId: mostRecentFrame.frameId,
    victimLogicalPageId: mostRecentFrame.logicalPageId,
  };
};

// --- RND---
export const rndAlgorithm: PageReplacementAlgorithmFn = (context) => {
  const occupiedFrames = context.ramFrames.filter(f => f.isOccupied);
  if (occupiedFrames.length === 0) {
    throw new Error("[RND] No hay marcos ocupados para elegir una víctima.");
  }
  const randomIndex = Math.floor(context.rng() * occupiedFrames.length);
  const victimFrame = occupiedFrames[randomIndex];
  return {
    victimFrameId: victimFrame.frameId,
    victimLogicalPageId: victimFrame.logicalPageId,
  };
};

// --- OPT---
export const optAlgorithm: PageReplacementAlgorithmFn = (context) => {
  const { ramFrames, mmu, futureOperations, currentOperationIndex, pageToLoad } = context;

  if (!futureOperations || currentOperationIndex === undefined) {
    throw new Error("[OPT] Faltan operaciones futuras o el índice actual para tomar una decisión.");
  }

  const occupiedFrames = ramFrames.filter(f => f.isOccupied);
  if (occupiedFrames.length === 0) {
    throw new Error("[OPT] No hay marcos ocupados para elegir una víctima.");
  }

  let victimFrame: PageFrame | null = null;
  let farthestNextUseDistance = -1;

  for (const frame of occupiedFrames) {
    const logicalPageInFrame = getLogicalPageFromFrame(frame, mmu);
    if (!logicalPageInFrame) continue; // Debería tener una página lógica si está ocupado

    let currentFrameNextUseDistance = Infinity; // Distancia a la próxima vez que esta página se usa

    for (let i = currentOperationIndex; i < futureOperations.length; i++) {
      const futureOp = futureOperations[i];
      let usesThisPage = false;

      if (futureOp.type === 'use' && futureOp.ptrId === logicalPageInFrame.ptrId) {

        usesThisPage = true;
      }

      if (usesThisPage) {
        currentFrameNextUseDistance = i - currentOperationIndex;
        break; 
      }
    }

    if (currentFrameNextUseDistance > farthestNextUseDistance) {
      farthestNextUseDistance = currentFrameNextUseDistance;
      victimFrame = frame;
    }
  }

  if (!victimFrame) {

    victimFrame = occupiedFrames[0];
  }
  
  return {
    victimFrameId: victimFrame!.frameId,
    victimLogicalPageId: victimFrame!.logicalPageId,
  };
};

// --- Mapa de Algoritmos ---
export const pageReplacementAlgorithms: Record<AlgorithmName, PageReplacementAlgorithmFn | null> = {
  FIFO: fifoAlgorithm,
  SC: scAlgorithm,
  MRU: mruAlgorithm,
  LRU: lruAlgorithm,
  RND: rndAlgorithm,
  OPT: optAlgorithm,
};
