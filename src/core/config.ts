import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "smol-toml";

export type OperelConfig = {
  apps: {
    allowed: string[];
    denied: string[];
    prompt: string[];
  };
  policy: {
    require_confirmation_for_risky_actions: boolean;
    redact_sensitive_text_in_logs: boolean;
  };
};

export function defaultConfigPath(): string {
  return (
    process.env.OPEREL_COMPUTER_USE_CONFIG ??
    join(process.env.OPEREL_COMPUTER_USE_HOME ?? join(process.env.HOME ?? process.cwd(), ".operel/computer-use"), "config.toml")
  );
}

export function loadConfig(path = defaultConfigPath()): OperelConfig {
  if (!existsSync(path)) {
    return defaultConfig();
  }

  const parsed = parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const apps = isObject(parsed.apps) ? parsed.apps : {};
  const policy = isObject(parsed.policy) ? parsed.policy : {};

  return {
    apps: {
      allowed: stringArray(apps.allowed),
      denied: stringArray(apps.denied),
      prompt: stringArray(apps.prompt),
    },
    policy: {
      require_confirmation_for_risky_actions: booleanValue(
        policy.require_confirmation_for_risky_actions,
        true,
      ),
      redact_sensitive_text_in_logs: booleanValue(policy.redact_sensitive_text_in_logs, true),
    },
  };
}

function defaultConfig(): OperelConfig {
  return {
    apps: {
      allowed: [],
      denied: [],
      prompt: [],
    },
    policy: {
      require_confirmation_for_risky_actions: true,
      redact_sensitive_text_in_logs: true,
    },
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
