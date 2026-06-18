import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime screen.capture", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("captures the main display to a temporary PNG", async () => {
    const client = new RuntimeClient({ command: helperPath, requestTimeoutMs: 10_000 });

    try {
      const result = (await client.request("screen.capture", {
        scope: "display",
        format: "png",
      })) as {
        tmp_path: string;
        width: number;
        height: number;
        pixel_width: number;
        pixel_height: number;
        scale: number;
        display_id: number;
        coordinate_space: string;
      };

      expect(result.tmp_path).toMatch(/\.png$/);
      expect(existsSync(result.tmp_path)).toBe(true);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.pixel_width).toBeGreaterThan(0);
      expect(result.pixel_height).toBeGreaterThan(0);
      expect(result.scale).toBeGreaterThan(0);
      expect(result.display_id).toBeGreaterThan(0);
      expect(result.coordinate_space).toBe("logical_points");
    } finally {
      await client.close();
    }
  });

  it("captures a display rect to a temporary PNG", async () => {
    const client = new RuntimeClient({ command: helperPath, requestTimeoutMs: 10_000 });

    try {
      const result = (await client.request("screen.capture", {
        scope: "rect",
        rect: { x: 0, y: 0, width: 120, height: 80 },
        format: "png",
      })) as {
        tmp_path: string;
        width: number;
        height: number;
        pixel_width: number;
        pixel_height: number;
        coordinate_space: string;
      };

      expect(result.tmp_path).toMatch(/\.png$/);
      expect(existsSync(result.tmp_path)).toBe(true);
      expect(result.width).toBe(120);
      expect(result.height).toBe(80);
      expect(result.pixel_width).toBeGreaterThan(0);
      expect(result.pixel_height).toBeGreaterThan(0);
      expect(result.coordinate_space).toBe("logical_points");
    } finally {
      await client.close();
    }
  });

  it("returns a target error for missing window screenshots", async () => {
    const client = new RuntimeClient({ command: helperPath, requestTimeoutMs: 10_000 });

    try {
      await expect(
        client.request("screen.capture", {
          scope: "window",
          window_id: "win_0",
          format: "png",
        }),
      ).rejects.toThrow("Window was not found for screenshot capture.");
    } finally {
      await client.close();
    }
  });
});
