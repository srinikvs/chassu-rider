export const STORAGE_KEY = "chassu-rider-v1";
const SAVE_VERSION = 1;

export type SaveData = {
  version: number;
  best: number;
  muted: boolean;
};

const defaults: SaveData = { version: SAVE_VERSION, best: 0, muted: false };

function migrate(raw: Partial<SaveData> & { version?: number }): SaveData {
  return {
    version: SAVE_VERSION,
    best: typeof raw.best === "number" && Number.isFinite(raw.best) ? raw.best : 0,
    muted: Boolean(raw.muted),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrate(parsed);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(next: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function writeBest(best: number): void {
  const cur = loadSave();
  if (best > cur.best) writeSave({ ...cur, best });
}

export function writeMuted(muted: boolean): void {
  writeSave({ ...loadSave(), muted });
}
