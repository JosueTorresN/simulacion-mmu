// Pantalla para configurar los parámetros de la simulación.
import { useState, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import type { FormEvent } from 'react';
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

// Función dummy para generar operaciones (debería ser reemplazada por la lógica real)
const generateMockOperations = (numProcesses: number, numOps: number, seed: string): ProcessInstruction[] => {
  console.log(`Generando ${numOps} operaciones para ${numProcesses} procesos con semilla: ${seed}`);
  const operations: ProcessInstruction[] = [];
  const pointers: Map<string, number[]> = new Map(); // pid -> [ptr_ids]
  let nextPtrId = 1;

  for (let i = 0; i < numOps; i++) {
    const pid = (i % numProcesses) + 1;
    const processPointers = pointers.get(String(pid)) || [];
    const actionRoll = Math.random();

    if (!pointers.has(String(pid))) { // Asegurar que el primer proceso tenga un new
        pointers.set(String(pid), []);
    }

    if (actionRoll < 0.4 || processPointers.length === 0) { // NEW
      const size = Math.floor(Math.random() * 1000) + 50; // Tamaño entre 50 y 1049
      operations.push({ type: 'new', pid: String(pid), size, ptrId: nextPtrId });
      processPointers.push(nextPtrId);
      pointers.set(String(pid), processPointers);
      nextPtrId++;
    } else if (actionRoll < 0.7 && processPointers.length > 0) { // USE
      const ptrToUse = processPointers[Math.floor(Math.random() * processPointers.length)];
      operations.push({ type: 'use', pid: String(pid), ptrId: ptrToUse });
    } else if (actionRoll < 0.9 && processPointers.length > 0) { // DELETE
      const ptrToDelete = processPointers.splice(Math.floor(Math.random() * processPointers.length), 1)[0];
      operations.push({ type: 'delete', pid: String(pid), ptrId: ptrToDelete });
      pointers.set(String(pid), processPointers);
    } else { // KILL (menos frecuente, y solo si hay procesos)
      if (pointers.has(String(pid)) && (pointers.get(String(pid))?.length ?? 0) > 0) {
         operations.push({ type: 'kill', pid: String(pid) });
         pointers.delete(String(pid)); // Proceso ya no puede operar
      } else if (operations.length > 0 && operations[operations.length-1].type !== 'kill') {
        // Si no se pudo hacer kill, intentar un 'new' para no quedar en un loop infinito si hay pocos procesos
        const size = Math.floor(Math.random() * 1000) + 50;
        operations.push({ type: 'new', pid: String(pid), size, ptrId: nextPtrId });
        processPointers.push(nextPtrId);
        pointers.set(String(pid), processPointers);
        nextPtrId++;
      }
    }
    if (operations.length >= numOps) break;
  }
   // Asegurar que el último comando de cada proceso que tuvo un 'kill' sea 'kill'
   const killedPids = new Set<string>();
   operations.forEach(op => {
       if (op.type === 'kill') killedPids.add(op.pid);
   });

   killedPids.forEach(pid => {
       const lastOpIndex = operations.map((op, idx) => ({op, idx})).filter(item => item.op.pid === pid).pop()?.idx;
       if (lastOpIndex !== undefined && operations[lastOpIndex].type !== 'kill') {
           // Eliminar operaciones posteriores y añadir kill
           let i = operations.length -1;
           while(i > lastOpIndex) {
               if(operations[i].pid === pid) operations.splice(i, 1);
               i--;
           }
           operations.push({ type: 'kill', pid });
       }
   });


  return operations.slice(0, numOps); // Asegurar que no exceda N
};

// Función para convertir operaciones a formato de archivo CSV
const operationsToCsv = (operations: ProcessInstruction[]): string => {
  return operations.map(op => {
    switch (op.type) {
      case 'new':
        return `${op.pid} new (${op.pid},${op.size}) // ptr ${op.ptrId}`;
      case 'use':
        return `${op.pid} use(${op.ptrId})`;
      case 'delete':
        return `${op.pid} delete(${op.ptrId})`;
      case 'kill':
        return `${op.pid} kill(${op.pid})`;
      default:
        return '';
    }
  }).join('\n');
};

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartSimulation }) => {
  const [seed, setSeed] = useState<string>('Ingresar semilla');
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AlgoName>('FIFO');
  const [operationsFile, setOperationsFile] = useState<File | null>(null);
  const [numberOfProcesses, setNumberOfProcesses] = useState<number>(10);
  const [totalOperations, setTotalOperations] = useState<number>(500);
  const [generatedFileContent, setGeneratedFileContent] = useState<string | null>(null);
  const [useFileInput, setUseFileInput] = useState<boolean>(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setOperationsFile(event.target.files[0]);
      setGeneratedFileContent(null); // Limpiar contenido generado si se sube archivo
    }
  };

  const handleGenerateOperations = useCallback(() => {
    if (useFileInput && operationsFile) {
        // Si se usa archivo, no generar. Podríamos parsear aquí si es necesario.
        alert("Usando archivo cargado. No se generarán operaciones.");
        return;
    }
    const ops = generateMockOperations(numberOfProcesses, totalOperations, seed);
    const csvContent = operationsToCsv(ops);
    setGeneratedFileContent(csvContent);

    // Permitir descarga
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "operaciones_simulacion.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
     alert("Archivo de operaciones generado y descarga iniciada.");
  }, [numberOfProcesses, totalOperations, seed, useFileInput, operationsFile]);


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let opsToSimulate: ProcessInstruction[] = [];
    let fileNameParam: string | undefined = undefined;

    if (useFileInput && operationsFile) {
      fileNameParam = operationsFile.name;
      const fileText = await operationsFile.text();
      // Aquí necesitarías una función para parsear el archivo CSV a ProcessInstruction[]
      // Por ahora, es un placeholder:
      opsToSimulate = parseCsvToOperations(fileText);
       if(opsToSimulate.length === 0) {
        alert("El archivo de operaciones está vacío o no pudo ser parseado correctamente. Por favor, revisa el formato.");
        return;
      }
    } else if (generatedFileContent) {
      opsToSimulate = parseCsvToOperations(generatedFileContent); // Re-parsear por si acaso
    } else {
       // Generar si no hay archivo ni contenido generado previamente (aunque el botón de generar debería cubrir esto)
      opsToSimulate = generateMockOperations(numberOfProcesses, totalOperations, seed);
    }

    if (opsToSimulate.length === 0) {
        alert("No hay operaciones para simular. Por favor, carga un archivo o genera operaciones.");
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

  // Placeholder para parsear CSV. Implementar según formato real.
  const parseCsvToOperations = (csvContent: string): ProcessInstruction[] => {
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    const operations: ProcessInstruction[] = [];
    let ptrCounter = 1; // Asumir que los ptrId se pueden inferir o están en el archivo

    lines.forEach(line => {
        const parts = line.match(/(\d+)\s+(new)\s*\((\d+),(\d+)\)(?:\s*\/\/\s*ptr\s*(\d+))?/i) || // new(pid,size) // ptr ID_PTR
                       line.match(/(\d+)\s+(use)\s*\((\d+)\)/i) ||    // use(ID_PTR)
                       line.match(/(\d+)\s+(delete)\s*\((\d+)\)/i) || // delete(ID_PTR)
                       line.match(/(\d+)\s+(kill)\s*\((\d+)\)/i);     // kill(pid)

        if (parts) {
            const pid = parts[1]; // PID del proceso que ejecuta la instrucción
            const type = parts[2].toLowerCase();

            if (type === 'new') {
                const size = parseInt(parts[4], 10);
                const explicitPtrId = parts[5] ? parseInt(parts[5], 10) : ptrCounter;
                operations.push({ type: 'new', pid, size, ptrId: explicitPtrId });
                if (!parts[5]) ptrCounter++; // Solo incrementar si no se dio explícitamente
            } else if (type === 'use' || type === 'delete') {
                const ptrId = parseInt(parts[3], 10);
                operations.push({ type: type as 'use' | 'delete', pid, ptrId });
            } else if (type === 'kill') {
                // El PID en kill(PID) es el mismo que el PID que ejecuta.
                operations.push({ type: 'kill', pid });
            }
        } else {
            console.warn("Línea no reconocida en CSV:", line);
        }
    });
    return operations;
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
            onChange={(e) => setSeed(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-colors"
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
            onChange={(e) => setSelectedAlgorithm(e.target.value as AlgoName)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-colors appearance-none"
          >
            <option value="FIFO">FIFO (First-In, First-Out)</option>
            <option value="SC">SC (Second Chance)</option>
            <option value="MRU">MRU (Most Recently Used)</option>
            <option value="RND">RND (Random)</option>
            {/* LRU no está en la lista del PDF, pero es común. Si se añade, incluir aquí. */}
            {/* <option value="LRU">LRU (Least Recently Used)</option> */}
          </select>
        </div>

        {/* Toggle para Cargar Archivo o Generar */}
        <div className="flex items-center justify-between bg-gray-750 p-3 rounded-lg">
            <span className="text-gray-300">Fuente de Operaciones:</span>
            <div>
                <button
                    type="button"
                    onClick={() => setUseFileInput(true)}
                    className={`px-4 py-2 rounded-l-lg text-sm font-medium transition-colors ${useFileInput ? 'bg-cyan-600 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}
                >
                    Cargar Archivo
                </button>
                <button
                    type="button"
                    onClick={() => setUseFileInput(false)}
                    className={`px-4 py-2 rounded-r-lg text-sm font-medium transition-colors ${!useFileInput ? 'bg-cyan-600 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-300'}`}
                >
                    Generar Nuevas
                </button>
            </div>
        </div>


        {/* Carga de Archivo */}
        {useFileInput && (
            <div className="p-4 border-2 border-dashed border-gray-600 rounded-lg hover:border-cyan-500 transition-colors">
                <label htmlFor="operationsFile" className="block text-sm font-medium text-gray-300 mb-2">
                    <FileText className="inline mr-2 h-5 w-5 text-cyan-400" />Archivo de Operaciones (.csv, .txt)
                </label>
                <input
                    type="file"
                    id="operationsFile"
                    accept=".csv,.txt"
                    onChange={handleFileChange}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer"
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
                onChange={(e) => setNumberOfProcesses(Number(e.target.value))}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-colors"
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
                onChange={(e) => setTotalOperations(Number(e.target.value))}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-colors"
              >
                <option value={500}>500 Operaciones</option>
                <option value={1000}>1000 Operaciones</option>
                <option value={5000}>5000 Operaciones</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerateOperations}
              className="w-full flex items-center justify-center p-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg transition-colors focus:ring-2 focus:ring-yellow-400 focus:outline-none"
            >
              <Download className="mr-2 h-5 w-5" /> Generar y Descargar Archivo de Operaciones
            </button>
            {generatedFileContent && <p className="text-xs text-green-400 mt-2">Operaciones generadas. ¡Listas para simular o descargar!</p>}
          </div>
        )}

        {/* Botón de Iniciar Simulación */}
        <button
          type="submit"
          className="w-full flex items-center justify-center p-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg text-lg transition-colors focus:ring-2 focus:ring-green-400 focus:outline-none"
        >
          <Play className="mr-2 h-6 w-6" /> Iniciar Simulación
        </button>
      </form>
    </div>
  );
};