// algorithms.ts
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

// --- FIFO (First-In, First-Out) ---
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

// --- SC (Second Chance) ---
// La lógica principal de SC (manejo de manecilla y R-bits) se gestionará en SimulationScreen
// para mantener este archivo más centrado en la "decisión" pura si es posible,
// o este algoritmo devolverá más información para que SimulationScreen actúe.
// Para SC, la PageReplacementDecision podría necesitar incluir la próxima posición de la manecilla
// y qué bits R deben limpiarse.
export const scAlgorithm: PageReplacementAlgorithmFn = (context) => {
  const numFrames = context.ramFrames.length;
  let currentHandPos = context.scHandPosition === undefined ? 0 : context.scHandPosition;
  const pagesToClearRBit: string[] = [];

  // Bucle para simular el movimiento de la manecilla del reloj
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const frame = context.ramFrames[currentHandPos];
    if (frame.isOccupied) {
      const logicalPage = getLogicalPageFromFrame(frame, context.mmu);
      if (logicalPage) {
        if (logicalPage.referencedBit) {
          // Dar segunda oportunidad: marcar para limpiar el bit R y avanzar manecilla.
          // La limpieza real del bit (logicalPage.referencedBit = false) la hará SimulationScreen.
          pagesToClearRBit.push(logicalPage.id);
          // Avanzar manecilla
          currentHandPos = (currentHandPos + 1) % numFrames;
        } else {
          // Encontró una víctima (R=0)
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
        // Marco no ocupado, la simulación no debería llamar a reemplazo si hay marcos libres.
        // Si llega aquí, es un error o un marco vacío en medio del escaneo.
        currentHandPos = (currentHandPos + 1) % numFrames;
    }

    // Evitar bucles infinitos si todos los bits R se limpian en una pasada y volvemos al inicio.
    // Si pagesToClearRBit.length == número de páginas ocupadas, significa que todas tenían R=1.
    // En ese caso, la primera que se encontró (la de currentHandPos original) es la víctima (comportamiento FIFO).
    const occupiedFrameCount = context.ramFrames.filter(f => f.isOccupied).length;
    if (pagesToClearRBit.length >= occupiedFrameCount && occupiedFrameCount > 0) {
        // Todas las páginas ocupadas tenían R=1 y fueron marcadas para limpiar.
        // La víctima es la página en la posición original de la manecilla.
        const originalHandFrame = context.ramFrames[context.scHandPosition === undefined ? 0 : context.scHandPosition];
         if (!originalHandFrame.isOccupied) throw new Error("[SC] Error: Fallback de SC a marco no ocupado.");
        return {
            victimFrameId: originalHandFrame.frameId,
            victimLogicalPageId: originalHandFrame.logicalPageId,
            nextScHandPosition: ( (context.scHandPosition === undefined ? 0 : context.scHandPosition) + 1) % numFrames,
            pagesWhoseRBitShouldBeCleared: pagesToClearRBit.filter(id => id !== originalHandFrame.logicalPageId), // No limpiar el R bit de la víctima
        };
    }
  }
};

// --- MRU (Most Recently Used) ---
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
        // Caso borde: si alguna página no tiene timestamp pero otras sí, o es la primera.
        mostRecentFrame = frame; // Tomar la primera ocupada si no hay timestamps.
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

// --- RND (Random) ---
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

// --- OPT (Optimal) ---
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
        // Asumimos que ptrId es suficiente para identificar el uso de la página.
        // Una comprobación más estricta verificaría el PID si ptrId no es globalmente único en ProcessInstruction.
        // O si 'use' pudiera referirse a una página específica dentro del ptrId.
        // Dado que ptrId es global y 'use' afecta a todas las páginas del ptrId, esta lógica es una aproximación.
        // OPT idealmente sabe exactamente qué *página lógica* se usará.
        // Si la `ProcessInstruction` se refiere a un `ptrId`, todas las `LogicalPage` de ese `ptrId` se consideran usadas.
        usesThisPage = true;
      }
      // Podríamos añadir lógica para 'new' si sobrescribe o si el PID es relevante.
      // Pero OPT clásico se centra en 'use'.

      if (usesThisPage) {
        currentFrameNextUseDistance = i - currentOperationIndex;
        break; // Encontrada la próxima vez que se usa esta página
      }
    }

    if (currentFrameNextUseDistance > farthestNextUseDistance) {
      farthestNextUseDistance = currentFrameNextUseDistance;
      victimFrame = frame;
    }
  }

  if (!victimFrame) {
    // Si victimFrame sigue siendo null, significa que todas las páginas ocupadas
    // o no se usan más (distancia Infinita, y la primera de ellas fue elegida)
    // o hubo un error. Por seguridad, tomar la primera ocupada.
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
  SC: scAlgorithm, // SC puede necesitar manejo especial en SimulationScreen
  MRU: mruAlgorithm,
  RND: rndAlgorithm,
  OPT: optAlgorithm,
};
