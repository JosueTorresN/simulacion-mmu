// Pantalla que muestra la simulación de los algoritmos.
import React, { useState, useEffect, useCallback } from 'react';
import type { SimulationParameters } from './SetupScreen'; // Asumiendo que está en el mismo directorio
import type { AlgorithmName } from './types'; // Asegúrate de que la ruta sea correcta
import type { PageRepresentation } from './types'; // Asegúrate de que la ruta sea correcta
import type { ProcessInstruction } from './types'; // Asegúrate de que la ruta sea correcta
import type { MmuPageDetail } from './types'; // Asegúrate de que la ruta sea correcta
import type { AlgorithmMetrics } from './types'; // Asegúrate de que la ruta sea correcta
import { ChevronLeft, Pause, Play as PlayIcon, FastForward, RefreshCw } from 'lucide-react'; // Play renombrado a PlayIcon

// --- Componentes Internos de Simulación ---

interface RamViewProps {
  pages: PageRepresentation[]; // Array de 100 páginas
  pageSizeKb: number;
}

const RamView: React.FC<RamViewProps> = ({ pages, pageSizeKb }) => {
  const totalRamKb = pages.length * pageSizeKb;
  return (
    <div className="mb-4 p-3 bg-gray-700 rounded-lg shadow">
      <h4 className="text-sm font-semibold text-cyan-300 mb-2">RAM ({totalRamKb}KB)</h4>
      <div className="flex flex-wrap h-20 bg-gray-600 rounded overflow-hidden border border-gray-500">
        {pages.map((page, index) => (
          <div
            key={page.id || `ram-${index}`} // Usar page.id si está disponible y es único
            title={`Página ${index} (ID: ${page.id || 'N/A'})${page.pid ? ` - PID: ${page.pid}` : ''}${page.isLoadedInRam ? ' - Ocupada' : ' - Libre'}`}
            className={`w-[1%] h-full border-r border-b border-gray-500 ${
              page.isLoadedInRam && page.pid ? (getPageColor(page.pid)) : 'bg-gray-400'
            } hover:opacity-80 transition-opacity`}
          />
        ))}
      </div>
    </div>
  );
};
// Función para asignar colores a los PIDs (simple, para demostración)
const getPageColor = (pid: string): string => {
    const colors = [
        'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
        'bg-pink-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-lime-500'
    ];
    const hash = pid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
};


interface MmuTableViewProps {
  pageDetails: MmuPageDetail[];
}
const MmuTableView: React.FC<MmuTableViewProps> = ({ pageDetails }) => {
  if (pageDetails.length === 0) {
    return <p className="text-sm text-gray-400 italic">No hay páginas en la MMU actualmente.</p>;
  }
  return (
    <div className="mb-4 max-h-60 overflow-y-auto bg-gray-700 p-3 rounded-lg shadow">
      <h4 className="text-sm font-semibold text-cyan-300 mb-2">Tabla MMU</h4>
      <table className="w-full text-xs text-left">
        <thead className="text-gray-300 bg-gray-600">
          <tr>
            <th className="p-2">Page ID</th>
            <th className="p-2">PID</th>
            <th className="p-2">En RAM</th>
            <th className="p-2">M-Addr</th>
            <th className="p-2">D-Addr</th>
            <th className="p-2">Cargada (T)</th>
            <th className="p-2">Marca</th>
          </tr>
        </thead>
        <tbody className="text-gray-200">
          {pageDetails.map((p) => (
            <tr key={p.id} className="border-b border-gray-600 hover:bg-gray-650 transition-colors">
              <td className="p-2">{p.id}</td>
              <td className="p-2">{p.pid || '-'}</td>
              <td className="p-2">{p.isLoadedInRam ? 'Sí' : 'No'}</td>
              <td className="p-2">{p.isLoadedInRam ? p.physicalAddress : '-'}</td>
              <td className="p-2">{!p.isLoadedInRam ? p.diskAddress : '-'}</td>
              <td className="p-2">{p.loadedTimestamp || '-'}</td>
              <td className="p-2">{p.mark || '-'}</td>
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
  const thrashingPercentage = metrics.totalSimulationTime > 0 ? (metrics.thrashingTime / metrics.totalSimulationTime) * 100 : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs bg-gray-700 p-3 rounded-lg shadow">
      <div className="bg-gray-600 p-2 rounded">
        <span className="font-semibold text-cyan-400">Procesos Corriendo:</span> {metrics.runningProcessesCount}
      </div>
      <div className="bg-gray-600 p-2 rounded">
        <span className="font-semibold text-cyan-400">Tiempo Total:</span> {metrics.totalSimulationTime}s
      </div>
      <div className="bg-gray-600 p-2 rounded">
        <span className="font-semibold text-cyan-400">RAM Usada:</span> {metrics.ramUsedKb}KB ({metrics.ramUsedPercentage.toFixed(1)}%)
      </div>
      <div className="bg-gray-600 p-2 rounded">
        <span className="font-semibold text-cyan-400">V-RAM Usada:</span> {metrics.vRamUsedKb}KB ({metrics.vRamUsedPercentageOfRam.toFixed(1)}% de RAM)
      </div>
      <div className={`bg-gray-600 p-2 rounded ${thrashingPercentage > 50 ? 'text-red-400 border border-red-500' : ''}`}>
        <span className="font-semibold ">Thrashing:</span> {metrics.thrashingTime}s ({thrashingPercentage.toFixed(1)}%)
      </div>
      <div className="bg-gray-600 p-2 rounded">
        <span className="font-semibold text-cyan-400">Fragmentación Interna:</span> {metrics.internalFragmentationKb}KB
      </div>
    </div>
  );
};


interface AlgorithmVisualizerProps {
  algorithmName: string;
  ramPages: PageRepresentation[];
  mmuPageDetails: MmuPageDetail[];
  metrics: AlgorithmMetrics;
  pageSizeKb: number;
}
const AlgorithmVisualizer: React.FC<AlgorithmVisualizerProps> = ({ algorithmName, ramPages, mmuPageDetails, metrics, pageSizeKb }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-xl w-full">
      <h3 className="text-xl font-bold text-center text-cyan-400 mb-3">{algorithmName}</h3>
      <RamView pages={ramPages} pageSizeKb={pageSizeKb} />
      <MmuTableView pageDetails={mmuPageDetails} />
      <MetricsDisplay metrics={metrics} />
    </div>
  );
};

// --- Componente Principal de la Pantalla de Simulación ---
interface SimulationScreenProps {
  params: SimulationParameters;
  operations: ProcessInstruction[];
  onBackToSetup: () => void;
}

// Estado inicial para un algoritmo (placeholder)
const getInitialAlgorithmState = (name: string): { ram: PageRepresentation[], mmu: MmuPageDetail[], metrics: AlgorithmMetrics } => {
  const initialRamPages: PageRepresentation[] = Array(100).fill(null).map((_, i) => ({
    id: `ram_page_${name}_${i}`,
    isLoadedInRam: false,
    pid: undefined,
    physicalAddress: i, // Marco de página
  }));
  return {
    ram: initialRamPages,
    mmu: [],
    metrics: {
      runningProcessesCount: 0,
      totalSimulationTime: 0,
      ramUsedKb: 0,
      ramUsedPercentage: 0,
      vRamUsedKb: 0,
      vRamUsedPercentageOfRam: 0,
      thrashingTime: 0,
      internalFragmentationKb: 0,
    },
  };
};


export const SimulationScreen: React.FC<SimulationScreenProps> = ({ params, operations, onBackToSetup }) => {
  const PAGE_SIZE_KB = 4;
  const TOTAL_RAM_PAGES = 100; // 400KB / 4KB per page

  // Estados para cada algoritmo
  const [optState, setOptState] = useState(getInitialAlgorithmState('OPT'));
  const [selectedAlgoState, setSelectedAlgoState] = useState(getInitialAlgorithmState(params.selectedAlgorithm));

  const [isPaused, setIsPaused] = useState(true);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);
  const [simulationSpeed, setSimulationSpeed] = useState(1000); // ms por operación

  // Lógica de simulación (muy simplificada, debe ser reemplazada)
  const runSimulationStep = useCallback(() => {
    if (currentOperationIndex >= operations.length) {
      setIsPaused(true);
      alert("Simulación completada!");
      return;
    }

    const currentOp = operations[currentOperationIndex];
    console.log(`Procesando Op ${currentOperationIndex + 1}: ${currentOp.type} PID ${currentOp.pid}`, currentOp);

    // --- INICIO DE LÓGICA DE SIMULACIÓN DE EJEMPLO (MUY BÁSICA) ---
    // Esta es una simulación MUY básica solo para mostrar cambios en la UI.
    // La lógica real de paginación, MMU, fallos, hits, etc., es compleja y debe implementarse aquí.

    const processOneAlgorithm = (
        currentState: { ram: PageRepresentation[], mmu: MmuPageDetail[], metrics: AlgorithmMetrics },
        algoName: string
    ): { ram: PageRepresentation[], mmu: MmuPageDetail[], metrics: AlgorithmMetrics } => {
        let newRam = [...currentState.ram];
        let newMmu = [...currentState.mmu];
        let newMetrics = { ...currentState.metrics };

        newMetrics.totalSimulationTime += 1; // Asumir 1s por hit por defecto

        const existingPageDetailIndex = newMmu.findIndex(p => p.ptrId === currentOp.ptrId && p.pid === currentOp.pid);
        let pageDetail: MmuPageDetail | undefined = existingPageDetailIndex !== -1 ? newMmu[existingPageDetailIndex] : undefined;

        switch (currentOp.type) {
            case 'new':
                // Simular asignación de página
                const numPagesNeeded = Math.ceil((currentOp.size || PAGE_SIZE_KB * 1024) / (PAGE_SIZE_KB * 1024)); // size en Bytes
                let pagesAllocated = 0;
                for (let i = 0; i < numPagesNeeded; i++) {
                    const newPageId = `ptr${currentOp.ptrId}_page${i}_${algoName}`;
                    let assignedRamSlot = -1;

                    // Buscar espacio libre en RAM
                    const freeSlotIndex = newRam.findIndex(p => !p.isLoadedInRam);
                    if (freeSlotIndex !== -1) {
                        newRam[freeSlotIndex] = {
                            ...newRam[freeSlotIndex],
                            id: newPageId,
                            pid: currentOp.pid,
                            isLoadedInRam: true,
                            loadedTimestamp: newMetrics.totalSimulationTime,
                        };
                        assignedRamSlot = freeSlotIndex;
                        newMetrics.ramUsedKb += PAGE_SIZE_KB;
                        pagesAllocated++;
                    } else {
                        // Simular fallo de página (necesita reemplazo, no implementado aquí)
                        newMetrics.totalSimulationTime += 4; // 5s (1s base + 4s extra por fallo)
                        newMetrics.thrashingTime += 5;
                        // Aquí iría la lógica de reemplazo de página
                        // Por ahora, solo se añade a VRAM (simulado)
                        newMetrics.vRamUsedKb += PAGE_SIZE_KB;
                        console.warn(`[${algoName}] Fallo de página (NEW): No hay espacio en RAM para ${newPageId}. Se requeriría reemplazo.`);
                    }
                    
                    const newDetail: MmuPageDetail = {
                        id: newPageId,
                        pid: currentOp.pid,
                        ptrId: currentOp.ptrId !== undefined ? currentOp.ptrId : -1,
                        isLoadedInRam: assignedRamSlot !== -1,
                        physicalAddress: assignedRamSlot !== -1 ? assignedRamSlot : undefined,
                        diskAddress: assignedRamSlot === -1 ? `disk_loc_${newPageId}` : undefined,
                        loadedTimestamp: assignedRamSlot !== -1 ? newMetrics.totalSimulationTime : undefined,
                        sizeBytes: currentOp.size, // O tamaño de página si es por página
                        mark: algoName === 'SC' ? 'R=0' : undefined, // Ejemplo para Second Chance
                    };
                    newMmu.push(newDetail);
                }
                 if (!newMetrics.runningProcessesCount || !newMmu.find(p => p.pid === currentOp.pid)) {
                    const uniquePids = new Set(newMmu.map(p => p.pid).filter(pid => pid !== undefined));
                    newMetrics.runningProcessesCount = uniquePids.size;
                }
                break;

            case 'use':
                if (pageDetail) {
                    if (!pageDetail.isLoadedInRam) {
                        // Simular fallo de página (traer de disco)
                        newMetrics.totalSimulationTime += 4; // 5s (1s base + 4s extra por fallo)
                        newMetrics.thrashingTime += 5;
                        // Lógica para traer a RAM (puede implicar reemplazo)
                        const freeSlotIndex = newRam.findIndex(p => !p.isLoadedInRam);
                        if (freeSlotIndex !== -1) {
                            newRam[freeSlotIndex] = {
                                ...newRam[freeSlotIndex], // Conserva el ID de marco de página
                                id: pageDetail.id, // ID de la página lógica
                                pid: currentOp.pid,
                                isLoadedInRam: true,
                                loadedTimestamp: newMetrics.totalSimulationTime,
                            };
                            pageDetail.isLoadedInRam = true;
                            pageDetail.physicalAddress = freeSlotIndex;
                            pageDetail.diskAddress = undefined;
                            pageDetail.loadedTimestamp = newMetrics.totalSimulationTime;
                            newMetrics.ramUsedKb += PAGE_SIZE_KB;
                            newMetrics.vRamUsedKb -= PAGE_SIZE_KB; // Asumiendo que estaba en VRAM
                        } else {
                             console.warn(`[${algoName}] Fallo de página (USE): No hay espacio en RAM para ${pageDetail.id} y no hay reemplazo simple.`);
                        }
                    }
                    if (algoName === 'SC' && pageDetail.isLoadedInRam) pageDetail.mark = 'R=1'; // Marcar como referenciada para SC
                } else {
                    console.error(`[${algoName}] Error: Intento de usar puntero no existente ${currentOp.ptrId} por PID ${currentOp.pid}`);
                    newMetrics.totalSimulationTime += 0; // O penalizar
                }
                break;

            case 'delete':
                newMmu = newMmu.filter(p => {
                    if (p.ptrId === currentOp.ptrId && p.pid === currentOp.pid) {
                        if (p.isLoadedInRam && p.physicalAddress !== undefined) {
                            newRam[p.physicalAddress] = { // Liberar marco en RAM
                                id: `ram_page_${algoName}_${p.physicalAddress}`, // Resetear ID del marco
                                isLoadedInRam: false,
                                pid: undefined,
                                physicalAddress: p.physicalAddress,
                            };
                            newMetrics.ramUsedKb -= PAGE_SIZE_KB;
                        } else if (!p.isLoadedInRam) {
                            newMetrics.vRamUsedKb -= PAGE_SIZE_KB;
                        }
                        // Calcular fragmentación interna liberada (simplificado)
                        // newMetrics.internalFragmentationKb -= ...
                        return false; // Eliminar de MMU
                    }
                    return true;
                });
                break;

            case 'kill':
                let ramFreedKb = 0;
                let vRamFreedKb = 0;
                newMmu = newMmu.filter(p => {
                    if (p.pid === currentOp.pid) {
                        if (p.isLoadedInRam && p.physicalAddress !== undefined) {
                            newRam[p.physicalAddress] = {
                                id: `ram_page_${algoName}_${p.physicalAddress}`,
                                isLoadedInRam: false,
                                pid: undefined,
                                physicalAddress: p.physicalAddress,
                            };
                            ramFreedKb += PAGE_SIZE_KB;
                        } else if (!p.isLoadedInRam) {
                            vRamFreedKb += PAGE_SIZE_KB;
                        }
                        return false;
                    }
                    return true;
                });
                newMetrics.ramUsedKb -= ramFreedKb;
                newMetrics.vRamUsedKb -= vRamFreedKb;
                const uniquePids = new Set(newMmu.map(p => p.pid).filter(pid => pid !== undefined));
                newMetrics.runningProcessesCount = uniquePids.size;
                break;
        }
        
        // Actualizar porcentaje de RAM usada
        newMetrics.ramUsedPercentage = (newMetrics.ramUsedKb / (TOTAL_RAM_PAGES * PAGE_SIZE_KB)) * 100;
        newMetrics.vRamUsedPercentageOfRam = (newMetrics.vRamUsedKb / (TOTAL_RAM_PAGES * PAGE_SIZE_KB)) * 100;
        
        // Simular fragmentación interna (muy simplificado)
        newMetrics.internalFragmentationKb = newMmu.reduce((acc, p) => {
            if (p.isLoadedInRam && p.sizeBytes) {
                const pagesForThisPtr = Math.ceil(p.sizeBytes / (PAGE_SIZE_KB * 1024));
                const allocatedBytes = pagesForThisPtr * PAGE_SIZE_KB * 1024;
                // Esto es incorrecto si un ptr usa múltiples páginas, se debe sumar por página.
                // Para una simulación correcta, cada MmuPageDetail debería ser UNA página.
                // Y el ptrId agruparía varias MmuPageDetail.
                // Aquí, asumimos que p.sizeBytes es para UNA página, lo cual no es realista si sizeBytes > PAGE_SIZE_KB.
                // Para una simulación más precisa, la fragmentación se calcula por página.
                // Si una página lógica (parte de un ptr) tiene X bytes y se le asigna un marco de Y bytes (PAGE_SIZE_KB),
                // la fragmentación es Y - (X % Y) si X es la última parte del ptr.
                // Esta es una simplificación burda.
                const lastPageSize = p.sizeBytes % (PAGE_SIZE_KB * 1024);
                if (lastPageSize > 0 && lastPageSize < PAGE_SIZE_KB * 1024) {
                     acc += (PAGE_SIZE_KB * 1024) - lastPageSize;
                }
            }
            return acc;
        }, 0) / 1024; // Convertir a KB


        return { ram: newRam, mmu: newMmu, metrics: newMetrics };
    };

    // Aplicar la operación a ambos algoritmos
    // En una simulación real, OPT tendría su propia lógica predictiva.
    // Aquí, ambos usan la misma lógica reactiva básica para demostración.
    setOptState(prevState => processOneAlgorithm(prevState, 'OPT'));
    setSelectedAlgoState(prevState => processOneAlgorithm(prevState, params.selectedAlgorithm));

    // --- FIN DE LÓGICA DE SIMULACIÓN DE EJEMPLO ---

    setCurrentOperationIndex(prev => prev + 1);
  }, [currentOperationIndex, operations, params.selectedAlgorithm, PAGE_SIZE_KB, TOTAL_RAM_PAGES]);

  // Efecto para manejar el "reloj" de la simulación
  useEffect(() => {
    if (!isPaused && currentOperationIndex < operations.length) {
      const timerId = setTimeout(runSimulationStep, simulationSpeed);
      return () => clearTimeout(timerId);
    }
  }, [isPaused, runSimulationStep, simulationSpeed, currentOperationIndex, operations.length]);

  const handleResetSimulation = () => {
      setCurrentOperationIndex(0);
      setOptState(getInitialAlgorithmState('OPT'));
      setSelectedAlgoState(getInitialAlgorithmState(params.selectedAlgorithm));
      setIsPaused(true);
  };

  const handleSpeedChange = (newSpeed: number) => {
      // newSpeed: 1 = más rápido (100ms), 2 = normal (500ms), 3 = más lento (1000ms)
      if (newSpeed === 1) setSimulationSpeed(100);
      else if (newSpeed === 2) setSimulationSpeed(500);
      else setSimulationSpeed(1000); // Default
  }


  return (
    <div className="w-full max-w-7xl flex flex-col items-center">
      {/* Controles de Simulación */}
      <div className="w-full flex justify-between items-center mb-6 p-4 bg-gray-800 rounded-lg shadow-md">
        <button
          onClick={onBackToSetup}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors flex items-center"
        >
          <ChevronLeft className="mr-2 h-5 w-5" /> Volver a Configuración
        </button>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-4 py-2 font-semibold rounded-lg transition-colors flex items-center
                        ${isPaused ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'}`}
          >
            {isPaused ? <PlayIcon className="mr-2 h-5 w-5" /> : <Pause className="mr-2 h-5 w-5" />}
            {isPaused ? (currentOperationIndex === 0 ? 'Iniciar' : 'Reanudar') : 'Pausar'}
          </button>
           <button
            onClick={handleResetSimulation}
            disabled={currentOperationIndex === 0 && isPaused}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center disabled:opacity-50"
          >
            <RefreshCw className="mr-2 h-5 w-5" /> Reiniciar
          </button>
          <select onChange={(e) => handleSpeedChange(Number(e.target.value))} defaultValue="3" className="bg-gray-700 text-white p-2 rounded-lg border border-gray-600 focus:ring-cyan-500 focus:border-cyan-500 outline-none">
              <option value="1">Rápido (0.1s)</option>
              <option value="2">Normal (0.5s)</option>
              <option value="3">Lento (1s)</option>
          </select>
        </div>
        <div className="text-sm text-gray-300">
          Operación: {Math.min(currentOperationIndex + 1, operations.length)} / {operations.length}
        </div>
      </div>

      {/* Visualizadores de Algoritmos */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlgorithmVisualizer
          algorithmName="Óptimo (OPT)"
          ramPages={optState.ram}
          mmuPageDetails={optState.mmu}
          metrics={optState.metrics}
          pageSizeKb={PAGE_SIZE_KB}
        />
        <AlgorithmVisualizer
          algorithmName={params.selectedAlgorithm}
          ramPages={selectedAlgoState.ram}
          mmuPageDetails={selectedAlgoState.mmu}
          metrics={selectedAlgoState.metrics}
          pageSizeKb={PAGE_SIZE_KB}
        />
      </div>
       {/* Leyenda de Operación Actual (Opcional) */}
       {currentOperationIndex < operations.length && !isPaused && (
            <div className="mt-6 p-3 bg-gray-700 rounded-lg shadow w-full max-w-md text-center">
                <p className="text-sm text-cyan-300">
                    Ejecutando: <span className="font-mono text-yellow-400">{operations[currentOperationIndex].type.toUpperCase()}</span>
                    {operations[currentOperationIndex].pid && ` para PID: ${operations[currentOperationIndex].pid}`}
                    {operations[currentOperationIndex].ptrId && ` con PtrID: ${operations[currentOperationIndex].ptrId}`}
                    {operations[currentOperationIndex].size && ` de Tamaño: ${operations[currentOperationIndex].size}B`}
                </p>
            </div>
        )}
    </div>
  );
};