import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime input", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("releases modifier keys as a safe recovery action", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("input.release_modifiers", {});

      expect(result).toEqual({
        released: ["cmd", "shift", "option", "control"],
      });
    } finally {
      await client.close();
    }
  });

  it("accepts a non-text key press request", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("input.press_key", {
        key: "Escape",
        modifiers: [],
      });

      expect(result).toEqual({
        performed: true,
      });
    } finally {
      await client.close();
    }
  });

  it("types text through the paste strategy and restores clipboard", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("input.type_text", {
        text: "hello from operel",
        strategy: "paste",
        sensitive: false,
      });

      expect(result).toEqual({
        strategy_used: "paste",
        clipboard_restored: true,
      });
    } finally {
      await client.close();
    }
  });

  it("accepts a zero-distance scroll request", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("input.scroll", {
        x: 0,
        y: 0,
        delta_x: 0,
        delta_y: 0,
      });

      expect(result).toEqual({
        performed: true,
      });
    } finally {
      await client.close();
    }
  });

  it("rejects click requests without coordinates or element handles", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      await expect(client.request("input.click", {})).rejects.toThrow(
        "input.click requires x and y coordinates.",
      );
    } finally {
      await client.close();
    }
  });
});
