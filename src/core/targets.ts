import type { AccessibilityNode } from "../runtime/accessibility.js";

export type ClickTargetInput = {
  target?: string;
  selector?: {
    role?: string;
    label?: string;
    value?: string;
  };
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
  const selector = normalizeSelector(input.selector);
  const query = input.target?.trim().toLocaleLowerCase();
  if (!query && !selector) {
    return {
      ok: false,
      error: {
        code: "target_not_found",
        message: "Target did not match a visible accessibility element.",
        recoverable: true,
      },
    };
  }

  const candidates = elements.filter(
    (element) =>
      isVisibleAndEnabled(element) &&
      (selector ? matchesSelector(element, selector) : true) &&
      (query ? matchesTarget(element, query) : true),
  );

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

type NormalizedSelector = {
  role?: string;
  label?: string;
  value?: string;
};

function isVisibleAndEnabled(element: AccessibilityNode): boolean {
  return element.enabled && element.frame.width > 0 && element.frame.height > 0;
}

function matchesTarget(element: AccessibilityNode, query: string): boolean {
  return [element.label, element.value, element.role]
    .map((value) => value.trim().toLocaleLowerCase())
    .some((value) => value === query || value.includes(query));
}

function matchesSelector(element: AccessibilityNode, selector: NormalizedSelector): boolean {
  if (selector.role && element.role.trim().toLocaleLowerCase() !== selector.role) {
    return false;
  }
  if (selector.label && !textMatches(element.label, selector.label)) {
    return false;
  }
  if (selector.value && !textMatches(element.value, selector.value)) {
    return false;
  }
  return true;
}

function normalizeSelector(selector: ClickTargetInput["selector"]): NormalizedSelector | undefined {
  if (!selector) {
    return undefined;
  }

  const normalized = {
    role: normalizeSelectorField(selector.role),
    label: normalizeSelectorField(selector.label),
    value: normalizeSelectorField(selector.value),
  };

  return normalized.role || normalized.label || normalized.value ? normalized : undefined;
}

function normalizeSelectorField(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized ? normalized : undefined;
}

function textMatches(value: string, query: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  return normalized === query || normalized.includes(query);
}
