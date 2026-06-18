import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type AccessibilityNode = {
  runtime_handle: string;
  role: string;
  label: string;
  value: string;
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
    return normalizeTree(await client.request("ax.read_tree", input));
  } finally {
    await client.close();
  }
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
  return {
    runtime_handle: stringValue(value.runtime_handle),
    role: stringValue(value.role),
    label: stringValue(value.label),
    value: stringValue(value.value),
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
