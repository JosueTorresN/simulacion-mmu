import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SimulationParameters } from './SetupScreen';
import type {
  AlgorithmName,
  ProcessInstruction,
  PageFrame,
  LogicalPage,
  AlgorithmMetrics,
  AlgorithmSimulationState,
  PageReplacementContext,
  PageReplacementDecision,
} from './types';
import { pageReplacementAlgorithms } from './algorithms';
import { ChevronLeft, Pause, Play as PlayIcon, RefreshCw } from 'lucide-react';
import seedrandom from 'seedrandom';

const PAGE_SIZE_BYTES = 4 * 1024; // 4KB
const PAGE_SIZE_KB = 4;
const TOTAL_RAM_FRAMES = 100; // 400KB RAM / 4KB por página = 100 marcos
const TOTAL_RAM_KB = TOTAL_RAM_FRAMES * PAGE_SIZE_KB;

const HIT_TIME = 1; // 1s
const FAULT_TIME = 5; // 5s (incluye acceso a disco)

// --- Componentes de UI Internos
interface RamViewProps {
  pages: PageFrame[];
  pageSizeKb: number;
  mmu: ReadonlyArray<LogicalPage>; // Para obtener color por PID
}

const getPageColorByPid = (pid: string | undefined): string => {
    if (!pid) return 'bg-gray-400'; // Color para marcos libres o sin PID
    const colors = [
        'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
        'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-lime-500',
        'bg-cyan-500', 'bg-rose-500', 'bg-fuchsia-500', 'bg-sky-500', 'bg-emerald-500'
    ];
    let hash = 0;
    for (let i = 0; i < pid.length; i++) {
        hash = pid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const RamView: React.FC<RamViewProps> = ({ pages, pageSizeKb, mmu }) => {
  const totalRamKb = pages.length * pageSizeKb;
  return (
    <div className="mb-4 p-3 bg-gray-700 rounded-lg shadow">
      <h4 className="text-sm font-semibold text-cyan-300 mb-2">RAM ({totalRamKb}KB)</h4>
      <div className="grid grid-cols-20 grid-rows-5 h-28 bg-gray-600 rounded overflow-hidden border border-gray-500">
        {pages.map((frame) => {
          const logicalPage = frame.isOccupied && frame.logicalPageId ? mmu.find(p => p.id === frame.logicalPageId) : undefined;
          const color = frame.isOccupied && logicalPage ? getPageColorByPid(logicalPage.pid) : 'bg-gray-400';
          return (
            <div
              key={`ram-frame-${frame.frameId}`}
              title={`Marco ${frame.frameId}${frame.isOccupied && logicalPage ? ` - PID: ${logicalPage.pid} - Pág.Lógica: ${logicalPage.id}` : ' - Libre'}`}
              className={`w-full h-full border-r border-b border-gray-500 ${color} hover:opacity-80 transition-opacity`}
            />
          );
        })}
      </div>
    </div>
  );
};

interface MmuTableViewProps {
  logicalPages: ReadonlyArray<LogicalPage>;
  pageSizeKb: number;
}
const MmuTableView: React.FC<MmuTableViewProps> = ({ logicalPages, pageSizeKb }) => {
  if (logicalPages.length === 0) {
    return <p className="text-sm text-gray-400 italic">No hay páginas en la MMU actualmente.</p>;
  }
  return (
    <div className="mb-4 max-h-60 overflow-y-auto bg-gray-700 p-3 rounded-lg shadow">
      <h4 className="text-sm font-semibold text-cyan-300 mb-2">Tabla de Páginas Lógicas (MMU)</h4>
      <table className="w-full text-xs text-left">
        <thead className="text-gray-300 bg-gray-600">
          <tr>
            <th className="p-1.5">ID Pág. Lógica</th>
            <th className="p-1.5">PID</th>
            <th className="p-1.5">ptrId</th>
            <th className="p-1.5">Índice</th>
            <th className="p-1.5">En RAM</th>
            <th className="p-1.5">Marco RAM</th>
            <th className="p-1.5">Dir. Disco</th>
            <th className="p-1.5">Cargada (T)</th>
            <th className="p-1.5">Últ. Acceso (T)</th>
            <th className="p-1.5">Bit R (SC)</th>
            <th className="p-1.5">Cont. (B)</th>
          </tr>
        </thead>
        <tbody className="text-gray-200">
          {logicalPages.map((p) => (
            <tr key={p.id} className="border-b border-gray-600 hover:bg-gray-650 transition-colors">
              <td className="p-1.5 truncate max-w-[80px]" title={p.id}>{p.id}</td>
              <td className="p-1.5">{p.pid}</td>
              <td className="p-1.5">{p.ptrId}</td>
              <td className="p-1.5">{p.pageIndexInPtr}</td>
              <td className="p-1.5">{p.isLoadedInRam ? 'Sí' : 'No'}</td>
              <td className="p-1.5">{p.isLoadedInRam && p.frameId !== undefined ? p.frameId : '-'}</td>
              <td className="p-1.5">{!p.isLoadedInRam && p.diskAddress ? p.diskAddress : '-'}</td>
              <td className="p-1.5">{p.ramLoadTimestamp ?? '-'}</td>
              <td className="p-1.5">{p.ramLastAccessTimestamp ?? '-'}</td>
              <td className="p-1.5">{p.referencedBit === undefined ? '-' : (p.referencedBit ? '1' : '0')}</td>
              <td className="p-1.5">{p.contentSizeBytes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface MetricsDisplayProps {
  metrics: AlgorithmMetrics;
}
const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  const thrashingDisplayPercentage = metrics.totalSimulationTime > 0 ? (metrics.thrashingTime / metrics.totalSimulationTime) * 100 : 0;
  metrics.thrashingPercentage = thrashingDisplayPercentage;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-gray-700 p-3 rounded-lg shadow">
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">Procesos Corriendo:</span> {metrics.runningProcessesCount}</div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">Tiempo Total:</span> {metrics.totalSimulationTime.toFixed(0)}s</div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">RAM Usada:</span> {metrics.ramUsedKb.toFixed(0)}KB ({metrics.ramUsedPercentage.toFixed(1)}%)</div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">V-RAM Usada:</span> {metrics.vRamUsedKb.toFixed(0)}KB ({metrics.vRamUsedPercentageOfRam.toFixed(1)}% de RAM)</div>
      <div className={`bg-gray-600 p-1.5 rounded ${thrashingDisplayPercentage > 50 ? 'text-red-400 border border-red-500' : ''}`}>
        <span className="font-semibold">Thrashing:</span> {metrics.thrashingTime.toFixed(0)}s ({thrashingDisplayPercentage.toFixed(1)}%)
      </div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">Frag. Interna:</span> {metrics.internalFragmentationKb.toFixed(2)}KB</div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">Page Faults:</span> {metrics.pageFaults}</div>
      <div className="bg-gray-600 p-1.5 rounded"><span className="font-semibold text-cyan-400">Page Hits:</span> {metrics.pageHits}</div>
    </div>
  );
};

interface AlgorithmVisualizerProps {
  simState: AlgorithmSimulationState;
  pageSizeKb: number;
}
const AlgorithmVisualizer: React.FC<AlgorithmVisualizerProps> = ({ simState, pageSizeKb }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-full">
      <h3 className="text-xl font-bold text-center text-cyan-400 mb-3">{simState.algorithmName}</h3>
      <RamView pages={simState.ramFrames} pageSizeKb={pageSizeKb} mmu={simState.mmu} />
      <MmuTableView logicalPages={simState.mmu} pageSizeKb={pageSizeKb} />
      <MetricsDisplay metrics={simState.metrics} />
    </div>
  );
};


// --- Lógica Principal de Simulación ---
interface SimulationScreenProps {
  params: SimulationParameters;
  operations: ProcessInstruction[];
  initialNextPtrId: number;
  onBackToSetup: () => void;
}

const getInitialAlgorithmSimulationState = (
  name: AlgorithmName,
  seed: string,
  initialPtrId: number
): AlgorithmSimulationState => {
  const ramFrames: PageFrame[] = Array(TOTAL_RAM_FRAMES).fill(null).map((_, i) => ({
    frameId: i,
    isOccupied: false,
  }));
  return {
    algorithmName: name,
    ramFrames,
    mmu: [],
    metrics: {
      algorithmName: name,
      pageFaults: 0,
      pageHits: 0,
      runningProcessesCount: 0,
      totalSimulationTime: 0,
      ramUsedKb: 0,
      ramUsedPercentage: 0,
      vRamUsedKb: 0,
      vRamUsedPercentageOfRam: 0,
      thrashingTime: 0,
      internalFragmentationKb: 0,
    },
    scHandPosition: 0,
    nextPtrIdToAssign: initialPtrId,
    activePointers: new Map<number, { pid: string; pageIds: string[] }>(),
    rng: seedrandom(seed + name),
  };
};


export const SimulationScreen: React.FC<SimulationScreenProps> = ({ params, operations, initialNextPtrId, onBackToSetup }) => {
  const [optSimState, setOptSimState] = useState<AlgorithmSimulationState>(() =>
    getInitialAlgorithmSimulationState('OPT', params.seed, initialNextPtrId)
  );
  const [selectedAlgoSimState, setSelectedAlgoSimState] = useState<AlgorithmSimulationState>(() =>
    getInitialAlgorithmSimulationState(params.selectedAlgorithm, params.seed, initialNextPtrId)
  );

  const [isPaused, setIsPaused] = useState(true);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);
  const [simulationSpeedMs, setSimulationSpeedMs] = useState(1000); // ms por operación

  const processAlgorithmStep = useCallback((
    currentSimState: AlgorithmSimulationState,
    operation: ProcessInstruction,
    allOpsForOpt: ProcessInstruction[],
    currentOpIdxForOpt: number
  ): AlgorithmSimulationState => {
    
    let newState = JSON.parse(JSON.stringify(currentSimState)) as AlgorithmSimulationState; // Deep copy
    newState.rng = currentSimState.rng; 
    newState.activePointers = new Map(currentSimState.activePointers);


    const { algorithmName, rng } = newState;
    const algoFn = pageReplacementAlgorithms[algorithmName];

    // --- 1. Manejar la operación ---
    switch (operation.type) {
      case 'new': {
        const { pid, size, ptrId: assignedPtrId } = operation;
        if (size === undefined || assignedPtrId === undefined) {
          console.error(`[${algorithmName}] Operación 'new' inválida:`, operation);
          break;
        }

        const numPagesNeeded = Math.ceil(size / PAGE_SIZE_BYTES);
        const newLogicalPageIds: string[] = [];

        for (let i = 0; i < numPagesNeeded; i++) {
          const logicalPageId = `ptr${assignedPtrId}_page${i}_pid${pid}`;
          newLogicalPageIds.push(logicalPageId);
          const contentSize = (i === numPagesNeeded - 1) ? (size % PAGE_SIZE_BYTES || PAGE_SIZE_BYTES) : PAGE_SIZE_BYTES;
          
          let newPage: LogicalPage = {
            id: logicalPageId,
            pid,
            ptrId: assignedPtrId,
            pageIndexInPtr: i,
            isLoadedInRam: false,
            contentSizeBytes: contentSize,
            diskAddress: `disk_${logicalPageId}`,
            referencedBit: algorithmName === 'SC' ? false : undefined,
          };
          newState.mmu.push(newPage);
          newState.metrics.vRamUsedKb += PAGE_SIZE_KB;

          // Intentar cargar en RAM
          const freeFrame = newState.ramFrames.find(f => !f.isOccupied);
          if (freeFrame) {
            newPage.isLoadedInRam = true;
            newPage.frameId = freeFrame.frameId;
            newPage.diskAddress = undefined;
            newPage.ramLoadTimestamp = newState.metrics.totalSimulationTime;
            newPage.ramLastAccessTimestamp = newState.metrics.totalSimulationTime;
            
            freeFrame.isOccupied = true;
            freeFrame.logicalPageId = newPage.id;
            freeFrame.pid = pid;
            freeFrame.loadedTimestamp = newState.metrics.totalSimulationTime;
            freeFrame.lastAccessTimestamp = newState.metrics.totalSimulationTime;
            freeFrame.referencedBit = newPage.referencedBit;

            newState.metrics.pageHits++;
            newState.metrics.totalSimulationTime += HIT_TIME;
            newState.metrics.ramUsedKb += PAGE_SIZE_KB;
            newState.metrics.vRamUsedKb -= PAGE_SIZE_KB; // Se movió de VRAM a RAM
          } else { // No hay marcos libres, se requiere reemplazo (fallo de página)
            newState.metrics.pageFaults++;
            newState.metrics.totalSimulationTime += FAULT_TIME;
            newState.metrics.thrashingTime += FAULT_TIME;

            if (!algoFn) {
              console.error(`[${algorithmName}] Algoritmo de reemplazo no encontrado!`);
              break; 
            }
            const replacementContext: PageReplacementContext = {
              ramFrames: newState.ramFrames,
              mmu: newState.mmu,
              pageToLoad: newPage,
              futureOperations: algorithmName === 'OPT' ? allOpsForOpt : undefined,
              currentOperationIndex: algorithmName === 'OPT' ? currentOpIdxForOpt : undefined,
              scHandPosition: newState.scHandPosition,
              rng: rng!,
            };
            const decision = algoFn(replacementContext);
            
            const victimFrame = newState.ramFrames[decision.victimFrameId];
            if (victimFrame.logicalPageId) { // Desalojar página víctima
              const victimLogicalPage = newState.mmu.find(p => p.id === victimFrame.logicalPageId);
              if (victimLogicalPage) {
                victimLogicalPage.isLoadedInRam = false;
                victimLogicalPage.frameId = undefined;
                victimLogicalPage.diskAddress = `disk_${victimLogicalPage.id}`;
                // No se resta de ramUsedKb aquí, se hace al cargar la nueva.
                // vRamUsedKb aumenta porque la víctima va a disco.
                newState.metrics.vRamUsedKb += PAGE_SIZE_KB;
              }
            }
            
            // Cargar nueva página en el marco de la víctima
            newPage.isLoadedInRam = true;
            newPage.frameId = victimFrame.frameId;
            newPage.diskAddress = undefined;
            newPage.ramLoadTimestamp = newState.metrics.totalSimulationTime;
            newPage.ramLastAccessTimestamp = newState.metrics.totalSimulationTime;

            victimFrame.isOccupied = true;
            victimFrame.logicalPageId = newPage.id;
            victimFrame.pid = pid;
            victimFrame.loadedTimestamp = newState.metrics.totalSimulationTime;
            victimFrame.lastAccessTimestamp = newState.metrics.totalSimulationTime;
            victimFrame.referencedBit = newPage.referencedBit;
            
            newState.metrics.ramUsedKb += PAGE_SIZE_KB; // La nueva página usa RAM
            newState.metrics.vRamUsedKb -= PAGE_SIZE_KB; // Se movió de VRAM a RAM

            // Manejo especial para SC post-decisión
            if (algorithmName === 'SC') {
                newState.scHandPosition = decision.nextScHandPosition;
                decision.pagesWhoseRBitShouldBeCleared?.forEach(idToClear => {
                    const pageToUpdate = newState.mmu.find(p => p.id === idToClear);
                    if (pageToUpdate && pageToUpdate.isLoadedInRam) {
                        pageToUpdate.referencedBit = false;
                        const frameOfPage = newState.ramFrames.find(f => f.logicalPageId === idToClear);
                        if (frameOfPage) frameOfPage.referencedBit = false;
                    }
                });
            }
          }
        }
        newState.activePointers.set(assignedPtrId, { pid, pageIds: newLogicalPageIds });
        newState.nextPtrIdToAssign = Math.max(newState.nextPtrIdToAssign, assignedPtrId + 1);
        break;
      }
      case 'use': {
        const { ptrId } = operation;
        if (ptrId === undefined) break;
        const pointerInfo = newState.activePointers.get(ptrId);
        if (!pointerInfo) {
          console.warn(`[${algorithmName}] Intento de usar ptrId ${ptrId} no existente o no activo.`);
          break;
        }

        for (const logicalPageId of pointerInfo.pageIds) {
            const page = newState.mmu.find(p => p.id === logicalPageId);
            if (!page) continue;

            page.ramLastAccessTimestamp = newState.metrics.totalSimulationTime; // Actualizar incluso si ya está en RAM
            if (algorithmName === 'SC') page.referencedBit = true; // Marcar como referenciada para SC

            const frameInRam = page.isLoadedInRam ? newState.ramFrames.find(f => f.frameId === page.frameId) : null;
            if (frameInRam) { // Page Hit
                frameInRam.lastAccessTimestamp = newState.metrics.totalSimulationTime;
                if (algorithmName === 'SC') frameInRam.referencedBit = true;
                newState.metrics.pageHits++;
                newState.metrics.totalSimulationTime += HIT_TIME;
            } else { // Page Fault
                newState.metrics.pageFaults++;
                newState.metrics.totalSimulationTime += FAULT_TIME;
                newState.metrics.thrashingTime += FAULT_TIME;

                const freeFrame = newState.ramFrames.find(f => !f.isOccupied);
                let targetFrameId = -1;

                if (freeFrame) {
                    targetFrameId = freeFrame.frameId;
                } else { // No hay marcos libres, se requiere reemplazo
                    if (!algoFn) { console.error(`[${algorithmName}] Algoritmo de reemplazo no encontrado!`); break; }
                    const replacementContext: PageReplacementContext = {
                        ramFrames: newState.ramFrames, mmu: newState.mmu, pageToLoad: page,
                        futureOperations: algorithmName === 'OPT' ? allOpsForOpt : undefined,
                        currentOperationIndex: algorithmName === 'OPT' ? currentOpIdxForOpt : undefined,
                        scHandPosition: newState.scHandPosition, rng: rng!,
                    };
                    const decision = algoFn(replacementContext);
                    targetFrameId = decision.victimFrameId;

                    const victimFrameToEvict = newState.ramFrames[targetFrameId];
                    if (victimFrameToEvict.logicalPageId) {
                        const victimLogicalPage = newState.mmu.find(p => p.id === victimFrameToEvict.logicalPageId);
                        if (victimLogicalPage) {
                            victimLogicalPage.isLoadedInRam = false;
                            victimLogicalPage.frameId = undefined;
                            victimLogicalPage.diskAddress = `disk_${victimLogicalPage.id}`;
                            newState.metrics.vRamUsedKb += PAGE_SIZE_KB; // Víctima a disco
                            // ramUsedKb no cambia aún, la nueva página ocupa este espacio.
                        }
                    }
                     if (algorithmName === 'SC') { // Manejo SC post-decisión
                        newState.scHandPosition = decision.nextScHandPosition;
                        decision.pagesWhoseRBitShouldBeCleared?.forEach(idToClear => {
                            const pageToUpdate = newState.mmu.find(p => p.id === idToClear);
                            if (pageToUpdate && pageToUpdate.isLoadedInRam) {
                                pageToUpdate.referencedBit = false;
                                const frameOfPage = newState.ramFrames.find(f => f.logicalPageId === idToClear);
                                if (frameOfPage) frameOfPage.referencedBit = false;
                            }
                        });
                    }
                }
                
                // Cargar la página requerida en targetFrameId
                const frameToLoadInto = newState.ramFrames[targetFrameId];
                page.isLoadedInRam = true;
                page.frameId = frameToLoadInto.frameId;
                page.diskAddress = undefined;
                page.ramLoadTimestamp = newState.metrics.totalSimulationTime; // Nuevo tiempo de carga

                frameToLoadInto.isOccupied = true;
                frameToLoadInto.logicalPageId = page.id;
                frameToLoadInto.pid = page.pid;
                frameToLoadInto.loadedTimestamp = page.ramLoadTimestamp;
                frameToLoadInto.lastAccessTimestamp = page.ramLastAccessTimestamp;
                frameToLoadInto.referencedBit = page.referencedBit;
                
                if (!freeFrame) newState.metrics.ramUsedKb += 0; // Si hubo reemplazo, el total de RAM usada no cambia por esta página
                else newState.metrics.ramUsedKb += PAGE_SIZE_KB; // Si usó frame libre
                
                newState.metrics.vRamUsedKb -= PAGE_SIZE_KB; // Se movió de VRAM a RAM
            }
        }
        break;
      }
      case 'delete': {
        const { ptrId } = operation;
        if (ptrId === undefined) break;
        const pointerInfo = newState.activePointers.get(ptrId);
        if (!pointerInfo) break;

        for (const logicalPageId of pointerInfo.pageIds) {
            const pageIndex = newState.mmu.findIndex(p => p.id === logicalPageId);
            if (pageIndex === -1) continue;
            const page = newState.mmu[pageIndex];

            if (page.isLoadedInRam && page.frameId !== undefined) {
                const frame = newState.ramFrames[page.frameId];
                frame.isOccupied = false;
                frame.logicalPageId = undefined;
                frame.pid = undefined;
                frame.loadedTimestamp = undefined;
                frame.lastAccessTimestamp = undefined;
                frame.referencedBit = undefined;
                newState.metrics.ramUsedKb -= PAGE_SIZE_KB;
            } else { // Estaba en disco
                newState.metrics.vRamUsedKb -= PAGE_SIZE_KB;
            }
            newState.mmu.splice(pageIndex, 1); // Eliminar de la MMU
        }
        newState.activePointers.delete(ptrId);
        break;
      }
      case 'kill': {
        const { pid } = operation;
        const ptrIdsToKill: number[] = [];
        newState.activePointers.forEach((info, ptrId) => {
            if (info.pid === pid) ptrIdsToKill.push(ptrId);
        });

        for (const ptrId of ptrIdsToKill) {
            const pointerInfo = newState.activePointers.get(ptrId);
            if (!pointerInfo) continue;
            for (const logicalPageId of pointerInfo.pageIds) {
                const pageIndex = newState.mmu.findIndex(p => p.id === logicalPageId);
                if (pageIndex === -1) continue;
                const page = newState.mmu[pageIndex];

                if (page.isLoadedInRam && page.frameId !== undefined) {
                    const frame = newState.ramFrames[page.frameId];
                    frame.isOccupied = false;
                    frame.logicalPageId = undefined;
                    frame.pid = undefined;
                    // ... limpiar otros campos del frame
                    newState.metrics.ramUsedKb -= PAGE_SIZE_KB;
                } else {
                    newState.metrics.vRamUsedKb -= PAGE_SIZE_KB;
                }
                newState.mmu.splice(pageIndex, 1);
            }
            newState.activePointers.delete(ptrId);
        }
        break;
      }
    }

    // --- 2. Actualizar Métricas Comunes
    const runningPids = new Set<string>();
    newState.activePointers.forEach(info => runningPids.add(info.pid));
    newState.metrics.runningProcessesCount = runningPids.size;

    newState.metrics.ramUsedPercentage = (newState.metrics.ramUsedKb / TOTAL_RAM_KB) * 100;
    newState.metrics.vRamUsedPercentageOfRam = newState.metrics.vRamUsedKb > 0 ? (newState.metrics.vRamUsedKb / TOTAL_RAM_KB) * 100 : 0;
    
    newState.metrics.internalFragmentationKb = 0;
    newState.ramFrames.forEach(frame => {
        if (frame.isOccupied && frame.logicalPageId) {
            const logicalPage = newState.mmu.find(p => p.id === frame.logicalPageId);
            if (logicalPage) {
                const wastedBytes = PAGE_SIZE_BYTES - logicalPage.contentSizeBytes;
                newState.metrics.internalFragmentationKb += wastedBytes / 1024;
            }
        }
    });
    
    return newState;
  }, []);


  const runSimulationStep = useCallback(() => {
    if (currentOperationIndex >= operations.length) {
      setIsPaused(true);
      console.log("Simulación completada!");
      return;
    }

    const currentOp = operations[currentOperationIndex];

    setOptSimState(prevState => processAlgorithmStep(prevState, currentOp, operations, currentOperationIndex));
    setSelectedAlgoSimState(prevState => processAlgorithmStep(prevState, currentOp, operations, currentOperationIndex));

    setCurrentOperationIndex(prev => prev + 1);
  }, [currentOperationIndex, operations, processAlgorithmStep]);

  useEffect(() => {
    if (!isPaused && currentOperationIndex < operations.length) {
      const timerId = setTimeout(runSimulationStep, simulationSpeedMs);
      return () => clearTimeout(timerId);
    }
  }, [isPaused, runSimulationStep, simulationSpeedMs, currentOperationIndex, operations.length]);

  const handleResetSimulation = () => {
    setCurrentOperationIndex(0);
    setOptSimState(getInitialAlgorithmSimulationState('OPT', params.seed, initialNextPtrId));
    setSelectedAlgoSimState(getInitialAlgorithmSimulationState(params.selectedAlgorithm, params.seed, initialNextPtrId));
    setIsPaused(true);
  };

  const handleSpeedChange = (newSpeedValue: string) => {
    setSimulationSpeedMs(Number(newSpeedValue));
  };
  
  const currentOpForDisplay = operations[currentOperationIndex];

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col items-center p-4 text-gray-100">
      <div className="w-full flex flex-col sm:flex-row justify-between items-center mb-6 p-4 bg-gray-800 rounded-lg shadow-md space-y-3 sm:space-y-0">
        <button
          onClick={onBackToSetup}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors flex items-center"
        >
          <ChevronLeft className="mr-2 h-5 w-5" /> Volver
        </button>
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            disabled={currentOperationIndex >= operations.length}
            className={`px-3 py-2 font-semibold rounded-lg transition-colors flex items-center text-sm
                        ${isPaused ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'}
                        disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPaused ? <PlayIcon className="mr-1.5 h-5 w-5" /> : <Pause className="mr-1.5 h-5 w-5" />}
            {isPaused ? (currentOperationIndex === 0 ? 'Iniciar' : (currentOperationIndex >= operations.length ? 'Fin' : 'Reanudar')) : 'Pausar'}
          </button>
          <button
            onClick={handleResetSimulation}
            className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center text-sm"
          >
            <RefreshCw className="mr-1.5 h-5 w-5" /> Reiniciar
          </button>
          <select 
            onChange={(e) => handleSpeedChange(e.target.value)} 
            value={simulationSpeedMs}
            className="bg-gray-700 text-white p-2 rounded-lg border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 outline-none text-sm"
          >
            <option value="2000">Lento (2s)</option>
            <option value="1000">Normal (1s)</option>
            <option value="500">Rápido (0.5s)</option>
            <option value="100">Muy Rápido (0.1s)</option>
          </select>
        </div>
        <div className="text-sm text-gray-300 text-center sm:text-right">
          Op: {Math.min(currentOperationIndex +1, operations.length)} / {operations.length}
        </div>
      </div>

      {currentOpForDisplay && !isPaused && (
        <div className="mb-4 p-3 bg-gray-700 rounded-lg shadow w-full max-w-xl text-center">
            <p className="text-sm text-cyan-300">
                Ejecutando Op #{currentOperationIndex}: <span className="font-mono text-yellow-400">{currentOpForDisplay.type.toUpperCase()}</span>
                {currentOpForDisplay.pid && ` PID: ${currentOpForDisplay.pid}`}
                {currentOpForDisplay.ptrId !== undefined && ` PtrID: ${currentOpForDisplay.ptrId}`}
                {currentOpForDisplay.size !== undefined && ` Tamaño: ${currentOpForDisplay.size}B`}
            </p>
        </div>
      )}

      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlgorithmVisualizer simState={optSimState} pageSizeKb={PAGE_SIZE_KB} />
        <AlgorithmVisualizer simState={selectedAlgoSimState} pageSizeKb={PAGE_SIZE_KB} />
      </div>
    </div>
  );
};
