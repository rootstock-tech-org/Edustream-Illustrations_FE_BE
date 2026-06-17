import { create } from 'zustand';

/**
 * View-only concerns: which node/probe is selected, animation playback, and the
 * accessibility motion preference. Kept separate so a slider drag that updates
 * the device store never re-renders subscribers that only care about the view.
 */
interface VizStore {
  selectedTransistorId: string | null;
  animationPlaying: boolean;
  reducedMotion: boolean;
  selectTransistor: (id: string | null) => void;
  setAnimationPlaying: (playing: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
}

export const useVizStore = create<VizStore>((set) => ({
  selectedTransistorId: null,
  animationPlaying: true,
  reducedMotion: false,
  selectTransistor: (id) => set({ selectedTransistorId: id }),
  setAnimationPlaying: (playing) => set({ animationPlaying: playing }),
  setReducedMotion: (reduced) =>
    set({ reducedMotion: reduced, animationPlaying: reduced ? false : true }),
}));
