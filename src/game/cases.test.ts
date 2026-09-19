import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCatalog, casesForPlaywrightProject, loadCases } from "../../tests/cases/load.ts";
import { runUnitCase } from "../../tests/cases/unit-runner.ts";

test("JSON case catalog covers Chassu Rider A–C with correct gates", () => {
  assertCatalog(loadCases());
});

test("C14 is a block pixel case with measurable layout expects", () => {
  const pixel = casesForPlaywrightProject("pixel");
  const desktop = casesForPlaywrightProject("desktop");
  const c14 = pixel.find((c) => c.id === "C14");
  assert.ok(c14, "pixel project must run C14");
  assert.equal(c14.layer, "pixel");
  assert.equal(c14.gate, "block");
  assert.ok(
    !desktop.some((c) => c.id.startsWith("C")),
    "desktop project must not register C14 (skip-free pixel ownership)",
  );

  const names = [...c14.steps, ...c14.expect]
    .map((x) => String((x as { assert?: string }).assert ?? ""))
    .filter(Boolean);
  for (const required of ["viewport", "noVerticalClip", "boardUsable"]) {
    assert.ok(names.includes(required), `C14 must assert ${required} (got ${names.join(",")})`);
  }
});

for (const c of loadCases({ layer: "unit" })) {
  test(`${c.id}: ${c.title}`, () => {
    runUnitCase(c);
  });
}
