// types.ts
// Archivo para definir los tipos y estructuras de datos compartidas en la simulación.

/**
 * Nombres de los algoritmos de reemplazo de páginas.
 */
export type AlgorithmName = 'FIFO' | 'SC' | 'MRU' | 'RND' | 'OPT' | 'LRU';

/**
 * Representa una instrucción individual leída del archivo o generada.
 * - ptrId: Es un identificador global y secuencial para cada bloque de memoria solicitado vía 'new'.
 * - pid: Para 'new' y 'kill', es el ID del proceso. Para 'use' y 'delete', aunque la instrucción
 * original no lo incluya, lo necesitaremos internamente para identificar a qué proceso
 * pertenece el ptrId. El parser o generador deberá asegurar que ptrId sea único globalmente.
 */
export interface ProcessInstruction {
  type: 'new' | 'use' | 'delete' | 'kill';
  pid: string;
  size?: number; // En Bytes, solo para 'new'
  ptrId?: number; // Identificador global del puntero/bloque de memoria
}

/**
 * Representa un marco de página físico en la RAM.
 * Hay 100 marcos en total (0-99) para 400KB de RAM y páginas de 4KB.
 */
export interface PageFrame {
  frameId: number; // Identificador del marco físico (0-99)
  logicalPageId?: string; // ID de la LogicalPage actualmente en este marco
  pid?: string; // PID del proceso dueño de la página lógica en este marco
  isOccupied: boolean;

  // Timestamps y bits para algoritmos (relevantes cuando isOccupied = true)
  loadedTimestamp?: number; // Tiempo de simulación cuando la página fue cargada a este marco (para FIFO)
  lastAccessTimestamp?: number; // Tiempo de simulación del último acceso (para LRU/MRU)
  referencedBit?: boolean; // Bit de referencia para SC (true si R=1, false si R=0)
}

/**
 * Representa una página lógica, parte de una asignación de memoria (ptrId) de un proceso.
 * Una operación 'new' puede resultar en múltiples páginas lógicas si el tamaño excede 4KB.
 */
export interface LogicalPage {
  id: string; // ID único global para esta página lógica (ej: "ptr[ptrId]_page[idx]_pid[pid]")
  pid: string; // PID del proceso propietario
  ptrId: number; // ptrId global al que pertenece esta página
  pageIndexInPtr: number; // Índice de esta página dentro de su ptrId (0, 1, 2, ...)

  isLoadedInRam: boolean;
  frameId?: number; // frameId en RAM si está cargada, undefined si no
  diskAddress?: string; // Dirección simulada en disco si no está en RAM

  // Timestamps y bits (reflejan el estado cuando/si está en RAM)
  // Estos se actualizan cuando la página está en un PageFrame.
  ramLoadTimestamp?: number; // Tiempo en que esta página fue cargada a RAM (para FIFO)
  ramLastAccessTimestamp?: number; // Tiempo del último acceso a esta página mientras estaba en RAM (para MRU/LRU)
  referencedBit?: boolean; // Bit de referencia para SC (true si R=1, false si R=0)

  // Tamaño del contenido real en esta página, para cálculo de fragmentación.
  // Para páginas completas, será PAGE_SIZE_BYTES. Para la última página de una asignación, podría ser menor.
  contentSizeBytes: number;
}

/**
 * Métricas de rendimiento para un algoritmo.
 */
export interface AlgorithmMetrics {
  algorithmName: string; // Nombre del algoritmo
  pageFaults: number;
  pageHits: number;
  runningProcessesCount: number;
  totalSimulationTime: number; // Suma de 1s por hit, 5s por fallo de página
  ramUsedKb: number;
  ramUsedPercentage: number; // (ramUsedKb / TOTAL_RAM_KB) * 100
  vRamUsedKb: number; // Tamaño total de las páginas lógicas que están en disco
  vRamUsedPercentageOfRam: number; // (vRamUsedKb / TOTAL_RAM_KB) * 100
  thrashingTime: number; // Suma de los tiempos de penalización por fallos de página (5s por fallo)
  thrashingPercentage?: number; // (thrashingTime / totalSimulationTime) * 100
  internalFragmentationKb: number; // Suma de (PAGE_SIZE_KB - contentSizeKb_de_pagina) para páginas en RAM
}

/**
 * Estado completo de la simulación para una instancia de algoritmo.
 */
export interface AlgorithmSimulationState {
  algorithmName: AlgorithmName;
  ramFrames: PageFrame[]; // Array de 100 PageFrames representando la RAM
  mmu: LogicalPage[]; // Lista de todas las páginas lógicas existentes (en RAM o disco)
  metrics: AlgorithmMetrics;
  scHandPosition?: number; // Posición de la "manecilla" para el algoritmo Second Chance
  nextPtrIdToAssign: number; // Para asignar nuevos ptrId globales en operaciones 'new'
  activePointers: Map<number, { pid: string; pageIds: string[] }>; // Mapa de ptrId global a PID y sus LogicalPage IDs
  rng?: () => number; // Generador de números aleatorios para RND (debe ser inicializado con la semilla)
}

/**
 * Contexto proporcionado a las funciones de decisión de reemplazo de página.
 * Contiene el estado actual y, para OPT, información futura.
 */
export interface PageReplacementContext {
  ramFrames: ReadonlyArray<PageFrame>; // Estado actual de los marcos en RAM
  mmu: ReadonlyArray<LogicalPage>; // Estado actual de todas las páginas lógicas
  pageToLoad: LogicalPage; // La página que necesita ser cargada y causó el fallo

  // Para OPT (Optimal)
  futureOperations?: ReadonlyArray<ProcessInstruction>; // Secuencia de operaciones futuras
  currentOperationIndex?: number; // Índice de la operación actual en la secuencia total

  // Para SC (Second Chance)
  scHandPosition?: number; // Posición actual de la manecilla del reloj

  // Para RND (Random)
  rng: () => number; // Función generadora de números aleatorios
}

/**
 * Describe la decisión tomada por un algoritmo de reemplazo.
 */
export interface PageReplacementDecision {
  victimFrameId: number; // El frameId del marco que será desalojado (y usado por la nueva página)
  victimLogicalPageId?: string; // El logicalPageId de la página que estaba en victimFrameId (si alguna)
  
  // Para SC, puede necesitar devolver información adicional
  nextScHandPosition?: number;
  pagesWhoseRBitShouldBeCleared?: string[]; // IDs de LogicalPage
}

/**
 * Firma para una función de algoritmo de reemplazo de página.
 * Dado un contexto, decide qué página en RAM (frame) debe ser reemplazada.
 */
export type PageReplacementAlgorithmFn = (context: PageReplacementContext) => PageReplacementDecision;
