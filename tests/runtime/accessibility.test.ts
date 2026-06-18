import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import { RuntimeClient } from "../../src/runtime/client.js";
import { redactAccessibilityTree, type AccessibilityNode } from "../../src/runtime/accessibility.js";

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

function node(input: Partial<AccessibilityNode>): AccessibilityNode {
  return {
    runtime_handle: "handle",
    role: "AXTextField",
    label: "",
    value: "",
    enabled: true,
    frame: { x: 0, y: 0, width: 100, height: 20 },
    children: [],
    ...input,
  };
}

describe("redactAccessibilityTree", () => {
  it("redacts values from sensitive controls while preserving useful labels", () => {
    const result = redactAccessibilityTree({
      tree_id: "tree_test",
      nodes: [
        node({ role: "AXSecureTextField", label: "Password", value: "hunter2" }),
        node({ label: "API Key", value: "plain-but-sensitive-context" }),
      ],
    });

    expect(result.nodes).toMatchObject([
      { label: "Password", value: "[REDACTED]", redacted: true },
      { label: "API Key", value: "[REDACTED]", redacted: true },
    ]);
  });

  it("redacts leaked secret text without hiding ordinary labels", () => {
    const result = redactAccessibilityTree({
      tree_id: "tree_test",
      nodes: [
        node({ label: "Token", value: "sk-proj-sensitive123456789" }),
        node({ label: "Save", value: "Save" }),
        node({ label: "sk-proj-labelsecret123456789", value: "" }),
      ],
    });

    expect(result.nodes).toMatchObject([
      { label: "Token", value: "[REDACTED]", redacted: true },
      { label: "Save", value: "Save" },
      { label: "[REDACTED]", value: "", redacted: true },
    ]);
  });

  it("propagates sensitive context to descendants", () => {
    const result = redactAccessibilityTree({
      tree_id: "tree_test",
      nodes: [
        node({
          label: "Credentials",
          value: "",
          children: [node({ label: "Current value", value: "nested-secret-value" })],
        }),
      ],
    });

    expect(result.nodes[0]?.children[0]).toMatchObject({
      label: "Current value",
      value: "[REDACTED]",
      redacted: true,
    });
  });
});
