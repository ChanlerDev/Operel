import type { AccessibilityNode } from "../runtime/accessibility.js";

export type ClickTargetInput = {
  target?: string;
};

export type ClickTargetResolution =
  | {
      ok: true;
      click: {
        x: number;
        y: number;
      };
    }
  | {
      ok: false;
      error: {
        code: "target_not_found" | "ambiguous_target";
        message: string;
        recoverable: true;
      };
    };

export function resolveClickTarget(
  input: ClickTargetInput,
  elements: AccessibilityNode[],
): ClickTargetResolution {
  const query = input.target?.trim().toLocaleLowerCase();
  if (!query) {
    return {
      ok: false,
      error: {
        code: "target_not_found",
        message: "Target did not match a visible accessibility element.",
        recoverable: true,
      },
    };
  }

  const candidates = elements.filter((element) => isVisibleAndEnabled(element) && matchesTarget(element, query));

  if (candidates.length === 0) {
    return {
      ok: false,
      error: {
        code: "target_not_found",
        message: "Target did not match a visible accessibility element.",
        recoverable: true,
      },
    };
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      error: {
        code: "ambiguous_target",
        message: "Target matched multiple accessibility elements.",
        recoverable: true,
      },
    };
  }

  const [candidate] = candidates;
  return {
    ok: true,
    click: {
      x: Math.round(candidate.frame.x + candidate.frame.width / 2),
      y: Math.round(candidate.frame.y + candidate.frame.height / 2),
    },
  };
}

function isVisibleAndEnabled(element: AccessibilityNode): boolean {
  return element.enabled && element.frame.width > 0 && element.frame.height > 0;
}

function matchesTarget(element: AccessibilityNode, query: string): boolean {
  return [element.label, element.value, element.role]
    .map((value) => value.trim().toLocaleLowerCase())
    .some((value) => value === query || value.includes(query));
}
