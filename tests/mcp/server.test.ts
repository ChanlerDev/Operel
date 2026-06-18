import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../../src/core/artifacts.js";
import { PolicyEngine } from "../../src/core/policy.js";
import { SessionStore } from "../../src/core/session.js";
import { createComputerUseServer } from "../../src/mcp/server.js";

async function connectTestClient(
  sessionStore = new SessionStore(),
  artifactStore = new ArtifactStore({ root: mkdtempSync(join(tmpdir(), "operel-mcp-artifacts-")) }),
  policy = new PolicyEngine({
    apps: {
      allowed: ["loginwindow", "WindowManager", "辅助功能", "Control Center", "Finder", "Terminal", "iTerm2", "Code"],
      denied: [],
      prompt: [],
    },
  }),
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createComputerUseServer({ sessionStore, artifactStore, policy });
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
      const windows = (result.structuredContent as { windows: unknown[] }).windows;
      expect(windows.length).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it("activates a running app through open_app", async () => {
    const { client, server } = await connectTestClient();

    try {
      const apps = await client.callTool({ name: "list_apps", arguments: {} });
      const target = ((apps.structuredContent as { apps?: Array<{ name?: string }> }).apps ?? []).find(
        (app) => app.name,
      );
      expect(target).toBeDefined();

      const result = await client.callTool({
        name: "open_app",
        arguments: { app: target?.name },
      });

      expect(result.structuredContent).toMatchObject({
        active_app: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });

  it("blocks denied apps before activation", async () => {
    const policy = new PolicyEngine({
      apps: {
        allowed: [],
        denied: ["System Settings"],
        prompt: [],
      },
    });
    const { client, server } = await connectTestClient(new SessionStore(), undefined, policy);

    try {
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
      await server.close();
    }
  });

  it("observes a session with a screenshot artifact", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "observeid",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const session = await client.callTool({
        name: "start_session",
        arguments: { task: "Observe screen" },
      });
      const sessionId = (session.structuredContent as { session_id: string }).session_id;

      const result = await client.callTool({
        name: "observe",
        arguments: {
          session_id: sessionId,
          include_screenshot: true,
          include_accessibility_tree: false,
        },
      });

      expect(result.structuredContent).toMatchObject({
        session_id: sessionId,
        screen: {
          screenshot_uri: expect.stringMatching(
            new RegExp(`^operel://sessions/${sessionId}/artifacts/artifact_`),
          ),
          width: expect.any(Number),
          height: expect.any(Number),
          scale: expect.any(Number),
        },
        elements: [],
      });
    } finally {
      await server.close();
    }
  });

  it("observes accessibility elements when requested", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "axobserve",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const session = await client.callTool({
        name: "start_session",
        arguments: { task: "Observe accessibility" },
      });
      const sessionId = (session.structuredContent as { session_id: string }).session_id;

      const result = await client.callTool({
        name: "observe",
        arguments: {
          session_id: sessionId,
          include_screenshot: false,
          include_accessibility_tree: true,
          max_tree_depth: 2,
        },
      });

      expect(result.structuredContent).toMatchObject({
        session_id: sessionId,
        accessibility_tree_id: expect.stringMatching(/^tree_/),
        elements: expect.any(Array),
      });
      const elements = (result.structuredContent as { elements: Array<{ element_id?: string }> }).elements;
      if (elements.length > 0) {
        expect(elements[0].element_id).toMatch(/^el_/);
      }
    } finally {
      await server.close();
    }
  });

  it("returns a recoverable error for unknown element_id clicks", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "clickel",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const session = await client.callTool({
        name: "start_session",
        arguments: { task: "Click element" },
      });
      const sessionId = (session.structuredContent as { session_id: string }).session_id;

      const result = await client.callTool({
        name: "click",
        arguments: {
          session_id: sessionId,
          element_id: "el_missing",
        },
      });

      expect(result.structuredContent).toEqual({
        error: {
          code: "target_not_found",
          message: "Unknown or expired element_id.",
          recoverable: true,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("recovers by releasing modifiers", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "recover",
        arguments: {},
      });

      expect(result.structuredContent).toMatchObject({
        released: ["cmd", "shift", "option", "control"],
        session_id: expect.stringMatching(/^sess_/),
      });
    } finally {
      await server.close();
    }
  });

  it("presses a key through MCP", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "press_key",
        arguments: {
          key: "Escape",
          modifiers: [],
        },
      });

      expect(result.structuredContent).toMatchObject({
        performed: true,
        session_id: expect.stringMatching(/^sess_/),
      });
    } finally {
      await server.close();
    }
  });

  it("requires approval for sensitive type_text input", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "type_text",
        arguments: {
          text: "sk-proj-sensitive123456789",
        },
      });

      expect(result.structuredContent).toEqual({
        error: {
          code: "approval_required",
          message: "Action requires approval before typing sensitive text.",
          recoverable: true,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("types non-sensitive text through MCP", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "type_text",
        arguments: {
          text: "hello from operel",
        },
      });

      expect(result.structuredContent).toMatchObject({
        strategy_used: "paste",
        clipboard_restored: true,
        session_id: expect.stringMatching(/^sess_/),
      });
    } finally {
      await server.close();
    }
  });

  it("scrolls through MCP", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "scroll",
        arguments: {
          x: 0,
          y: 0,
          delta_x: 0,
          delta_y: 0,
        },
      });

      expect(result.structuredContent).toMatchObject({
        performed: true,
        session_id: expect.stringMatching(/^sess_/),
      });
    } finally {
      await server.close();
    }
  });

  it("returns runtime errors for invalid click calls", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "click",
        arguments: {},
      });

      expect(result.structuredContent).toEqual({
        error: {
          code: "action_failed",
          message: "input.click requires x and y coordinates.",
          recoverable: true,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("records a screenshot artifact for coordinate clicks", async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), "operel-click-artifacts-"));
    const artifactStore = new ArtifactStore({ root: artifactRoot });
    const { client, server } = await connectTestClient(undefined, artifactStore);

    try {
      const result = await client.callTool({
        name: "click",
        arguments: {
          x: 0,
          y: 0,
        },
      });

      expect(result.structuredContent).toMatchObject({
        performed: true,
        session_id: expect.stringMatching(/^sess_/),
        screenshot_uri: expect.stringMatching(/^operel:\/\/sessions\/sess_.*\/artifacts\/artifact_/),
      });
      expect(existsSync((result.structuredContent as { screenshot_path: string }).screenshot_path)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("exports a session manifest", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "exportmcp",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const session = await client.callTool({
        name: "start_session",
        arguments: { task: "Export from MCP" },
      });
      const sessionId = (session.structuredContent as { session_id: string }).session_id;

      const result = await client.callTool({
        name: "export_session",
        arguments: { session_id: sessionId },
      });

      expect(result.structuredContent).toMatchObject({
        session_id: sessionId,
        uri: `operel://sessions/${sessionId}/export`,
        export_path: expect.any(String),
        manifest_path: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });

  it("records action steps with session_id for export audit", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "auditmcp",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const session = await client.callTool({
        name: "start_session",
        arguments: { task: "Audit from MCP" },
      });
      const sessionId = (session.structuredContent as { session_id: string }).session_id;

      await client.callTool({
        name: "wait",
        arguments: { session_id: sessionId, seconds: 0 },
      });

      const steps = sessionStore.listSteps(sessionId);
      expect(steps).toMatchObject([
        {
          tool: "wait",
          input: {
            session_id: sessionId,
            seconds: 0,
          },
          result: {
            waited_ms: 0,
          },
        },
      ]);
    } finally {
      await server.close();
    }
  });

  it("waits through MCP", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "adhoc",
    });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const result = await client.callTool({
        name: "wait",
        arguments: { seconds: 0 },
      });

      expect(result.structuredContent).toMatchObject({
        waited_ms: 0,
        session_id: "sess_adhoc",
      });
      expect(sessionStore.listSessions()).toMatchObject([
        {
          session_id: "sess_adhoc",
          task: "Ad hoc wait",
        },
      ]);
    } finally {
      await server.close();
    }
  });
});
