import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime apps.list", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("returns running macOS apps with stable fields", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("apps.list", {});

      expect(result).toMatchObject({
        apps: expect.any(Array),
      });
      const apps = (result as { apps: unknown[] }).apps;
      expect(apps.length).toBeGreaterThan(0);
      expect(apps[0]).toMatchObject({
        app_id: expect.any(String),
        name: expect.any(String),
        pid: expect.any(Number),
        is_active: expect.any(Boolean),
        windows: expect.any(Array),
      });
    } finally {
      await client.close();
    }
  });

  it("includes visible windows reported by macOS", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = (await client.request("apps.list", {})) as {
        apps: Array<{ windows: unknown[] }>;
      };

      const windows = result.apps.flatMap((app) => app.windows);
      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0]).toMatchObject({
        window_id: expect.any(String),
        title: expect.any(String),
        bounds: {
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        },
      });
    } finally {
      await client.close();
    }
  });
});
