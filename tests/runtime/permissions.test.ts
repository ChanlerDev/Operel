import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime permissions.check", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("returns macOS permission diagnostics", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("permissions.check", {});

      expect(result).toMatchObject({
        screen_recording: expect.stringMatching(/^(granted|missing|unknown)$/),
        accessibility: expect.stringMatching(/^(granted|missing|unknown)$/),
        automation: expect.stringMatching(/^(not_requested|unknown)$/),
        input_monitoring: expect.stringMatching(/^(not_requested|unknown)$/),
        binary_path: expect.stringContaining("OperelRuntime"),
        code_signing: {
          status: expect.stringMatching(/^(signed|adhoc|unsigned|unknown)$/),
          identity: expect.any(String),
          team_identifier: expect.any(String),
        },
      });
    } finally {
      await client.close();
    }
  });
});
