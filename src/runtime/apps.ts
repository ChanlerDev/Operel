import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type RuntimeWindow = {
  window_id: string;
  title: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type RuntimeApp = {
  app_id: string;
  name: string;
  bundle_id?: string;
  pid: number;
  is_active: boolean;
  windows: RuntimeWindow[];
};

export async function listApps(): Promise<{ apps: RuntimeApp[] }> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    return normalizeApps(await client.request("apps.list", {}));
  } finally {
    await client.close();
  }
}

function normalizeApps(result: unknown): { apps: RuntimeApp[] } {
  if (!isObject(result) || !Array.isArray(result.apps)) {
    return { apps: [] };
  }

  return {
    apps: result.apps.filter(isObject).map((app) => ({
      app_id: stringValue(app.app_id),
      name: stringValue(app.name),
      bundle_id: stringValue(app.bundle_id),
      pid: numberValue(app.pid),
      is_active: Boolean(app.is_active),
      windows: Array.isArray(app.windows) ? app.windows.filter(isObject).map(normalizeWindow) : [],
    })),
  };
}

function normalizeWindow(window: Record<string, unknown>): RuntimeWindow {
  const bounds = isObject(window.bounds) ? window.bounds : {};
  return {
    window_id: stringValue(window.window_id),
    title: stringValue(window.title),
    bounds: {
      x: numberValue(bounds.x),
      y: numberValue(bounds.y),
      width: numberValue(bounds.width),
      height: numberValue(bounds.height),
    },
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
