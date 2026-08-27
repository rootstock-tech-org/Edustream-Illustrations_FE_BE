import { create } from 'zustand';
import { type FabStage } from '@/domain/education/fab-process';

export interface AvsarProcessState {
  currentStepIndex: number;
  recipeParameters: Record<string, number>;
}

export interface AvsarWaferState {
  activeStage: FabStage;
  visibleLayers: Record<string, boolean>; // e.g., { silicon: true, oxide: true }
  dimensions: Record<string, number>;
}

export interface AvsarSimulationState {
  process_state: AvsarProcessState;
  wafer_state: AvsarWaferState;
  device_state: Record<string, any>; // Placeholder for Divyanshi's features
  measurements: Record<string, any>; // Placeholder for Divyanshi's features
  defects: Record<string, any>; // Placeholder for Divyanshi's features
  circuit_state: Record<string, any>; // Placeholder for Divyanshi's features
  
  // Actions
  setProcessStep: (stepIndex: number, stage: FabStage) => void;
  toggleLayerVisibility: (layer: string, isVisible: boolean) => void;
}

export const useAvsarStore = create<AvsarSimulationState>((set) => ({
  process_state: {
    currentStepIndex: 0,
    recipeParameters: {},
  },
  wafer_state: {
    activeStage: 'wafer',
    visibleLayers: {
      silicon: true,
      oxide: true,
      nitride: true,
      poly: true,
      metal: true,
      doping: true,
      transient: true, // UV, plasma, heat, ions, resist
    },
    dimensions: {},
  },
  device_state: {},
  measurements: {},
  defects: {},
  circuit_state: {},

  setProcessStep: (stepIndex, stage) => set((state) => ({
    process_state: { ...state.process_state, currentStepIndex: stepIndex },
    wafer_state: { ...state.wafer_state, activeStage: stage },
  })),

  toggleLayerVisibility: (layer, isVisible) => set((state) => ({
    wafer_state: {
      ...state.wafer_state,
      visibleLayers: {
        ...state.wafer_state.visibleLayers,
        [layer]: isVisible,
      },
    },
  })),
}));
