import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";

const helperPath = join(process.cwd(), "macos/.build/debug/OperelRuntime");

describe("OperelRuntime ax.read_tree", () => {
  beforeAll(() => {
    const build = spawnSync("swift", ["build"], {
      cwd: join(process.cwd(), "macos"),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`swift build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("returns an accessibility tree envelope", async () => {
    const client = new RuntimeClient({ command: helperPath });

    try {
      const result = await client.request("ax.read_tree", {
        max_depth: 2,
        max_nodes: 20,
      });

      expect(result).toMatchObject({
        tree_id: expect.stringMatching(/^tree_/),
        nodes: expect.any(Array),
      });
    } finally {
      await client.close();
    }
  });
});
