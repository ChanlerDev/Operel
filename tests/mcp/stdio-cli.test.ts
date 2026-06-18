import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, it } from "vitest";

describe("operel-computer-use mcp", () => {
  beforeAll(() => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    if (build.status !== 0) {
      throw new Error(`npm run build failed:\n${build.stdout}\n${build.stderr}`);
    }
  });

  it("starts an MCP server over stdio", async () => {
    const transport = new StdioClientTransport({
      command: join(process.cwd(), "node_modules/.bin/tsx"),
      args: ["src/cli.ts", "mcp"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const client = new Client(
      { name: "operel-stdio-test-client", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toContain("start_session");
      expect(tools.tools.map((tool) => tool.name)).toContain("permission_check");
    } finally {
      await client.close();
    }
  });

  it("starts the built CLI MCP server over stdio", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/cli.js", "mcp"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const client = new Client(
      { name: "operel-built-stdio-test-client", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const resources = await client.listResources();

      expect(tools.tools.map((tool) => tool.name)).toContain("start_session");
      expect(resources.resources.map((resource) => resource.uri)).toContain("operel://sessions");
    } finally {
      await client.close();
    }
  });

  it("uses OPEREL_COMPUTER_USE_CONFIG policy in stdio server", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "operel-stdio-config-"));
    const configPath = join(configDir, "config.toml");
    writeFileSync(
      configPath,
      `
[apps]
denied = ["System Settings"]
`,
    );
    const transport = new StdioClientTransport({
      command: join(process.cwd(), "node_modules/.bin/tsx"),
      args: ["src/cli.ts", "mcp"],
      cwd: process.cwd(),
      env: {
        OPEREL_COMPUTER_USE_CONFIG: configPath,
        OPEREL_RUNTIME_HELPER: join(process.cwd(), "macos/.build/debug/OperelRuntime"),
      },
      stderr: "pipe",
    });
    const client = new Client(
      { name: "operel-stdio-policy-test-client", version: "0.1.0" },
      { capabilities: {} },
    );

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "open_app",
        arguments: { app: "System Settings" },
      });

      expect(result.structuredContent).toEqual({
        error: {
          code: "app_denied",
          message: "App is denied by policy.",
          recoverable: false,
        },
      });
    } finally {
      await client.close();
    }
  });
});
