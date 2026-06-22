import { create } from 'zustand';

/**
 * Presentation-only view state for the interactive device lab: Anatomy /
 * Learning toggles, the hovered region, and the click-to-pin selected region.
 * Viz-layer only — it does not touch the application state stores.
 */
export interface LabModesStore {
  anatomy: boolean;
  learning: boolean;
  /** User-requested flat textbook cross-section view. */
  crossSection: boolean;
  hovered: string | null;
  selected: string | null;
  toggleAnatomy: () => void;
  toggleLearning: () => void;
  toggleCrossSection: () => void;
  setLearning: (on: boolean) => void;
  setCrossSection: (on: boolean) => void;
  setHovered: (region: string | null) => void;
  setSelected: (region: string | null) => void;
}

export const useLabModes = create<LabModesStore>((set) => ({
  anatomy: false,
  learning: false,
  crossSection: false,
  hovered: null,
  selected: null,
  toggleAnatomy: () => set((s) => ({ anatomy: !s.anatomy })),
  toggleLearning: () => set((s) => ({ learning: !s.learning, hovered: null, selected: null })),
  toggleCrossSection: () => set((s) => ({ crossSection: !s.crossSection })),
  setLearning: (on) => set({ learning: on, hovered: null, selected: null }),
  setCrossSection: (on) => set({ crossSection: on }),
  setHovered: (region) => set({ hovered: region }),
  setSelected: (region) => set({ selected: region }),
}));

/**
 * The flat, camera-locked cross-section view is on ONLY when explicitly
 * requested (the Cross-section toggle). Learning mode no longer forces it, so
 * the device stays fully rotatable / draggable while its anatomy is explored.
 */
export const crossSectionActive = (s: LabModesStore) => s.crossSection || s.anatomy;
