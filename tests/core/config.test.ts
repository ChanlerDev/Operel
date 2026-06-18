import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/core/config.js";

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
        denied: [],
        prompt: [],
      },
      policy: {
        require_confirmation_for_risky_actions: true,
        redact_sensitive_text_in_logs: true,
      },
    });
  });
});
