import { join } from "node:path";

import { RuntimeClient } from "./client.js";

export type PermissionState = "granted" | "missing" | "unknown" | "not_requested";

export type PermissionDiagnostics = {
  screen_recording: PermissionState;
  accessibility: PermissionState;
  automation: PermissionState;
  input_monitoring: PermissionState;
  binary_path: string;
  code_signing: {
    status: "signed" | "adhoc" | "unsigned" | "unknown";
    identity: string;
    team_identifier: string;
  };
  helper_status: "ok" | "failed";
  next_steps: string[];
};

export async function checkPermissions(): Promise<PermissionDiagnostics> {
  const helperPath =
    process.env.OPEREL_RUNTIME_HELPER ?? join(process.cwd(), "macos/.build/debug/OperelRuntime");
  const client = new RuntimeClient({ command: helperPath });

  try {
    const result = await client.request("permissions.check", {});
    const diagnostics = normalizePermissions(result);
    return {
      ...diagnostics,
      helper_status: "ok",
      next_steps: nextStepsFor(diagnostics),
    };
  } catch (error) {
    return {
      screen_recording: "unknown",
      accessibility: "unknown",
      automation: "unknown",
      input_monitoring: "unknown",
      binary_path: "",
      code_signing: {
        status: "unknown",
        identity: "unknown",
        team_identifier: "",
      },
      helper_status: "failed",
      next_steps: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    await client.close();
  }
}

function normalizePermissions(result: unknown): Omit<PermissionDiagnostics, "helper_status" | "next_steps"> {
  const value = isObject(result) ? result : {};
  return {
    screen_recording: normalizePermission(value.screen_recording),
    accessibility: normalizePermission(value.accessibility),
    automation: normalizePermission(value.automation),
    input_monitoring: normalizePermission(value.input_monitoring),
    binary_path: stringValue(value.binary_path),
    code_signing: normalizeCodeSigning(value.code_signing),
  };
}

function normalizeCodeSigning(value: unknown): PermissionDiagnostics["code_signing"] {
  const object = isObject(value) ? value : {};
  const status = object.status;
  return {
    status: status === "signed" || status === "adhoc" || status === "unsigned" || status === "unknown" ? status : "unknown",
    identity: stringValue(object.identity) || "unknown",
    team_identifier: stringValue(object.team_identifier),
  };
}

function normalizePermission(value: unknown): PermissionState {
  if (value === "granted" || value === "missing" || value === "unknown" || value === "not_requested") {
    return value;
  }
  return "unknown";
}

function nextStepsFor(
  diagnostics: Omit<PermissionDiagnostics, "helper_status" | "next_steps">,
): string[] {
  const steps: string[] = [];

  if (diagnostics.screen_recording === "missing") {
    steps.push("Grant Screen Recording permission in System Settings > Privacy & Security.");
  }

  if (diagnostics.accessibility === "missing") {
    steps.push("Grant Accessibility permission in System Settings > Privacy & Security.");
  }

  if (diagnostics.code_signing.status === "adhoc") {
    steps.push("Runtime helper is ad-hoc signed; macOS permissions may need to be re-granted after rebuilds.");
  }

  return steps;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
