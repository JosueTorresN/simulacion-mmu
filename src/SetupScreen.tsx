// SetupScreen.tsx
// Pantalla para configurar los parámetros de la simulación.
import React, { useState, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import seedrandom from 'seedrandom';
import { FileText, Settings, Play, Download, ListPlus, Hash } from 'lucide-react';
import type { AlgorithmName, ProcessInstruction } from './types'; // Importar desde types.ts

// Definición de los parámetros de simulación que se recolectan en esta pantalla
export interface SimulationParameters {
  seed: string;
  selectedAlgorithm: AlgorithmName;
  numberOfProcesses?: number; // Si se generan operaciones
  totalOperations?: number; // Si se generan operaciones
  fileName?: string; // Si se carga un archivo
}

interface SetupScreenProps {
  onStartSimulation: (params: SimulationParameters, operations: ProcessInstruction[], initialNextPtrId: number) => void;
}

let globalNextPtrId = 1; // Para generar ptrId únicos en generateOperations

/**
 * Genera una lista de operaciones siguiendo las reglas del PDF.
 * - ptrId se asigna global y secuencialmente.
 */
const generateOperations = (
  numProcesses: number,
  numOps: number,
  seed: string
): ProcessInstruction[] => {
  const rng = seedrandom(seed);
  const operations: ProcessInstruction[] = [];
  
  // Estado por proceso: lista de ptrIds activos, si ha sido 'killed'
  const processStates: Record<string, { activePtrIds: number[]; isKilled: boolean }> = {};
  for (let i = 1; i <= numProcesses; i++) {
    const pid = `P${i}`;
    processStates[pid] = { activePtrIds: [], isKilled: false };
  }

  globalNextPtrId = 1; // Reiniciar para cada generación

  const pids = Object.keys(processStates);

  for (let opCount = 0; opCount < numOps; opCount++) {
    const availablePids = pids.filter(pid => !processStates[pid].isKilled);
    if (availablePids.length === 0) break; // Todos los procesos terminaron

    const pid = availablePids[Math.floor(rng() * availablePids.length)];
    const state = processStates[pid];
    let opType: ProcessInstruction['type'] | null = null;

    const canUseOrDelete = state.activePtrIds.length > 0;
    const roll = rng();

    if (roll < 0.4) { // NEW (40%)
      opType = 'new';
    } else if (canUseOrDelete && roll < 0.7) { // USE (30%)
      opType = 'use';
    } else if (canUseOrDelete && roll < 0.9) { // DELETE (20%)
      opType = 'delete';
    } else { // KILL (10%) o NEW si no puede hacer otra cosa
      if (rng() < 0.7 && opCount < numOps - availablePids.length) { // No matar demasiado pronto
         opType = 'new'; // Favorecer new si no hay punteros o es temprano
      } else {
        opType = 'kill';
      }
    }
    
    // Si se eligió una operación que no se puede hacer, intentar 'new' o 'kill'
    if ((opType === 'use' || opType === 'delete') && !canUseOrDelete) {
        opType = 'new';
    }
    if (opType === 'kill' && state.isKilled) { // Ya matado, no debería pasar si filtramos bien
        continue;
    }


    switch (opType) {
      case 'new': {
        const size = Math.floor(rng() * (16 * 1024 - 100) + 100); // Tamaño entre 100B y ~16KB
        operations.push({ type: 'new', pid, size, ptrId: globalNextPtrId });
        state.activePtrIds.push(globalNextPtrId);
        globalNextPtrId++;
        break;
      }
      case 'use': {
        if (state.activePtrIds.length > 0) {
          const ptrIdToUse = state.activePtrIds[Math.floor(rng() * state.activePtrIds.length)];
          operations.push({ type: 'use', pid, ptrId: ptrIdToUse });
        } else { // No debería llegar aquí si la lógica de selección es correcta
          opCount--; continue;
        }
        break;
      }
      case 'delete': {
         if (state.activePtrIds.length > 0) {
            const ptrIdIndexToDelete = Math.floor(rng() * state.activePtrIds.length);
            const ptrIdToDelete = state.activePtrIds.splice(ptrIdIndexToDelete, 1)[0];
            operations.push({ type: 'delete', pid, ptrId: ptrIdToDelete });
         } else { // No debería llegar aquí
            opCount--; continue;
         }
        break;
      }
      case 'kill': {
        operations.push({ type: 'kill', pid });
        state.isKilled = true;
        state.activePtrIds = []; // Liberar todos sus punteros conceptualmente
        break;
      }
      default: // No hacer nada si opType es null
        opCount--; // Reintentar generar una operación válida
        continue;
    }
  }

  // Asegurar que todos los procesos no matados tengan una instrucción 'kill' al final
  pids.forEach(pid => {
    if (!processStates[pid].isKilled) {
      operations.push({ type: 'kill', pid });
    }
  });

  return operations.slice(0, numOps); // Cortar al número exacto de operaciones si 'kill' añadió más
};


/**
 * Convierte la lista de ProcessInstruction al formato de archivo especificado.
 * new(pid,size)
 * use(ptrIdGlobal)
 * delete(ptrIdGlobal)
 * kill(pid)
 */
const operationsToCsv = (operations: ProcessInstruction[]): string => {
  return operations
    .map(op => {
      switch (op.type) {
        case 'new':
          return `new(${op.pid},${op.size})`; // ptrId no va en el archivo, se infiere
        case 'use':
          return `use(${op.ptrId})`;
        case 'delete':
          return `delete(${op.ptrId})`;
        case 'kill':
          return `kill(${op.pid})`;
        default:
          throw new Error(`Operación desconocida: ${(op as any)?.type}`);
      }
    })
    .join('\n');
};

/**
 * Parsea el contenido de un archivo CSV a una lista de ProcessInstruction.
 * Asigna ptrId globales secuencialmente a las operaciones 'new'.
 * Para 'use' y 'delete', el ptrId es el global leído del archivo.
 * El PID para 'use' y 'delete' se deja vacío aquí, la simulación deberá
 * encontrar a qué PID pertenece un ptrId global si es necesario (usando activePointers).
 */
const parseCsvToOperations = (csvContent: string): {ops: ProcessInstruction[], nextPtrId: number} => {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
  const ops: ProcessInstruction[] = [];
  let currentGlobalPtrId = 1; // Contador para asignar a las 'new' ops del archivo

  // Mapa para rastrear a qué PID pertenece cada ptrId globalmente único
  // Esto es crucial si 'use' o 'delete' no especifican PID y solo ptrId.
  // La simulación necesitará este mapeo.
  const ptrIdToPidMap = new Map<number, string>();


  lines.forEach(line => {
    line = line.trim();
    const matchNew = line.match(/^new\((\w+),(\d+)\)$/i); // pid puede ser P1, P2, etc.
    const matchUse = line.match(/^use\((\d+)\)$/i);
    const matchDel = line.match(/^delete\((\d+)\)$/i);
    const matchKill = line.match(/^kill\((\w+)\)$/i);

    if (matchNew) {
      const pid = matchNew[1];
      const size = parseInt(matchNew[2], 10);
      ops.push({ type: 'new', pid, size, ptrId: currentGlobalPtrId });
      ptrIdToPidMap.set(currentGlobalPtrId, pid); // Registrar dueño del ptrId
      currentGlobalPtrId++;
    } else if (matchUse) {
      const ptrId = parseInt(matchUse[1], 10);
      const pid = ptrIdToPidMap.get(ptrId) || ''; // Intentar obtener PID
      ops.push({ type: 'use', pid, ptrId });
    } else if (matchDel) {
      const ptrId = parseInt(matchDel[1], 10);
      const pid = ptrIdToPidMap.get(ptrId) || ''; // Intentar obtener PID
      ops.push({ type: 'delete', pid, ptrId });
    } else if (matchKill) {
      const pid = matchKill[1];
      ops.push({ type: 'kill', pid });
      // Cuando un proceso es 'killed', sus ptrIds deberían ser invalidados.
      // El mapa ptrIdToPidMap no se limpia aquí, la simulación maneja la liberación.
    } else {
      console.warn(`Línea no reconocida en archivo de operaciones: "${line}"`);
    }
  });
  return {ops, nextPtrId: currentGlobalPtrId};
};


export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartSimulation }) => {
  const [seed, setSeed] = useState<string>(() => Math.random().toString(36).substring(2, 15));
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgorithmName>('FIFO');
  const [operationsFile, setOperationsFile] = useState<File | null>(null);
  const [numberOfProcesses, setNumberOfProcesses] = useState<number>(10);
  const [totalOperations, setTotalOperations] = useState<number>(500);
  const [generatedFileContent, setGeneratedFileContent] = useState<string | null>(null);
  const [useFileInput, setUseFileInput] = useState<boolean>(false);
  const [parsedNextPtrId, setParsedNextPtrId] = useState(1);


  const handleGenerateRandomSeed = () => {
    setSeed(Math.random().toString(36).substring(2, 15));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setOperationsFile(event.target.files[0]);
      setGeneratedFileContent(null); // Limpiar contenido generado si se carga archivo
    }
  };

  const handleGenerateOperations = useCallback(() => {
    if (useFileInput && operationsFile) {
      alert('Usando archivo cargado. No se generarán operaciones nuevas aquí.');
      return;
    }
    const ops = generateOperations(numberOfProcesses, totalOperations, seed);
    setParsedNextPtrId(globalNextPtrId); // Guardar el nextPtrId después de generar
    const csvContent = operationsToCsv(ops);
    setGeneratedFileContent(csvContent);

    const blob = new Blob([csvContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `operaciones_P${numberOfProcesses}_N${totalOperations}_S${seed}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('Archivo de operaciones generado y descarga iniciada.');
  }, [numberOfProcesses, totalOperations, seed, useFileInput, operationsFile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let opsToSimulate: ProcessInstruction[] = [];
    let simulationParams: SimulationParameters;
    let finalNextPtrId = 1;

    if (useFileInput && operationsFile) {
      const fileText = await operationsFile.text();
      const parsedData = parseCsvToOperations(fileText);
      opsToSimulate = parsedData.ops;
      finalNextPtrId = parsedData.nextPtrId;

      if (opsToSimulate.length === 0) {
        alert('El archivo de operaciones está vacío o no tiene un formato válido.');
        return;
      }
      simulationParams = {
        seed, // La semilla aún puede ser relevante para RND si el archivo no la define
        selectedAlgorithm,
        fileName: operationsFile.name,
        // numberOfProcesses y totalOperations no son de la config si se usa archivo
      };
    } else if (generatedFileContent) {
      // Usar operaciones previamente generadas y su nextPtrId
      const parsedData = parseCsvToOperations(generatedFileContent); // Re-parsear para asegurar consistencia
      opsToSimulate = parsedData.ops;
      finalNextPtrId = parsedData.nextPtrId;

      simulationParams = {
        seed,
        selectedAlgorithm,
        numberOfProcesses,
        totalOperations,
      };
    } else {
      // Generar operaciones si no hay archivo ni contenido generado (ej. si el usuario solo da clic a "Iniciar")
      opsToSimulate = generateOperations(numberOfProcesses, totalOperations, seed);
      finalNextPtrId = globalNextPtrId; // Usar el globalNextPtrId de la última generación
      simulationParams = {
        seed,
        selectedAlgorithm,
        numberOfProcesses,
        totalOperations,
      };
    }

    if (opsToSimulate.length === 0) {
      alert('No hay operaciones para simular. Genere o cargue un archivo.');
      return;
    }
    
    onStartSimulation(simulationParams, opsToSimulate, finalNextPtrId);
  };


  return (
    <div className="w-full max-w-2xl bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl text-gray-200">
      <form onSubmit={handleSubmit} className="space-y-6">
        <h2 className="text-2xl md:text-3xl font-semibold text-cyan-400 mb-6 text-center flex items-center justify-center">
          <Settings className="mr-3 h-7 w-7 md:h-8 md:w-8" /> Configuración de Simulación
        </h2>

        {/* Semilla */}
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <label htmlFor="seed" className="block text-sm font-medium text-gray-300 whitespace-nowrap">
            <Hash className="inline mr-2 h-5 w-5 text-cyan-400" />Semilla:
          </label>
          <input
            type="text"
            id="seed"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-gray-100"
            placeholder="Ej: miSemilla123"
          />
          <button
            type="button"
            onClick={handleGenerateRandomSeed}
            className="w-full sm:w-auto px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            Generar Aleatoria
          </button>
        </div>

        {/* Algoritmo */}
        <div>
          <label htmlFor="algorithm" className="block text-sm font-medium text-gray-300 mb-1">
            <ListPlus className="inline mr-2 h-5 w-5 text-cyan-400" />Algoritmo a Simular (vs OPT):
          </label>
          <select
            id="algorithm"
            value={selectedAlgorithm}
            onChange={e => setSelectedAlgorithm(e.target.value as AlgorithmName)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none appearance-none text-gray-100"
          >
            <option value="FIFO">FIFO (First-In, First-Out)</option>
            <option value="SC">SC (Second Chance)</option>
            <option value="MRU">MRU (Most Recently Used)</option>
            <option value="LRU">LRU (Least Recently Used)</option>
            <option value="RND">RND (Random)</option>
            {/* OPT se simula siempre, no es una opción seleccionable aquí */}
          </select>
        </div>

        {/* Fuente de Operaciones */}
        <div className="p-4 bg-gray-750 rounded-lg">
            <div className="flex items-center justify-center space-x-2 mb-3">
                <span className="text-sm font-medium text-gray-300">Fuente de Operaciones:</span>
                <button
                type="button"
                onClick={() => { setUseFileInput(true); setGeneratedFileContent(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${useFileInput ? 'bg-cyan-600 text-white ring-2 ring-cyan-400' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}
                >
                Cargar Archivo
                </button>
                <button
                type="button"
                onClick={() => { setUseFileInput(false); setOperationsFile(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!useFileInput ? 'bg-cyan-600 text-white ring-2 ring-cyan-400' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}
                >
                Generar Nuevas
                </button>
            </div>

            {/* Carga de Archivo */}
            {useFileInput && (
            <div className="mt-3 p-4 border-2 border-dashed border-gray-600 rounded-lg">
                <label htmlFor="operationsFile" className="block text-sm font-medium text-gray-300 mb-2">
                <FileText className="inline mr-2 h-5 w-5 text-cyan-400" />Archivo de Operaciones (.txt):
                </label>
                <input
                type="file"
                id="operationsFile"
                accept=".txt,.csv" // Permitir .csv también
                onChange={handleFileChange}
                className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer"
                />
                {operationsFile && <p className="text-xs text-green-400 mt-2">Archivo seleccionado: {operationsFile.name}</p>}
            </div>
            )}

            {/* Generación de Operaciones */}
            {!useFileInput && (
            <div className="mt-3 space-y-4 p-4 border border-gray-700 rounded-lg">
                <h3 className="text-md font-medium text-cyan-300">Parámetros de Generación:</h3>
                <div>
                <label htmlFor="numProcesses" className="block text-sm font-medium text-gray-300 mb-1">Número de Procesos (P):</label>
                <select
                    id="numProcesses"
                    value={numberOfProcesses}
                    onChange={e => setNumberOfProcesses(Number(e.target.value))}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-gray-100"
                >
                    <option value={10}>10 Procesos</option>
                    <option value={50}>50 Procesos</option>
                    <option value={100}>100 Procesos</option>
                </select>
                </div>
                <div>
                <label htmlFor="totalOperations" className="block text-sm font-medium text-gray-300 mb-1">Cantidad de Operaciones (N):</label>
                <select
                    id="totalOperations"
                    value={totalOperations}
                    onChange={e => setTotalOperations(Number(e.target.value))}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-gray-100"
                >
                    <option value={500}>500 Operaciones</option>
                    <option value={1000}>1000 Operaciones</option>
                    <option value={5000}>5000 Operaciones</option>
                </select>
                </div>
                <button
                type="button"
                onClick={handleGenerateOperations}
                className="w-full flex items-center justify-center p-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors"
                >
                <Download className="mr-2 h-5 w-5" /> Generar y Descargar Archivo
                </button>
                {generatedFileContent && !useFileInput && <p className="text-xs text-green-400 mt-2">Operaciones generadas y listas. ¡Puedes iniciar la simulación o descargar el archivo!</p>}
            </div>
            )}
        </div>
        
        {/* Iniciar Simulación */}
        <button
          type="submit"
          className="w-full flex items-center justify-center p-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-lg transition-colors"
        >
          <Play className="mr-2 h-6 w-6" /> Iniciar Simulación
        </button>
      </form>
    </div>
  );
};
