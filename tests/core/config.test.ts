import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { initConfig, loadConfig } from "../../src/core/config.js";

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
      policy: {
        require_confirmation_for_risky_actions: true,
        redact_sensitive_text_in_logs: true,
      },
    });
  });
});
