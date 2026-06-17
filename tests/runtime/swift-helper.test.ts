import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime Swift helper", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("responds to runtime.ping over stdio JSON-RPC", async () => {
    expect(existsSync(helperPath)).toBe(true);
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("runtime.ping", {});

      expect(result).toMatchObject({
        version: "0.1.0",
        platform: "macos",
      });
      expect(result).toHaveProperty("pid");
    } finally {
      await client.close();
    }
  });
});
