import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type ActivateAppInput = {
  app?: string;
  bundle_id?: string;
  window_id?: string;
};

export type ActivateAppResult = {
  active_app: string;
  active_window_id: string;
};

export async function activateApp(input: ActivateAppInput): Promise<ActivateAppResult> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath, requestTimeoutMs: 12_000 });

  try {
    const result = await client.request("app.activate", input);
    return normalizeActivateResult(result);
  } finally {
    await client.close();
  }
}

function normalizeActivateResult(result: unknown): ActivateAppResult {
  const value = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  return {
    active_app: typeof value.active_app === "string" ? value.active_app : "",
    active_window_id: typeof value.active_window_id === "string" ? value.active_window_id : "",
  };
}
