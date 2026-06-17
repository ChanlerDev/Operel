import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

describe("operel-computer-use mcp", () => {
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
});
