import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse } from "smol-toml";

export type OperelConfig = {
  access: {
    mode: AccessMode;
  };
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

export type AccessMode = "manual" | "confirm_on_retry" | "full_access";

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
  const access = isObject(parsed.access) ? parsed.access : {};
  const apps = isObject(parsed.apps) ? parsed.apps : {};
  const policy = isObject(parsed.policy) ? parsed.policy : {};

  return {
    access: {
      mode: accessModeValue(access.mode, "manual"),
    },
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

export function initConfig(path = defaultConfigPath()): { path: string; created: boolean } {
  if (existsSync(path)) {
    return { path, created: false };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, defaultConfigText());
  return { path, created: true };
}

export function setAccessMode(mode: AccessMode, path = defaultConfigPath()): { path: string; mode: AccessMode } {
  const config = loadConfig(path);
  const next = {
    ...config,
    access: { mode },
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatConfigText(next));
  return { path, mode };
}

export function defaultConfigText(): string {
  return formatConfigText(defaultConfig());
}

function formatConfigText(config: OperelConfig): string {
  return [
    "[access]",
    `mode = "${config.access.mode}"`,
    "",
    "[apps]",
    `allowed = ${formatStringArray(config.apps.allowed)}`,
    `denied = ${formatStringArray(config.apps.denied)}`,
    `prompt = ${formatStringArray(config.apps.prompt)}`,
    "",
    "[policy]",
    `require_confirmation_for_risky_actions = ${config.policy.require_confirmation_for_risky_actions}`,
    `redact_sensitive_text_in_logs = ${config.policy.redact_sensitive_text_in_logs}`,
    "",
  ].join("\n");
}

function defaultConfig(): OperelConfig {
  return {
    access: {
      mode: "manual",
    },
    apps: {
      allowed: [],
      denied: ["System Settings", "com.apple.SystemSettings", "Keychain Access", "com.apple.keychainaccess"],
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

function accessModeValue(value: unknown, fallback: AccessMode): AccessMode {
  if (value === "manual" || value === "confirm_on_retry" || value === "full_access") {
    return value;
  }
  return fallback;
}

function formatStringArray(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
