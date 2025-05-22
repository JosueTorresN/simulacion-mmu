// Componente principal de la aplicación que maneja la navegación entre pantallas.
import React, { useState, useCallback } from 'react';
import { SetupScreen } from './SetupScreen';
import type { SimulationParameters } from './SetupScreen';
import { SimulationScreen } from './SimulationScreen';
import type { PageRepresentation } from './types';
import type { AlgorithmName, ProcessInstruction } from './types';

// Tipos de estado para la aplicación
export type AppScreen = 'setup' | 'simulation';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('setup');
  const [simulationParams, setSimulationParams] = useState<SimulationParameters | null>(null);
  const [generatedOperations, setGeneratedOperations] = useState<ProcessInstruction[] | null>(null);

  // Función para iniciar la simulación con los parámetros dados
  const handleStartSimulation = useCallback((params: SimulationParameters, operations: ProcessInstruction[]) => {
    setSimulationParams(params);
    setGeneratedOperations(operations);
    setCurrentScreen('simulation');
  }, []);

  // Función para volver a la pantalla de configuración
  const handleBackToSetup = useCallback(() => {
    setCurrentScreen('setup');
    setSimulationParams(null);
    setGeneratedOperations(null);
  }, []);

  // Renderiza la pantalla actual basada en el estado
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <header className="w-full max-w-6xl mb-8 text-center">
        <h1 className="text-4xl font-bold text-cyan-400">Simulador de Algoritmos de Paginación</h1>
      </header>
      {currentScreen === 'setup' && (
        <SetupScreen onStartSimulation={handleStartSimulation} />
      )}
      {currentScreen === 'simulation' && simulationParams && generatedOperations && (
        <SimulationScreen
          params={simulationParams}
          operations={generatedOperations}
          onBackToSetup={handleBackToSetup}
        />
      )}
    </div>
  );
};

export default App;
