import { test } from "@playwright/test";
import { casesForPlaywrightProject } from "../cases/load.ts";
import { RemoteHookSkip, runE2ECase } from "./case-runner.ts";

for (const c of casesForPlaywrightProject("pixel")) {
  test(`${c.id}: ${c.title}`, async ({ page }, info) => {
    info.annotations.push({ type: "id", description: c.id });
    info.annotations.push({ type: "gate", description: c.gate });
    info.annotations.push({ type: "layer", description: c.layer });
    try {
      await runE2ECase(page, c, info);
    } catch (err) {
      if (err instanceof RemoteHookSkip) {
        console.warn(err.message);
        test.skip(true, err.message);
      }
      throw err;
    }
  });
}
