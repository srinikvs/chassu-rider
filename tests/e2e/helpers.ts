import { expect, type Locator, type Page } from "@playwright/test";
import { STORAGE_KEY, makeSave, type SaveBlob } from "../cases/fixtures.ts";

export { STORAGE_KEY };

export class RemoteHookSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteHookSkip";
  }
}

export function isRemoteBase(): boolean {
  return Boolean(process.env.BASE_URL?.trim());
}

export function remoteSkipMessage(reason: string): string {
  const host = process.env.BASE_URL?.trim() || "BASE_URL";
  return `BASE_URL ${host} lacks test hooks (${reason}). Local preview remains the CI gate.`;
}

export function fallbackLocator(page: Page, testId: string): Locator {
  switch (testId) {
    case "app":
      return page.locator(".cr-shell");
    case "board":
      return page.locator("canvas.cr-canvas, canvas").first();
    case "hud":
      return page.locator(".cr-hud");
    case "version":
      return page.locator(".cr-hud .cr-ver-badge").first();
    case "start-version":
      return page.locator(".cr-card .cr-ver-badge").first();
    case "start-screen":
      return page.locator(".cr-veil");
    case "start-panel":
      return page.locator(".cr-card");
    case "howto":
      return page.locator(".cr-howto");
    case "start":
      return page.getByRole("button", { name: /^Start$/i });
    case "best":
      return page.locator(".cr-stats .cr-stat").last().locator(".cr-stat-value");
    case "high-score":
      return page.locator(".cr-hi-value");
    case "distance":
      return page.locator(".cr-stat", { hasText: "Dist" }).locator(".cr-stat-value");
    case "gifts":
      return page.locator(".cr-stat").nth(1).locator(".cr-stat-value");
    case "mute":
      return page.locator(".cr-icon-btn");
    default:
      return page.getByTestId(testId);
  }
}

/** Prefer data-testid; fall back to stable CSS/roles so live hosts without hooks still smoke. */
export function loc(page: Page, testId: string): Locator {
  return page.getByTestId(testId).or(fallbackLocator(page, testId)).first();
}

export type ProbeCaps = {
  any: boolean;
  ride: boolean;
  squirrels: boolean;
};

export async function probeCaps(page: Page): Promise<ProbeCaps> {
  return page.evaluate(() => {
    const p = window.__controlsTest;
    if (!p) return { any: false, ride: false, squirrels: false };
    return {
      any: true,
      ride: typeof p.getSpeed === "function" && typeof p.getDistance === "function",
      squirrels: typeof p.getSquirrels === "function",
    };
  });
}

export async function hasProbe(page: Page): Promise<boolean> {
  return (await probeCaps(page)).any;
}

export async function hasRideProbe(page: Page): Promise<boolean> {
  return (await probeCaps(page)).ride;
}

export async function hasSquirrelProbe(page: Page): Promise<boolean> {
  return (await probeCaps(page)).squirrels;
}

export async function waitForGame(page: Page): Promise<void> {
  await expect(page.locator("canvas").first()).toBeVisible();
  const ready = page.locator('[data-engine="ready"]');
  if (await ready.count()) {
    await expect(ready).toHaveCount(1);
    return;
  }
  if (await hasProbe(page)) return;
  if (isRemoteBase()) {
    await page.waitForTimeout(800);
    return;
  }
  await expect.poll(async () => hasProbe(page), { timeout: 12_000 }).toBe(true);
}

export async function openFresh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("chassu-rider-e2e-cleared")) return;
    localStorage.clear();
    sessionStorage.setItem("chassu-rider-e2e-cleared", "1");
  });
  await page.goto("./");
  await expect(loc(page, "start")).toBeVisible();
  await waitForGame(page);
}

export async function seedHigh(page: Page, best: number): Promise<void> {
  const store = makeSave(best);
  await page.addInitScript(
    ({ store, STORAGE_KEY }) => {
      if (sessionStorage.getItem("chassu-rider-e2e-seeded")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      sessionStorage.setItem("chassu-rider-e2e-seeded", "1");
    },
    { store, STORAGE_KEY },
  );
  await page.goto("./");
  await expect(loc(page, "start")).toBeVisible();
  await waitForGame(page);
}

export async function readSave(page: Page): Promise<SaveBlob | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SaveBlob) : null;
  }, STORAGE_KEY);
}

export async function waitProbe(page: Page, need: "any" | "ride" | "squirrels" = "any"): Promise<void> {
  const ready = async () => {
    const caps = await probeCaps(page);
    if (need === "ride") return caps.ride;
    if (need === "squirrels") return caps.squirrels;
    return caps.any;
  };
  if (await ready()) return;
  if (isRemoteBase()) {
    throw new RemoteHookSkip(remoteSkipMessage(`window.__controlsTest ${need}`));
  }
  await expect.poll(ready, { timeout: 12_000 }).toBe(true);
}

export async function readProbe(page: Page): Promise<{
  screen: string;
  score: number;
  distance: number;
  best: number;
  gifts: number;
  speed: number;
  yaw: number;
  squirrels: Array<{ x: number; z: number; visible: boolean; flee: number }>;
} | null> {
  return page.evaluate(() => {
    const p = window.__controlsTest;
    if (!p) return null;
    return {
      screen: p.getScreen?.() ?? "unknown",
      score: p.getScore?.() ?? 0,
      distance: p.getDistance?.() ?? 0,
      best: p.getBest?.() ?? 0,
      gifts: p.getGifts?.() ?? 0,
      speed: p.getSpeed(),
      yaw: p.getYaw(),
      squirrels: p.getSquirrels?.() ?? [],
    };
  });
}

export async function clickStart(page: Page): Promise<void> {
  const start = loc(page, "start");
  await expect(start).toBeVisible();
  await start.click();
  const gone = await start.isHidden().catch(() => false);
  if (gone) return;
  await page.waitForTimeout(400);
  if (await start.isVisible()) await start.click();
}

export async function parseHudNumber(text: string): Promise<number> {
  const n = Number(String(text).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
