// Pantalla para configurar los parámetros de la simulación.
import { useState, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import type { FormEvent } from 'react';
import seedrandom from 'seedrandom';
import { FileText, Settings, Play, Download, ListPlus, Hash } from 'lucide-react';
import type { AlgorithmName as AlgoName, ProcessInstruction } from './types'; // Renombrado para evitar conflicto

// Definición de los parámetros de simulación que se recolectan en esta pantalla
export interface SimulationParameters {
  seed: string;
  selectedAlgorithm: AlgoName;
  numberOfProcesses?: number;
  totalOperations?: number;
  fileName?: string;
}

interface SetupScreenProps {
  onStartSimulation: (params: SimulationParameters, operations: ProcessInstruction[]) => void;
}

/**
 * Genera una lista de operaciones siguiendo las reglas:
 * - Cada proceso puede generar 'new', 'use', 'delete' y 'kill'.
 * - 'use' y 'delete' solo si existe al menos un ptr.
 * - 'kill' solo una vez por proceso y debe ser su última operación.
 * - Intercala operaciones de distintos procesos hasta obtener numOps.
 */
const generateOperations = (
  numProcesses: number,
  numOps: number,
  seed: string
): ProcessInstruction[] => {
  const rng = seedrandom(seed);
  const operations: ProcessInstruction[] = [];
  const ptrsPerProcess: Record<string, number[]> = {};
  const killed: Record<string, boolean> = {};

  // Inicializar procesos
  for (let p = 1; p <= numProcesses; p++) {
    ptrsPerProcess[p] = [];
    killed[p] = false;
  }

  let nextPtrId = 1;

  while (operations.length < numOps) {
    // elegir proceso al azar que no esté kill
    const alive = Object.keys(killed).filter(pid => !killed[pid]);
    if (alive.length === 0) break;
    const pid = alive[Math.floor(rng() * alive.length)];
    const ptrList = ptrsPerProcess[pid];

    // decidir tipo de operación
    let opType: 'new' | 'use' | 'delete' | 'kill';
    if (ptrList.length === 0) {
      opType = 'new';
    } else {
      const roll = rng();
      if (!killed[pid] && roll < 0.1) {
        opType = 'kill';
      } else if (roll < 0.5) {
        opType = 'new';
      } else if (roll < 0.8) {
        opType = 'use';
      } else {
        opType = 'delete';
      }
    }

    switch (opType) {
      case 'new': {
        const size = Math.floor(rng() * 4000) + 1; // tamaño en bytes
        operations.push({ type: 'new', pid, size, ptrId: nextPtrId });
        ptrsPerProcess[pid].push(nextPtrId);
        nextPtrId++;
        break;
      }
      case 'use': {
        const ptrId = ptrList[Math.floor(rng() * ptrList.length)];
        operations.push({ type: 'use', pid, ptrId });
        break;
      }
      case 'delete': {
        const idx = Math.floor(rng() * ptrList.length);
        const ptrId = ptrList.splice(idx, 1)[0];
        operations.push({ type: 'delete', pid, ptrId });
        break;
      }
      case 'kill': {
        operations.push({ type: 'kill', pid });
        // limpiar estado
        ptrsPerProcess[pid] = [];
        killed[pid] = true;
        break;
      }
    }
  }

  // Asegurar que cada proceso tenga kill al final si no lo tuvo
  Object.keys(killed).forEach(pid => {
    if (!killed[pid]) {
      operations.push({ type: 'kill', pid });
    }
  });

  return operations.slice(0, numOps);
};

/**
 * Convierte la lista de operaciones al formato de archivo:
 * new(pid,size)\nuse(ptr)\ndelete(ptr)\nkill(pid)
 */
const operationsToCsv = (operations: ProcessInstruction[]): string => {
  return operations
    .map(op => {
      switch (op.type) {
        case 'new':
          return `new(${op.pid},${op.size})`;
        case 'use':
          return `use(${op.ptrId})`;
        case 'delete':
          return `delete(${op.ptrId})`;
        case 'kill':
          return `kill(${op.pid})`;
        default:
          return '';
      }
    })
    .join('\n');
};

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartSimulation }) => {
  const [seed, setSeed] = useState<string>('42');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgoName>('FIFO');
  const [operationsFile, setOperationsFile] = useState<File | null>(null);
  const [numberOfProcesses, setNumberOfProcesses] = useState<number>(10);
  const [totalOperations, setTotalOperations] = useState<number>(500);
  const [generatedFileContent, setGeneratedFileContent] = useState<string | null>(null);
  const [useFileInput, setUseFileInput] = useState<boolean>(false);

  const handleGenerateRandomSeed = () => {
    const rand = crypto.getRandomValues(new Uint32Array(2));
    const randomSeed = Array.from(rand)
      .map(n => n.toString(36))
      .join('');
    setSeed(randomSeed);
  };


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setOperationsFile(event.target.files[0]);
      setGeneratedFileContent(null);
    }
  };

  const handleGenerateOperations = useCallback(() => {
    if (useFileInput && operationsFile) {
      alert('Usando archivo cargado. No se generarán operaciones.');
      return;
    }
    const ops = generateOperations(numberOfProcesses, totalOperations, seed);
    const csvContent = operationsToCsv(ops);
    setGeneratedFileContent(csvContent);

    // iniciar descarga
    const blob = new Blob([csvContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'operaciones_simulacion.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Archivo de operaciones generado y descarga iniciada.');
  }, [numberOfProcesses, totalOperations, seed, useFileInput, operationsFile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let opsToSimulate: ProcessInstruction[] = [];
    let fileNameParam: string | undefined;

    if (useFileInput && operationsFile) {
      fileNameParam = operationsFile.name;
      const fileText = await operationsFile.text();
      // parseCsvToOperations implementado según formato
      opsToSimulate = parseCsvToOperations(fileText);
      if (opsToSimulate.length === 0) {
        alert('El archivo de operaciones está vacío o no pudo ser parseado correctamente.');
        return;
      }
    } else if (generatedFileContent) {
      opsToSimulate = parseCsvToOperations(generatedFileContent);
    } else {
      opsToSimulate = generateOperations(numberOfProcesses, totalOperations, seed);
    }

    if (opsToSimulate.length === 0) {
      alert('No hay operaciones para simular.');
      return;
    }

    onStartSimulation({
      seed,
      selectedAlgorithm,
      numberOfProcesses: useFileInput ? undefined : numberOfProcesses,
      totalOperations: useFileInput ? undefined : totalOperations,
      fileName: fileNameParam,
    }, opsToSimulate);
  };

  const parseCsvToOperations = (csvContent: string): ProcessInstruction[] => {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
    const ops: ProcessInstruction[] = [];
    lines.forEach(line => {
      const matchNew = line.match(/^new\((\d+),(\d+)\)$/i);
      const matchUse = line.match(/^use\((\d+)\)$/i);
      const matchDel = line.match(/^delete\((\d+)\)$/i);
      const matchKill = line.match(/^kill\((\d+)\)$/i);
      if (matchNew) {
        ops.push({ type: 'new', pid: matchNew[1], size: parseInt(matchNew[2], 10), ptrId: NaN });
      } else if (matchUse) {
        ops.push({ type: 'use', pid: '', ptrId: parseInt(matchUse[1], 10) });
      } else if (matchDel) {
        ops.push({ type: 'delete', pid: '', ptrId: parseInt(matchDel[1], 10) });
      } else if (matchKill) {
        ops.push({ type: 'kill', pid: matchKill[1] });
      }
    });
    return ops;
  };

  return (
    <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-xl shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <h2 className="text-3xl font-semibold text-cyan-400 mb-6 text-center flex items-center justify-center">
          <Settings className="mr-3 h-8 w-8" /> Configuración de la Simulación
        </h2>
        {/* Semilla */}
        <div>
          <label htmlFor="seed" className="block text-sm font-medium text-gray-300 mb-1">
            <Hash className="inline mr-2 h-5 w-5 text-cyan-400" />Semilla para Random
          </label>
          <input
            type="text"
            id="seed"
            value={seed}
            onChange={e => setSeed(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
            placeholder="Ej: miSemilla123, 42"
          />
        </div>
        {/* Algoritmo */}
        <div>
          <label htmlFor="algorithm" className="block text-sm font-medium text-gray-300 mb-1">
            <ListPlus className="inline mr-2 h-5 w-5 text-cyan-400" />Algoritmo a Simular (vs OPT)
          </label>
          <select
            id="algorithm"
            value={selectedAlgorithm}
            onChange={e => setSelectedAlgorithm(e.target.value as AlgoName)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none appearance-none"
          >
            <option value="FIFO">FIFO (First-In, First-Out)</option>
            <option value="SC">SC (Second Chance)</option>
            <option value="MRU">MRU (Most Recently Used)</option>
            <option value="RND">RND (Random)</option>
          </select>
        </div>
        {/* Fuente de Operaciones */}
        <div className="flex items-center justify-between bg-gray-750 p-3 rounded-lg">
          <span className="text-gray-300">Fuente de Operaciones:</span>
          <div>
            <button
              type="button"
              onClick={() => setUseFileInput(true)}
              className={`px-4 py-2 rounded-l-lg text-sm font-medium transition-colors ${useFileInput ? 'bg-cyan-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
              Cargar Archivo
            </button>
            <button
              type="button"
              onClick={() => setUseFileInput(false)}
              className={`px-4 py-2 rounded-r-lg text-sm font-medium transition-colors ${!useFileInput ? 'bg-cyan-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
              Generar Nuevas
            </button>
          </div>
        </div>
        {/* Carga de Archivo */}
        {useFileInput && (
          <div className="p-4 border-2 border-dashed border-gray-600 rounded-lg">
            <label htmlFor="operationsFile" className="block text-sm font-medium text-gray-300 mb-2">
              <FileText className="inline mr-2 h-5 w-5 text-cyan-400" />Archivo de Operaciones (.txt)
            </label>
            <input
              type="file"
              id="operationsFile"
              accept=".txt,.csv"
              onChange={handleFileChange}
              className="w-full text-sm text-gray-400 file:py-2 file:px-4 file:rounded-lg file:bg-cyan-600 file:text-white cursor-pointer"
            />
            {operationsFile && <p className="text-xs text-gray-400 mt-2">Archivo seleccionado: {operationsFile.name}</p>}
          </div>
        )}
        {/* Generación de Operaciones */}
        {!useFileInput && (
          <div className="space-y-4 p-4 border border-gray-700 rounded-lg">
            <h3 className="text-lg font-medium text-cyan-400">Generar Operaciones:</h3>
            <div>
              <label htmlFor="numProcesses" className="block text-sm font-medium text-gray-300 mb-1">Número de Procesos (P)</label>
              <select
                id="numProcesses"
                value={numberOfProcesses}
                onChange={e => setNumberOfProcesses(Number(e.target.value))}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
              >
                <option value={10}>10 Procesos</option>
                <option value={50}>50 Procesos</option>
                <option value={100}>100 Procesos</option>
              </select>
            </div>
            <div>
              <label htmlFor="totalOperations" className="block text-sm font-medium text-gray-300 mb-1">Cantidad de Operaciones (N)</label>
              <select
                id="totalOperations"
                value={totalOperations}
                onChange={e => setTotalOperations(Number(e.target.value))}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none"
              >
                <option value={500}>500 Operaciones</option>
                <option value={1000}>1000 Operaciones</option>
                <option value={5000}>5000 Operaciones</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerateOperations}
              className="w-full flex items-center justify-center p-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg"
            >
              <Download className="mr-2 h-5 w-5" /> Generar y Descargar Archivo
            </button>
            {generatedFileContent && <p className="text-xs text-green-400 mt-2">Operaciones generadas. ¡Listas para simular!</p>}
          </div>
        )}
        {/* Iniciar Simulación */}
        <button
          type="submit"
          className="w-full flex items-center justify-center p-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg text-lg"
        >
          <Play className="mr-2 h-6 w-6" /> Iniciar Simulación
        </button>
      </form>
    </div>
  );
};
