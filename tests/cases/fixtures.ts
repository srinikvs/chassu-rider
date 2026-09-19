import { STORAGE_KEY, type SaveData } from "../../src/game/save.ts";

export { STORAGE_KEY };

export type SaveBlob = SaveData;

export function makeSave(best = 0, muted = false): SaveBlob {
  return { version: 1, best, muted };
}
