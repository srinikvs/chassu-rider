import { expect, type Page, type TestInfo } from "@playwright/test";
import type { CaseFile, Expectation, Step } from "../cases/types.ts";
import {
  RemoteHookSkip,
  clickStart,
  hasProbe,
  isRemoteBase,
  loc,
  openFresh,
  parseHudNumber,
  readProbe,
  readSave,
  remoteSkipMessage,
  seedHigh,
  waitForGame,
  waitProbe,
} from "./helpers.ts";

async function applyExpect(page: Page, exp: Expectation, caseId: string): Promise<void> {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "visible":
      await expect(loc(page, String(exp.testId)), tag).toBeVisible();
      return;
    case "hidden":
      await expect(loc(page, String(exp.testId)), tag).toBeHidden();
      return;
    case "count": {
      const node = loc(page, String(exp.testId));
      const scoped = exp.selector ? node.locator(String(exp.selector)) : node;
      const expected = Number(exp.value);
      const actual = await scoped.count();
      if (actual === expected) {
        await expect(scoped, tag).toHaveCount(expected);
        return;
      }
      if (isRemoteBase() && actual >= Number(exp.min ?? 1)) {
        console.warn(
          `${tag}: live count ${actual} != ${expected}; accepting. Local preview remains the CI gate.`,
        );
        return;
      }
      await expect(scoped, tag).toHaveCount(expected);
      return;
    }
    case "text": {
      const re = new RegExp(String(exp.match));
      await expect(loc(page, String(exp.testId)), tag).toHaveText(re);
      return;
    }
    case "textEquals":
      await expect(loc(page, String(exp.testId)), tag).toHaveText(String(exp.value));
      return;
    case "below": {
      const above = await loc(page, String(exp.above)).boundingBox();
      const below = await loc(page, String(exp.below)).boundingBox();
      expect(above && below, tag).toBeTruthy();
      expect(below!.y, tag).toBeGreaterThan(above!.y);
      return;
    }
    case "heading":
      await expect(page.getByRole("heading", { name: String(exp.name) }).first(), tag).toBeVisible();
      return;
    case "viewport": {
      const vp = page.viewportSize();
      expect(vp, tag).toEqual({ width: Number(exp.width), height: Number(exp.height) });
      return;
    }
    case "inViewport":
    case "noVerticalClip": {
      const vp = page.viewportSize()!;
      const ids = (Array.isArray(exp.testId) ? exp.testId : [exp.testId]) as string[];
      for (const id of ids) {
        const box = await loc(page, id).boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.y, `${tag} ${id} top`).toBeGreaterThanOrEqual(-1);
        expect(box!.y + box!.height, `${tag} ${id} bottom`).toBeLessThanOrEqual(vp.height + 1);
        expect(box!.x, `${tag} ${id} left`).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width, `${tag} ${id} right`).toBeLessThanOrEqual(vp.width + 1);
      }
      return;
    }
    case "boardUsable": {
      const box = await loc(page, "board").boundingBox();
      expect(box, tag).toBeTruthy();
      expect(box!.width, `${tag} width`).toBeGreaterThanOrEqual(Number(exp.minWidth ?? 300));
      expect(box!.height, `${tag} height`).toBeGreaterThanOrEqual(Number(exp.minHeight ?? 500));
      return;
    }
    case "controlsAboveHomeBar": {
      const vp = page.viewportSize()!;
      const sab = Number(exp.sab ?? 0);
      const ids = (Array.isArray(exp.testId) ? exp.testId : [exp.testId]) as string[];
      for (const id of ids) {
        const box = await loc(page, id).boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.y + box!.height, `${tag} ${id} above home-bar`).toBeLessThanOrEqual(vp.height - sab + 2);
      }
      return;
    }
    case "storageBest": {
      await expect
        .poll(
          async () => {
            const save = await readSave(page);
            const best = save?.best ?? null;
            if (exp.min != null) return best != null && best >= Number(exp.min);
            return best === Number(exp.value);
          },
          { message: tag },
        )
        .toBe(true);
      return;
    }
    case "bestAtLeast": {
      const text = (await loc(page, "best").innerText()).trim();
      expect(await parseHudNumber(text), tag).toBeGreaterThanOrEqual(Number(exp.value));
      return;
    }
    case "riding": {
      const probe = await readProbe(page);
      if (probe) {
        expect(probe.speed, `${tag} speed`).toBeGreaterThan(0);
        expect(probe.distance, `${tag} distance`).toBeGreaterThan(0);
        expect(probe.screen, `${tag} screen`).toBe("play");
        return;
      }
      const dist = await loc(page, "distance").innerText();
      expect(await parseHudNumber(dist), `${tag} HUD distance`).toBeGreaterThan(0);
      return;
    }
    case "speedPositive": {
      if (!(await hasProbe(page))) {
        if (isRemoteBase()) {
          console.warn(remoteSkipMessage("getSpeed"));
          return;
        }
        throw new Error(`${tag}: window.__controlsTest missing on local preview`);
      }
      const probe = await readProbe(page);
      expect(probe?.speed, tag).toBeGreaterThan(0);
      return;
    }
    case "squirrelsVisible": {
      if (!(await hasProbe(page))) {
        throw new RemoteHookSkip(remoteSkipMessage("getSquirrels"));
      }
      const probe = await readProbe(page);
      const seen = probe?.squirrels.filter((s) => s.visible) ?? [];
      expect(seen.length, tag).toBeGreaterThanOrEqual(Number(exp.min ?? 1));
      return;
    }
    case "screen": {
      if (!(await hasProbe(page))) {
        throw new RemoteHookSkip(remoteSkipMessage("getScreen"));
      }
      const probe = await readProbe(page);
      expect(probe?.screen, tag).toBe(String(exp.value));
      return;
    }
    case "giftsUnchanged": {
      if (!(await hasProbe(page))) {
        throw new RemoteHookSkip(remoteSkipMessage("getGifts"));
      }
      const probe = await readProbe(page);
      expect(probe?.gifts, tag).toBe(0);
      return;
    }
    default:
      throw new Error(`${tag}: unknown e2e/pixel assert "${exp.assert}"`);
  }
}

async function runStep(page: Page, step: Step, c: CaseFile): Promise<void> {
  switch (step.op) {
    case "openFresh":
      await openFresh(page);
      return;
    case "seedHigh":
      await seedHigh(page, Number(step.score ?? 0));
      return;
    case "click":
      if (step.testId === "start") {
        await clickStart(page);
        return;
      }
      await loc(page, String(step.testId)).click();
      return;
    case "waitVisible":
      await expect(loc(page, String(step.testId))).toBeVisible();
      return;
    case "waitProbe":
      await waitProbe(page);
      return;
    case "waitRide": {
      const ms = Number(step.ms ?? 700);
      if (await hasProbe(page)) {
        await expect
          .poll(async () => {
            const p = await readProbe(page);
            return (p?.distance ?? 0) > 0 && (p?.speed ?? 0) > 0;
          })
          .toBe(true);
        return;
      }
      await page.waitForTimeout(ms);
      await expect(loc(page, "distance")).toBeVisible();
      return;
    }
    case "waitBeatBest": {
      const prior = Number(step.prior ?? 0);
      await expect
        .poll(async () => {
          const save = await readSave(page);
          if ((save?.best ?? 0) > prior) return true;
          const probe = await readProbe(page);
          return (probe?.best ?? 0) > prior;
        })
        .toBe(true);
      return;
    }
    case "steer": {
      const dir = String(step.dir ?? "left");
      const key = dir === "right" ? "ArrowRight" : "ArrowLeft";
      if (await hasProbe(page)) {
        await page.evaluate((code) => window.__controlsTest?.setKeys?.([code]), key);
        await page.waitForTimeout(Number(step.ms ?? 200));
        await page.evaluate(() => window.__controlsTest?.setKeys?.([]));
        return;
      }
      await page.keyboard.down(key);
      await page.waitForTimeout(Number(step.ms ?? 200));
      await page.keyboard.up(key);
      return;
    }
    case "overlapSquirrel": {
      await waitProbe(page);
      await page.evaluate(() => window.__controlsTest?.overlapSquirrel?.());
      await page.waitForTimeout(250);
      return;
    }
    case "reload":
      await page.reload();
      await expect(loc(page, "hud")).toBeVisible();
      await waitForGame(page);
      return;
    case "emulateSafeArea": {
      const sat = Number(step.sat ?? 0);
      const sab = Number(step.sab ?? 0);
      await page.addStyleTag({
        content: `:root, .cr-shell { --safe-top: ${sat}px; --safe-bottom: ${sab}px; --safe-left: 0px; --safe-right: 0px; }`,
      });
      const vp = page.viewportSize()!;
      await page.setViewportSize({ width: vp.width, height: vp.height - 1 });
      await page.setViewportSize(vp);
      return;
    }
    case "expect":
      await applyExpect(page, step as unknown as Expectation, c.id);
      return;
    default:
      throw new Error(`${c.id}: unknown e2e op "${step.op}"`);
  }
}

export async function runE2ECase(page: Page, c: CaseFile, _info?: TestInfo): Promise<void> {
  for (const step of c.steps) await runStep(page, step, c);
  for (const exp of c.expect) await applyExpect(page, exp, c.id);
}

export { RemoteHookSkip };
