import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/run.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("CLI runtime call", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("routes call runtime.ping to the Swift helper", async () => {
    const writes: string[] = [];
    const previousHelper = process.env.OPEREL_RUNTIME_HELPER;
    process.env.OPEREL_RUNTIME_HELPER = helperPath;

    try {
      const exitCode = await runCli(["call", "runtime.ping"], {
        write: (chunk) => writes.push(chunk),
      });

      expect(exitCode).toBe(0);
      expect(JSON.parse(writes.join(""))).toMatchObject({
        version: "0.1.0",
        platform: "macos",
      });
    } finally {
      if (previousHelper === undefined) {
        delete process.env.OPEREL_RUNTIME_HELPER;
      } else {
        process.env.OPEREL_RUNTIME_HELPER = previousHelper;
      }
    }
  });
});
