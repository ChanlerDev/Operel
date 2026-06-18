import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type McpClient = "codex" | "claude";

export type InstallMcpConfigInput = {
  client: McpClient;
  configPath?: string;
  command?: string;
  now?: () => Date;
};

export type InstallMcpConfigResult = {
  client: McpClient;
  server_name: string;
  config_path: string;
  backup_path?: string;
  command: string;
  args: string[];
};

const serverName = "operel-computer-use";
const serverArgs = ["mcp"];

export function installMcpConfig(input: InstallMcpConfigInput): InstallMcpConfigResult {
  const configPath = input.configPath ?? defaultMcpConfigPath(input.client);
  const command = input.command ?? "operel-computer-use";
  const now = input.now ?? (() => new Date());
  const backupPath = backupExistingConfig(configPath, now);

  mkdirSync(dirname(configPath), { recursive: true });
  if (input.client === "codex") {
    writeFileSync(configPath, installCodexConfig(readText(configPath), command));
  } else {
    writeFileSync(configPath, installClaudeConfig(readText(configPath), command));
  }

  return {
    client: input.client,
    server_name: serverName,
    config_path: configPath,
    ...(backupPath ? { backup_path: backupPath } : {}),
    command,
    args: [...serverArgs],
  };
}

export function defaultMcpConfigPath(client: McpClient): string {
  const home = process.env.HOME ?? process.cwd();
  return client === "codex" ? join(home, ".codex/config.toml") : join(home, ".claude/settings.json");
}

function installCodexConfig(existing: string, command: string): string {
  const withoutExisting = removeTomlTable(existing, `[mcp_servers.${serverName}]`).trimEnd();
  const block = [
    `[mcp_servers.${serverName}]`,
    `type = "stdio"`,
    `command = ${tomlString(command)}`,
    `args = [${serverArgs.map(tomlString).join(", ")}]`,
  ].join("\n");

  return withoutExisting ? `${withoutExisting}\n\n${block}\n` : `${block}\n`;
}

function installClaudeConfig(existing: string, command: string): string {
  const parsed = parseJsonObject(existing);
  const mcpServers = isObject(parsed.mcpServers) ? parsed.mcpServers : {};
  return `${JSON.stringify(
    {
      ...parsed,
      mcpServers: {
        ...mcpServers,
        [serverName]: {
          command,
          args: [...serverArgs],
        },
      },
    },
    null,
    2,
  )}\n`;
}

function backupExistingConfig(path: string, now: () => Date): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  const backupPath = `${path}.bak.${now().toISOString().replace(/[:.]/g, "-")}`;
  writeFileSync(backupPath, readFileSync(path, "utf8"));
  return backupPath;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function removeTomlTable(input: string, tableHeader: string): string {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === tableHeader) {
      skipping = true;
      continue;
    }
    if (skipping && /^\[[^\]]+\]\s*$/.test(trimmed)) {
      skipping = false;
    }
    if (!skipping) {
      output.push(line);
    }
  }

  return output.join("\n");
}

function parseJsonObject(input: string): Record<string, unknown> {
  if (!input.trim()) {
    return {};
  }

  const value = JSON.parse(input) as unknown;
  return isObject(value) ? value : {};
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
