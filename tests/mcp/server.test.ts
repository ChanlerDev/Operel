import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { SessionStore } from "../../src/core/session.js";
import { createComputerUseServer } from "../../src/mcp/server.js";

async function connectTestClient(sessionStore = new SessionStore()) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createComputerUseServer({ sessionStore });
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

  it("creates and closes sessions through MCP tools", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "mcpid",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const created = await client.callTool({
        name: "start_session",
        arguments: {
          task: "Inspect TextEdit",
          app: "TextEdit",
        },
      });

      expect(created.structuredContent).toMatchObject({
        session_id: "sess_mcpid",
        status: "active",
        task: "Inspect TextEdit",
        app: "TextEdit",
      });

      const closed = await client.callTool({
        name: "close_session",
        arguments: {
          session_id: "sess_mcpid",
          reason: "completed",
        },
      });

      expect(closed.structuredContent).toMatchObject({
        session_id: "sess_mcpid",
        status: "completed",
      });
    } finally {
      await server.close();
    }
  });

  it("reads the session resource", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "resourceid",
    });
    sessionStore.startSession({ task: "Read sessions" });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const resource = await client.readResource({ uri: "operel://sessions" });
      const firstContent = resource.contents[0];
      const text = firstContent && "text" in firstContent ? firstContent.text : undefined;

      expect(JSON.parse(String(text))).toMatchObject({
        sessions: [
          {
            session_id: "sess_resourceid",
            task: "Read sessions",
            status: "active",
          },
        ],
      });
    } finally {
      await server.close();
    }
  });

  it("returns runtime permission diagnostics from permission_check", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "permission_check",
        arguments: {},
      });

      expect(result.structuredContent).toMatchObject({
        screen_recording: expect.stringMatching(/^(granted|missing|unknown)$/),
        accessibility: expect.stringMatching(/^(granted|missing|unknown)$/),
        helper_status: expect.stringMatching(/^(ok|failed)$/),
        next_steps: expect.any(Array),
      });
    } finally {
      await server.close();
    }
  });

  it("returns running apps from list_apps", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "list_apps",
        arguments: {},
      });

      const structured = result.structuredContent as { apps?: unknown[] };
      expect(Array.isArray(structured.apps)).toBe(true);
      expect(structured.apps?.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("returns windows grouped from app list in list_windows", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "list_windows",
        arguments: {},
      });

      expect(result.structuredContent).toMatchObject({
        windows: expect.any(Array),
      });
    } finally {
      await server.close();
    }
  });
});
