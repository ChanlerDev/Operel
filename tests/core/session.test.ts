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
    expect(store.listSteps(session.session_id)).toEqual([step]);
  });

  it("registers short-lived accessibility elements per session", () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "elementid",
    });
    const session = store.startSession({ task: "Observe elements" });

    const elements = store.registerElements(session.session_id, "tree_1", [
      {
        runtime_handle: "",
        role: "AXButton",
        label: "Save",
        value: "",
        enabled: true,
        frame: { x: 10, y: 20, width: 100, height: 40 },
        children: [],
      },
    ]);

    expect(elements).toEqual([
      {
        element_id: "el_elementid",
        tree_id: "tree_1",
        runtime_handle: "",
        role: "AXButton",
        label: "Save",
        value: "",
        enabled: true,
        frame: { x: 10, y: 20, width: 100, height: 40 },
        children: [],
      },
    ]);
    expect(store.getElement(session.session_id, "el_elementid")).toMatchObject({
      element_id: "el_elementid",
      label: "Save",
      frame: { x: 10, y: 20, width: 100, height: 40 },
    });
  });

  it("expires previous element ids when a new tree is registered", () => {
    const ids = ["first", "second"];
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => ids.shift() ?? "extra",
    });
    const session = store.startSession({ task: "Observe stale elements" });

    const [first] = store.registerElements(session.session_id, "tree_1", [
      {
        runtime_handle: "",
        role: "AXButton",
        label: "Save",
        value: "",
        enabled: true,
        frame: { x: 10, y: 20, width: 100, height: 40 },
        children: [],
      },
    ]);
    const [second] = store.registerElements(session.session_id, "tree_2", [
      {
        runtime_handle: "",
        role: "AXButton",
        label: "Cancel",
        value: "",
        enabled: true,
        frame: { x: 20, y: 30, width: 100, height: 40 },
        children: [],
      },
    ]);

    expect(store.getElement(session.session_id, first.element_id)).toBeUndefined();
    expect(store.getElement(session.session_id, second.element_id)).toMatchObject({
      label: "Cancel",
      tree_id: "tree_2",
    });
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

  it("serializes operations within the same active session", async () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "queueid",
    });
    const session = store.startSession({ task: "Queue actions" });
    const order: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = store.runExclusive(session.session_id, async () => {
      order.push("first:start");
      markFirstStarted();
      await firstCanFinish;
      order.push("first:end");
      return "first";
    });
    const second = store.runExclusive(session.session_id, async () => {
      order.push("second:start");
      return "second";
    });

    await firstStarted;
    expect(order).toEqual(["first:start"]);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues queued session operations after a previous operation fails", async () => {
    const store = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "queueid",
    });
    const session = store.startSession({ task: "Queue failures" });

    await expect(
      store.runExclusive(session.session_id, async () => {
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");

    await expect(store.runExclusive(session.session_id, async () => "recovered")).resolves.toBe("recovered");
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
