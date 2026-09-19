import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCK_CASE_IDS, REQUIRED_CASE_IDS, type CaseFile, type Expectation, type Layer } from "./types.ts";

const CASES_DIR = dirname(fileURLToPath(import.meta.url));

function asExpect(raw: unknown, file: string): Expectation[] {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || typeof (item as Expectation).assert !== "string") {
        throw new Error(`${file}: each expect[] entry needs an "assert" string`);
      }
    }
    return raw as Expectation[];
  }
  if (raw && typeof raw === "object" && typeof (raw as Expectation).assert === "string") {
    return [raw as Expectation];
  }
  throw new Error(`${file}: "expect" must be an assertion object or an array of them`);
}

export function parseCase(raw: unknown, file: string): CaseFile {
  if (!raw || typeof raw !== "object") throw new Error(`${file}: case must be a JSON object`);
  const o = raw as Record<string, unknown>;
  for (const key of ["id", "layer", "title", "steps", "expect", "gate"]) {
    if (!(key in o)) throw new Error(`${file}: missing required field "${key}"`);
  }
  if (typeof o.id !== "string" || !o.id) throw new Error(`${file}: id must be a non-empty string`);
  if (o.layer !== "unit" && o.layer !== "e2e" && o.layer !== "pixel") {
    throw new Error(`${file}: layer must be unit | e2e | pixel`);
  }
  if (typeof o.title !== "string" || !o.title) throw new Error(`${file}: title must be a string`);
  if (!Array.isArray(o.steps)) throw new Error(`${file}: steps must be an array`);
  for (const step of o.steps) {
    if (!step || typeof step !== "object" || typeof (step as { op?: unknown }).op !== "string") {
      throw new Error(`${file}: each step needs an "op" string`);
    }
  }
  if (o.gate !== "block" && o.gate !== "optional") {
    throw new Error(`${file}: gate must be block | optional`);
  }
  if (o.viewport != null && o.viewport !== "pixel" && o.viewport !== "desktop") {
    throw new Error(`${file}: viewport must be pixel | desktop when set`);
  }
  return {
    id: o.id,
    layer: o.layer,
    title: o.title,
    steps: o.steps as CaseFile["steps"],
    expect: asExpect(o.expect, file),
    gate: o.gate,
    viewport: o.viewport as CaseFile["viewport"],
  };
}

/** Pixel project owns e2e + pixel cases. Desktop only runs viewport:desktop smokes. */
export function casesForPlaywrightProject(project: "pixel" | "desktop"): CaseFile[] {
  return loadCases().filter((c) => {
    if (c.layer === "unit") return false;
    if (project === "desktop") return c.viewport === "desktop";
    return (c.layer === "e2e" || c.layer === "pixel") && c.viewport !== "desktop";
  });
}

export function loadCases(filter?: { layer?: Layer | Layer[] }): CaseFile[] {
  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) throw new Error(`no JSON cases in ${CASES_DIR}`);
  const layers = filter?.layer ? new Set(Array.isArray(filter.layer) ? filter.layer : [filter.layer]) : null;
  const cases: CaseFile[] = [];
  for (const file of files) {
    const parsed = parseCase(JSON.parse(readFileSync(join(CASES_DIR, file), "utf8")), file);
    if (layers && !layers.has(parsed.layer)) continue;
    cases.push(parsed);
  }
  return cases;
}

export function assertCatalog(cases: CaseFile[] = loadCases()): void {
  const ids = new Set(cases.map((c) => c.id));
  for (const id of REQUIRED_CASE_IDS) {
    assert.ok(ids.has(id), `missing required JSON case ${id} under tests/cases/`);
  }
  for (const id of BLOCK_CASE_IDS) {
    const c = cases.find((x) => x.id === id);
    assert.ok(c, `missing block case ${id}`);
    assert.equal(c.gate, "block", `${id} must have gate: "block"`);
  }
  const seen = new Set<string>();
  for (const c of cases) {
    assert.ok(!seen.has(c.id), `duplicate case id ${c.id}`);
    seen.add(c.id);
  }
}
