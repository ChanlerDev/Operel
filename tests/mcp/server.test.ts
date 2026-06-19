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
      allowed: ["loginwindow", "WindowManager", "辅助功能", "Control Center", "Finder", "访达", "Terminal", "iTerm2", "Code"],
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
  it("exposes only the stable agent-facing tools", async () => {
    const { client, server } = await connectTestClient();

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "act",
        "log",
        "observe",
        "status",
        "stop",
      ]);
    } finally {
      await server.close();
    }
  });

  it("returns readiness, active target, policy, and trace information from status", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "status",
        arguments: {},
      });

      expect(result.structuredContent).toMatchObject({
        trace_id: expect.stringMatching(/^trace_/),
        ready: expect.any(Boolean),
        permissions: {
          screen_recording: expect.stringMatching(/^(granted|missing|unknown)$/),
          accessibility: expect.stringMatching(/^(granted|missing|unknown)$/),
          helper_status: expect.stringMatching(/^(ok|failed)$/),
        },
        active_app: expect.any(Object),
        active_window: expect.any(Object),
        policy: expect.any(Object),
        warnings: expect.any(Array),
        next_steps: expect.any(Array),
      });
    } finally {
      await server.close();
    }
  });

  it("observes without requiring a caller-managed session", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "stableobserve",
    });
    const artifactStore = new ArtifactStore({ root: mkdtempSync(join(tmpdir(), "operel-observe-artifacts-")) });
    const { client, server } = await connectTestClient(sessionStore, artifactStore);

    try {
      const result = await client.callTool({
        name: "observe",
        arguments: {
          target: { app: "TextEdit" },
          include_screenshot: true,
          include_accessibility_tree: true,
          max_tree_depth: 2,
        },
      });

      expect(result.structuredContent).toMatchObject({
        trace_id: expect.stringMatching(/^trace_/),
        session_id: "sess_stableobserve",
        observation_id: expect.stringMatching(/^obs_/),
        accessibility_tree_id: expect.stringMatching(/^tree_/),
        accessibility_tree_uri: expect.stringMatching(/^operel:\/\/sessions\/sess_stableobserve\/artifacts\/artifact_/),
        screen: {
          screenshot_uri: expect.stringMatching(/^operel:\/\/sessions\/sess_stableobserve\/artifacts\/artifact_/),
          width: expect.any(Number),
          height: expect.any(Number),
        },
        elements: expect.any(Array),
      });
      expect(existsSync((result.structuredContent as { accessibility_tree_path: string }).accessibility_tree_path)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("routes typed atomic actions through act", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "act",
        arguments: {
          action: {
            type: "type_text",
            text: "hello from stable act",
          },
        },
      });

      expect(result.structuredContent).toMatchObject({
        trace_id: expect.stringMatching(/^trace_/),
        action: { type: "type_text" },
        result: {
          strategy_used: "paste",
          clipboard_restored: true,
          session_id: expect.stringMatching(/^sess_/),
          post_observation: {
            screen: {
              screenshot_uri: expect.stringMatching(/^operel:\/\/sessions\/sess_.*\/artifacts\/artifact_/),
            },
          },
        },
      });
    } finally {
      await server.close();
    }
  });

  it("uses act as the single policy boundary for risky actions", async () => {
    const { client, server } = await connectTestClient();

    try {
      const result = await client.callTool({
        name: "act",
        arguments: {
          action: {
            type: "click",
            target: { label: "Delete account" },
          },
        },
      });

      expect(result.structuredContent).toEqual({
        trace_id: expect.stringMatching(/^trace_/),
        error: {
          code: "approval_required",
          reason: "destructive_action",
          message: "Action requires approval before continuing: destructive_action.",
          recoverable: true,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("blocks denied apps through act before runtime execution", async () => {
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
        name: "act",
        arguments: {
          action: { type: "open_app", app: "System Settings" },
        },
      });

      expect(result.structuredContent).toEqual({
        trace_id: expect.stringMatching(/^trace_/),
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

  it("returns observation-refresh guidance for stale element actions", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "staleelement",
    });
    const session = sessionStore.startSession({ task: "Click stale element" });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const result = await client.callTool({
        name: "act",
        arguments: {
          session_id: session.session_id,
          action: {
            type: "click",
            target: { element_id: "el_missing" },
          },
        },
      });

      expect(result.structuredContent).toEqual({
        trace_id: expect.stringMatching(/^trace_/),
        error: {
          code: "target_not_found",
          message: "Unknown or expired element_id. Observe again to refresh observation_id and elements.",
          recoverable: true,
        },
      });
    } finally {
      await server.close();
    }
  });

  it("stops active work and releases modifiers", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "stablestop",
    });
    const session = sessionStore.startSession({ task: "Stop me" });
    const { client, server } = await connectTestClient(sessionStore);

    try {
      const result = await client.callTool({
        name: "stop",
        arguments: { session_id: session.session_id },
      });

      expect(result.structuredContent).toMatchObject({
        trace_id: expect.stringMatching(/^trace_/),
        stopped: true,
        recovery: {
          released: ["cmd", "shift", "option", "control"],
        },
      });
      expect(sessionStore.getSession(session.session_id)?.status).toBe("cancelled");
    } finally {
      await server.close();
    }
  });

  it("exports session evidence through log", async () => {
    const sessionStore = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "stablelog",
    });
    const artifactStore = new ArtifactStore({ root: mkdtempSync(join(tmpdir(), "operel-stable-log-")) });
    const session = sessionStore.startSession({ task: "Log me" });
    sessionStore.recordStep(session.session_id, {
      tool: "act",
      input: { action: { type: "wait" } },
      result: { waited_ms: 0 },
    });
    const { client, server } = await connectTestClient(sessionStore, artifactStore);

    try {
      const result = await client.callTool({
        name: "log",
        arguments: { session_id: session.session_id, format: "bundle" },
      });

      expect(result.structuredContent).toMatchObject({
        trace_id: expect.stringMatching(/^trace_/),
        format: "bundle",
        session_id: session.session_id,
        uri: `operel://sessions/${session.session_id}/export`,
        manifest_path: expect.any(String),
        audit_path: expect.any(String),
      });
      expect(existsSync((result.structuredContent as { manifest_path: string }).manifest_path)).toBe(true);
      expect(existsSync((result.structuredContent as { audit_path: string }).audit_path)).toBe(true);
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
