import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export async function releaseModifiers(): Promise<{ released: string[] }> {
  return runtimeRequest("input.release_modifiers", {});
}

export async function pressKey(input: {
  key: string;
  modifiers?: string[];
}): Promise<{ performed: boolean }> {
  return runtimeRequest("input.press_key", input);
}

export async function typeText(input: {
  text: string;
  strategy?: "auto" | "paste" | "ax_set_value" | "key_events";
  sensitive?: boolean;
}): Promise<{ strategy_used: string; clipboard_restored: boolean }> {
  return runtimeRequest("input.type_text", input);
}

export async function scroll(input: {
  x?: number;
  y?: number;
  delta_x?: number;
  delta_y?: number;
}): Promise<{ performed: boolean }> {
  return runtimeRequest("input.scroll", input);
}

export async function click(input: {
  x?: number;
  y?: number;
  button?: "left" | "right";
  click_count?: number;
  app?: string;
  bundle_id?: string;
  ax_role?: string;
  ax_label?: string;
  ax_value?: string;
  ax_x?: number;
  ax_y?: number;
  ax_width?: number;
  ax_height?: number;
}): Promise<{ performed: boolean }> {
  return runtimeRequest("input.click", input);
}

async function runtimeRequest<T>(method: string, params: unknown): Promise<T> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    return (await client.request(method, params)) as T;
  } finally {
    await client.close();
  }
}
