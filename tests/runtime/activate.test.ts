import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime app.activate", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("activates a running app by bundle id", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const listResult = (await client.request("apps.list", {})) as {
        apps: Array<{ name: string; bundle_id: string; pid: number }>;
      };
      const target = listResult.apps.find((app) => app.bundle_id);

      expect(target).toBeDefined();

      const result = await client.request("app.activate", {
        bundle_id: target?.bundle_id,
      });

      expect(result).toMatchObject({
        active_app: expect.any(String),
      });
    } finally {
      await client.close();
    }
  });
});
