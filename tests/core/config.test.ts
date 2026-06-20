import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { initConfig, loadConfig, setAccessMode } from "../../src/core/config.js";

describe("loadConfig", () => {
  it("loads app and policy settings from TOML", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-config-"));
    const path = join(root, "config.toml");
    writeFileSync(
      path,
      `
[apps]
allowed = ["TextEdit"]
denied = ["System Settings"]
prompt = ["Safari"]

[access]
mode = "confirm_on_retry"

[policy]
require_confirmation_for_risky_actions = true
redact_sensitive_text_in_logs = true
`,
    );

    expect(loadConfig(path)).toEqual({
      apps: {
        allowed: ["TextEdit"],
        denied: ["System Settings"],
        prompt: ["Safari"],
      },
      access: {
        mode: "confirm_on_retry",
      },
      policy: {
        require_confirmation_for_risky_actions: true,
        redact_sensitive_text_in_logs: true,
      },
    });
  });

  it("returns safe defaults when the config file is missing", () => {
    expect(loadConfig("/missing/config.toml")).toEqual({
      apps: {
        allowed: [],
        denied: ["System Settings", "com.apple.SystemSettings", "Keychain Access", "com.apple.keychainaccess"],
        prompt: [],
      },
      access: {
        mode: "manual",
      },
      policy: {
        require_confirmation_for_risky_actions: true,
        redact_sensitive_text_in_logs: true,
      },
    });
  });

  it("initializes a default config file without overwriting", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-config-init-"));
    const path = join(root, "config.toml");

    const created = initConfig(path);
    const skipped = initConfig(path);

    expect(created).toEqual({ path, created: true });
    expect(skipped).toEqual({ path, created: false });
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("[apps]");
    expect(loadConfig(path)).toEqual({
      apps: {
        allowed: [],
        denied: ["System Settings", "com.apple.SystemSettings", "Keychain Access", "com.apple.keychainaccess"],
        prompt: [],
      },
      access: {
        mode: "manual",
      },
      policy: {
        require_confirmation_for_risky_actions: true,
        redact_sensitive_text_in_logs: true,
      },
    });
  });

  it("updates access mode while preserving app policy", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-config-mode-"));
    const path = join(root, "config.toml");
    writeFileSync(
      path,
      `
[access]
mode = "manual"

[apps]
allowed = ["TextEdit"]
denied = ["System Settings"]
prompt = []
`,
    );

    const result = setAccessMode("full_access", path);

    expect(result).toEqual({ path, mode: "full_access" });
    expect(loadConfig(path)).toMatchObject({
      access: { mode: "full_access" },
      apps: {
        allowed: ["TextEdit"],
        denied: ["System Settings"],
        prompt: [],
      },
    });
  });
});
