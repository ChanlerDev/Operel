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
