import { describe, expect, it } from "vitest";

import { resolveClickTarget } from "../../src/core/targets.js";
import type { AccessibilityNode } from "../../src/runtime/accessibility.js";

function node(input: Partial<AccessibilityNode>): AccessibilityNode {
  return {
    runtime_handle: "",
    role: "AXButton",
    label: "",
    value: "",
    enabled: true,
    frame: { x: 0, y: 0, width: 0, height: 0 },
    children: [],
    ...input,
  };
}

describe("resolveClickTarget", () => {
  it("resolves a unique target label to the element center", () => {
    const result = resolveClickTarget(
      { target: "Save" },
      [
        node({ label: "Cancel", frame: { x: 10, y: 20, width: 100, height: 40 } }),
        node({ label: "Save", frame: { x: 50, y: 100, width: 80, height: 20 } }),
      ],
    );

    expect(result).toEqual({
      ok: true,
      click: {
        x: 90,
        y: 110,
      },
    });
  });

  it("rejects ambiguous target labels instead of choosing one", () => {
    const result = resolveClickTarget(
      { target: "Save" },
      [
        node({ label: "Save", frame: { x: 0, y: 0, width: 10, height: 10 } }),
        node({ label: "Save As", frame: { x: 20, y: 0, width: 10, height: 10 } }),
      ],
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ambiguous_target",
        message: "Target matched multiple accessibility elements.",
        recoverable: true,
      },
    });
  });

  it("rejects missing or non-clickable targets", () => {
    expect(resolveClickTarget({ target: "Save" }, [])).toEqual({
      ok: false,
      error: {
        code: "target_not_found",
        message: "Target did not match a visible accessibility element.",
        recoverable: true,
      },
    });

    expect(resolveClickTarget({ target: "Save" }, [node({ label: "Save", enabled: false })])).toEqual({
      ok: false,
      error: {
        code: "target_not_found",
        message: "Target did not match a visible accessibility element.",
        recoverable: true,
      },
    });
  });
});
