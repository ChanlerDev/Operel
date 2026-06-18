import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type AccessibilityNode = {
  runtime_handle: string;
  role: string;
  label: string;
  value: string;
  redacted?: boolean;
  enabled: boolean;
  frame: { x: number; y: number; width: number; height: number };
  children: AccessibilityNode[];
};

export type AccessibilityTree = {
  tree_id: string;
  nodes: AccessibilityNode[];
};

export async function readAccessibilityTree(input: {
  app?: string;
  bundle_id?: string;
  max_depth?: number;
  max_nodes?: number;
} = {}): Promise<AccessibilityTree> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    return redactAccessibilityTree(normalizeTree(await client.request("ax.read_tree", input)));
  } finally {
    await client.close();
  }
}

export function redactAccessibilityTree(tree: AccessibilityTree): AccessibilityTree {
  return {
    tree_id: tree.tree_id,
    nodes: tree.nodes.map((node) => redactNode(node)),
  };
}

export function flattenAccessibilityNodes(nodes: AccessibilityNode[]): AccessibilityNode[] {
  return nodes.flatMap((node) => [node, ...flattenAccessibilityNodes(node.children)]);
}

function normalizeTree(result: unknown): AccessibilityTree {
  const value = isObject(result) ? result : {};
  return {
    tree_id: stringValue(value.tree_id),
    nodes: Array.isArray(value.nodes) ? value.nodes.filter(isObject).map(normalizeNode) : [],
  };
}

function normalizeNode(value: Record<string, unknown>): AccessibilityNode {
  const frame = isObject(value.frame) ? value.frame : {};
  const redacted = typeof value.redacted === "boolean" ? value.redacted : undefined;
  return {
    runtime_handle: stringValue(value.runtime_handle),
    role: stringValue(value.role),
    label: stringValue(value.label),
    value: stringValue(value.value),
    ...(redacted === undefined ? {} : { redacted }),
    enabled: Boolean(value.enabled),
    frame: {
      x: numberValue(frame.x),
      y: numberValue(frame.y),
      width: numberValue(frame.width),
      height: numberValue(frame.height),
    },
    children: Array.isArray(value.children) ? value.children.filter(isObject).map(normalizeNode) : [],
  };
}

function redactNode(node: AccessibilityNode, sensitiveContext = false): AccessibilityNode {
  const roleSensitive = isSensitiveRole(node.role);
  const labelSensitive = hasSensitiveHint(node.label);
  const valueSensitive = hasSensitiveHint(node.value);
  const nextSensitiveContext = sensitiveContext || roleSensitive || labelSensitive;
  const redactedLabel = labelSensitive && looksLikeSecret(node.label) ? "[REDACTED]" : node.label;
  const shouldRedactValue = node.value !== "" && (nextSensitiveContext || valueSensitive || looksLikeSecret(node.value));

  return {
    ...node,
    label: redactedLabel,
    value: shouldRedactValue ? "[REDACTED]" : node.value,
    redacted: node.redacted || shouldRedactValue || redactedLabel !== node.label || undefined,
    children: node.children.map((child) => redactNode(child, nextSensitiveContext)),
  };
}

function isSensitiveRole(role: string): boolean {
  return /secure|password/i.test(role);
}

function hasSensitiveHint(value: string): boolean {
  return /password|passcode|credential|secret|token|api[_ -]?key|private[_ -]?key/i.test(value) || looksLikeSecret(value);
}

function looksLikeSecret(value: string): boolean {
  return [
    /sk-[a-z0-9_-]{8,}/i,
    /sk-proj-[a-z0-9_-]{8,}/i,
    /xox[baprs]-[a-z0-9-]{8,}/i,
    /gh[pousr]_[a-z0-9_]{20,}/i,
    /[a-z0-9+/]{32,}={0,2}/i,
  ].some((pattern) => pattern.test(value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
