import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { installMcpConfig } from "../../src/core/mcp-install.js";

const fixedNow = () => new Date("2026-06-18T00:00:00.000Z");

describe("installMcpConfig", () => {
  it("installs a Codex MCP server table and backs up existing config", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-codex-install-"));
    const configPath = join(root, "config.toml");
    writeFileSync(
      configPath,
      [
        'model = "gpt-5"',
        "",
        "[mcp_servers.existing]",
        'command = "existing"',
        'args = ["mcp"]',
        "",
      ].join("\n"),
    );

    const result = installMcpConfig({
      client: "codex",
      configPath,
      command: "/usr/local/bin/operel-computer-use",
      now: fixedNow,
    });

    const text = readFileSync(configPath, "utf8");
    expect(result).toMatchObject({
      client: "codex",
      server_name: "operel-computer-use",
      config_path: configPath,
      backup_path: `${configPath}.bak.2026-06-18T00-00-00-000Z`,
      command: "/usr/local/bin/operel-computer-use",
      args: ["mcp"],
    });
    expect(existsSync(result.backup_path ?? "")).toBe(true);
    expect(text).toContain("[mcp_servers.existing]");
    expect(text).toContain("[mcp_servers.operel-computer-use]");
    expect(text).toContain('command = "/usr/local/bin/operel-computer-use"');
    expect(text).toContain('args = ["mcp"]');
  });

  it("replaces an existing Codex Operel table instead of duplicating it", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-codex-replace-"));
    const configPath = join(root, "config.toml");
    writeFileSync(
      configPath,
      [
        "[mcp_servers.operel-computer-use]",
        'command = "old"',
        'args = ["old"]',
        "",
        "[mcp_servers.other]",
        'command = "other"',
        "",
      ].join("\n"),
    );

    installMcpConfig({ client: "codex", configPath, command: "new-operel", now: fixedNow });

    const text = readFileSync(configPath, "utf8");
    expect(text.match(/\[mcp_servers\.operel-computer-use\]/g)).toHaveLength(1);
    expect(text).toContain('command = "new-operel"');
    expect(text).toContain("[mcp_servers.other]");
    expect(text).not.toContain('command = "old"');
  });

  it("installs a Claude Code MCP server entry and preserves existing settings", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-claude-install-"));
    const configPath = join(root, "settings.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          outputStyle: "Explanatory",
          mcpServers: {
            existing: {
              command: "existing",
              args: [],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = installMcpConfig({
      client: "claude",
      configPath,
      command: "/opt/operel/bin/operel-computer-use",
      now: fixedNow,
    });
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;

    expect(result.backup_path).toBe(`${configPath}.bak.2026-06-18T00-00-00-000Z`);
    expect(parsed).toMatchObject({
      outputStyle: "Explanatory",
      mcpServers: {
        existing: {
          command: "existing",
          args: [],
        },
        "operel-computer-use": {
          command: "/opt/operel/bin/operel-computer-use",
          args: ["mcp"],
        },
      },
    });
  });
});
