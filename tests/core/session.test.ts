import { describe, expect, it } from "vitest";

import { SessionStore } from "../../src/core/session.js";

describe("SessionStore", () => {
  it("creates an active session with stable metadata", () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "abc123",
    });

    const session = store.startSession({
      task: "Inspect TextEdit",
      app: "TextEdit",
      risk_profile: "normal",
    });

    expect(session).toMatchObject({
      session_id: "sess_abc123",
      task: "Inspect TextEdit",
      app: "TextEdit",
      status: "active",
      created_at: "2026-06-18T00:00:00.000Z",
      updated_at: "2026-06-18T00:00:00.000Z",
      risk_profile: "normal",
    });
  });

  it("records ordered steps for an active session", () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "stepid",
    });
    const session = store.startSession({ task: "Observe" });

    const step = store.recordStep(session.session_id, {
      tool: "observe",
      input: { include_screenshot: true },
      result: { ok: true },
    });

    expect(step).toMatchObject({
      step_id: "step_stepid",
      session_id: session.session_id,
      tool: "observe",
      input: { include_screenshot: true },
      result: { ok: true },
      status: "completed",
    });
    expect(store.getSession(session.session_id)?.last_step_id).toBe("step_stepid");
  });

  it("closes active sessions with the requested reason", () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "closeid",
    });
    const session = store.startSession({ task: "Close me" });

    const closed = store.closeSession(session.session_id, "completed");

    expect(closed.status).toBe("completed");
    expect(closed.closed_at).toBe("2026-06-18T00:00:00.000Z");
  });

  it("rejects steps for unknown or non-active sessions", () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "x",
    });
    const session = store.startSession({ task: "Close me" });
    store.closeSession(session.session_id, "cancelled");

    expect(() => store.recordStep("sess_missing", { tool: "observe", input: {} })).toThrow(
      "unknown session: sess_missing",
    );
    expect(() => store.recordStep(session.session_id, { tool: "observe", input: {} })).toThrow(
      "session is not active: sess_x",
    );
  });
});
