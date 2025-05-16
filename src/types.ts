// Definiciones de tipos TypeScript para la simulación.

export type AlgorithmName = 'FIFO' | 'SC' | 'MRU' | 'RND' | 'OPT' | 'LRU'; // LRU añadido por si acaso

// Representa una página en la visualización de la RAM
export interface PageRepresentation {
  id: string;                 // Identificador único del marco de página físico o de la página lógica si está cargada
  pid?: string;               // PID del proceso que ocupa la página
  isLoadedInRam: boolean;     // True si la página lógica está en este marco de RAM
  physicalAddress: number;    // El número de marco de página (0-99)
  loadedTimestamp?: number;   // Tiempo de simulación cuando se cargó
  // Otros campos específicos del algoritmo (ej. bit de referencia para SC)
  mark?: string; // Para SC (R bit), LRU/MRU (contador/timestamp)
}

// Detalle de una página en la tabla MMU
export interface MmuPageDetail {
  id: string;                 // Identificador único de la página lógica (ej: ptr1_page0)
  pid: string;                // PID del proceso dueño
  ptrId: number;              // Identificador del puntero (ptr) al que pertenece esta página
  isLoadedInRam: boolean;
  physicalAddress?: number;   // Dirección física en RAM (marco de página)
  diskAddress?: string;       // Dirección en memoria virtual (disco)
  loadedTimestamp?: number;   // Tiempo en que se cargó a RAM
  mark?: string;              // Banderas para algoritmos (R bit para SC, contador para LRU, etc.)
  sizeBytes?: number;         // Tamaño de la memoria solicitada por el 'new' que originó este ptr (para fragmentación)
  // Otros datos necesarios para algoritmos específicos
}

// Métricas para un algoritmo
export interface AlgorithmMetrics {
  runningProcessesCount: number;
  totalSimulationTime: number; // En segundos simulados
  ramUsedKb: number;
  ramUsedPercentage: number;
  vRamUsedKb: number;
  vRamUsedPercentageOfRam: number; // % de VRAM usada con respecto al tamaño de la RAM física
  thrashingTime: number;          // Tiempo gastado en fallos de página
  internalFragmentationKb: number;
}

// Instrucción de proceso
export type InstructionType = 'new' | 'use' | 'delete' | 'kill';

export interface ProcessInstruction {
  type: InstructionType;
  pid: string;
  size?: number;  // Para 'new', en Bytes
  ptrId?: number; // Para 'new' (asignado), 'use', 'delete'
}