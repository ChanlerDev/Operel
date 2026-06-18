import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/run.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("CLI doctor runtime diagnostics", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("prints permission_check-compatible JSON from the Swift helper", async () => {
    const writes: string[] = [];
    const previousHelper = process.env.OPEREL_RUNTIME_HELPER;
    process.env.OPEREL_RUNTIME_HELPER = helperPath;

    try {
      const exitCode = await runCli(["doctor", "--json"], {
        write: (chunk) => writes.push(chunk),
      });

      const result = JSON.parse(writes.join(""));
      expect(exitCode).toBe(0);
      expect(result).toMatchObject({
        screen_recording: expect.stringMatching(/^(granted|missing|unknown)$/),
        accessibility: expect.stringMatching(/^(granted|missing|unknown)$/),
        automation: expect.stringMatching(/^(not_requested|unknown)$/),
        input_monitoring: expect.stringMatching(/^(not_requested|unknown)$/),
        helper_status: "ok",
      });
      expect(Array.isArray(result.next_steps)).toBe(true);
    } finally {
      if (previousHelper === undefined) {
        delete process.env.OPEREL_RUNTIME_HELPER;
      } else {
        process.env.OPEREL_RUNTIME_HELPER = previousHelper;
      }
    }
  });
});
