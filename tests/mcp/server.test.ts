import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createComputerUseServer } from "../../src/mcp/server.js";

async function connectTestClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createComputerUseServer();
  const client = new Client(
    { name: "operel-test-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

describe("Computer Use MCP server", () => {
  it("lists the MVP tools from the public contract", async () => {
    const { client, server } = await connectTestClient();

    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();

      expect(names).toEqual([
        "activate_window",
        "click",
        "close_session",
        "export_session",
        "list_apps",
        "list_windows",
        "observe",
        "open_app",
        "permission_check",
        "press_key",
        "recover",
        "scroll",
        "start_session",
        "type_text",
        "wait",
      ]);
    } finally {
      await server.close();
    }
  });

  it("lists policy and session resources", async () => {
    const { client, server } = await connectTestClient();

    try {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
        "operel://policy",
        "operel://sessions",
      ]);
    } finally {
      await server.close();
    }
  });

  it("lists safety and operator prompts", async () => {
    const { client, server } = await connectTestClient();

    try {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
        "computer_use_operator",
        "computer_use_safety",
      ]);
    } finally {
      await server.close();
    }
  });
});
