import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { loadSave, writeBest, writeSave } from "../../src/game/save.ts";
import { createSquirrelPack } from "../../src/game/squirrels.ts";
import { GAME_VERSION } from "../../src/game/types.ts";
import { STORAGE_KEY, makeSave } from "./fixtures.ts";
import type { CaseFile, Expectation, Step } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const mem = new Map<string, string>();

function ensureLocalStorage(): void {
  if (typeof (globalThis as { localStorage?: Storage }).localStorage?.getItem === "function") return;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, String(v));
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    },
  });
}

function applyExpect(exp: Expectation, caseId: string): void {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "highScore": {
      assert.equal(loadSave().best, Number(exp.value), tag);
      return;
    }
    case "savePresent": {
      assert.equal(localStorage.getItem(STORAGE_KEY) !== null, Boolean(exp.value), tag);
      return;
    }
    case "versionMatchesPackage": {
      const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
      assert.equal(GAME_VERSION, pkg.version, tag);
      return;
    }
    case "htmlHasVersionTag": {
      const html = readFileSync(join(ROOT, String(exp.file ?? "index.html")), "utf8");
      assert.match(html, new RegExp(`Chassu Rider v${GAME_VERSION.replaceAll(".", "\\.")}`), tag);
      return;
    }
    case "uiUsesVersionLabel": {
      const src = readFileSync(join(ROOT, String(exp.file ?? "src/game/Game.tsx")), "utf8");
      assert.match(src, /GAME_VERSION/, tag);
      assert.doesNotMatch(src, /v1\.\d+\.\d+/, tag);
      return;
    }
    case "squirrelsNotCrashKind": {
      const engine = readFileSync(join(ROOT, "src/game/engine.ts"), "utf8");
      assert.match(engine, /type Kind = "tree" \| "rock" \| "snowman" \| "snowball" \| "gift" \| "gap"/, tag);
      assert.doesNotMatch(engine, /kind === "squirrel"/, tag);
      assert.match(engine, /squirrels\.update\(dt, player, true\)/, tag);
      return;
    }
    case "squirrelsFlee": {
      const scene = new THREE.Scene();
      const pack = createSquirrelPack(scene, () => 0.37);
      const rider = { x: 0, z: 0, hop: 0, speed: 0 };
      pack.reset(rider);
      const before = pack.snapshot();
      assert.equal(before.length, 6, `${tag}: pack size`);
      assert.ok(
        before.every((s) => s.visible),
        `${tag}: title squirrels visible`,
      );
      const target = before[0];
      assert.ok(target, `${tag}: first squirrel`);
      pack.update(0.16, { x: target.x, z: target.z, hop: 0, speed: 17 }, true);
      const after = pack.snapshot()[0];
      assert.ok(after, `${tag}: squirrel after approach`);
      const moved = Math.hypot(after.x - target.x, after.z - target.z);
      assert.ok(after.flee > 0 || moved > 0.01, `${tag}: squirrel should dart away`);
      pack.dispose();
      return;
    }
    default:
      throw new Error(`${tag}: unknown unit assert "${exp.assert}"`);
  }
}

function runStep(step: Step, c: CaseFile): void {
  const tag = `${c.id}/${step.op}`;
  switch (step.op) {
    case "readVersionSources":
    case "nop":
      return;
    case "expect":
      applyExpect(step as unknown as Expectation, c.id);
      return;
    case "persistBest": {
      ensureLocalStorage();
      if (step.reset !== false) localStorage.clear();
      writeSave(makeSave(Number(step.priorBest ?? 0)));
      writeBest(Number(step.score));
      return;
    }
    case "seedHigh": {
      ensureLocalStorage();
      if (step.reset !== false) localStorage.clear();
      writeSave(makeSave(Number(step.score ?? 0)));
      return;
    }
    case "assertSquirrelAmbient":
      applyExpect({ assert: "squirrelsNotCrashKind" }, c.id);
      applyExpect({ assert: "squirrelsFlee" }, c.id);
      return;
    default:
      throw new Error(`${tag}: unknown unit op "${step.op}"`);
  }
}

export function runUnitCase(c: CaseFile): void {
  ensureLocalStorage();
  localStorage.clear();
  for (const step of c.steps) runStep(step, c);
  for (const exp of c.expect) applyExpect(exp, c.id);
}
