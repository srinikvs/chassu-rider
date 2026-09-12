export const GAME_VERSION = "1.2.0";

export type Screen = "title" | "play" | "over";

export type UiState = {
  screen: Screen;
  distance: number;
  gifts: number;
  score: number;
  best: number;
  muted: boolean;
  newBest: boolean;
};

export type PublicEngine = {
  start: () => void;
  restart: () => void;
  toggleMute: () => void;
  destroy: () => void;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setSteer?: (v: number) => void;
  setKeys?: (codes: string[]) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

export {};
