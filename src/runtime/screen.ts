import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type ScreenCaptureResult = {
  tmp_path: string;
  width: number;
  height: number;
  pixel_width: number;
  pixel_height: number;
  scale: number;
  display_id: number;
  coordinate_space: string;
};

export type ScreenCaptureInput = {
  scope?: "display" | "app" | "window" | "rect";
  app?: string;
  bundle_id?: string;
  window_id?: string;
  rect?: { x: number; y: number; width: number; height: number };
};

export async function captureScreen(input: ScreenCaptureInput = {}): Promise<ScreenCaptureResult> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath, requestTimeoutMs: 10_000 });

  try {
    return normalizeCapture(
      await client.request("screen.capture", { scope: input.scope ?? "display", format: "png", ...input }),
    );
  } finally {
    await client.close();
  }
}

function normalizeCapture(result: unknown): ScreenCaptureResult {
  const value = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  return {
    tmp_path: stringValue(value.tmp_path),
    width: numberValue(value.width),
    height: numberValue(value.height),
    pixel_width: numberValue(value.pixel_width),
    pixel_height: numberValue(value.pixel_height),
    scale: numberValue(value.scale),
    display_id: numberValue(value.display_id),
    coordinate_space: stringValue(value.coordinate_space),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
