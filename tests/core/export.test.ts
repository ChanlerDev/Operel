import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../../src/core/artifacts.js";
import { SessionStore } from "../../src/core/session.js";

describe("session export", () => {
  it("writes a manifest for a session and its steps", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-export-"));
    const sessions = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "exportid",
    });
    const artifacts = new ArtifactStore({ root, id: () => "exportartifact" });
    const session = sessions.startSession({ task: "Export me" });
    sessions.recordStep(session.session_id, {
      tool: "observe",
      input: {},
      result: { ok: true },
    });

    const exported = artifacts.exportSession({
      session: sessions.getSession(session.session_id)!,
      steps: sessions.listSteps(session.session_id),
    });

    expect(exported.uri).toBe(`operel://sessions/${session.session_id}/export`);
    expect(existsSync(exported.manifest_path)).toBe(true);
    expect(existsSync(exported.audit_path)).toBe(true);
    expect(JSON.parse(readFileSync(exported.manifest_path, "utf8"))).toMatchObject({
      session: {
        session_id: session.session_id,
        task: "Export me",
      },
      steps: [
        {
          tool: "observe",
          result: { ok: true },
        },
      ],
    });

    const auditEvents = readFileSync(exported.audit_path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(auditEvents).toMatchObject([
      {
        type: "session",
        session: {
          session_id: session.session_id,
        },
      },
      {
        type: "step",
        step: {
          tool: "observe",
          result: { ok: true },
        },
      },
    ]);
  });

  it("redacts sensitive step input from exported audit and manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "operel-export-redact-"));
    const sessions = new SessionStore({
      now: () => new Date("2026-06-18T00:00:00.000Z"),
      id: () => "redactid",
    });
    const artifacts = new ArtifactStore({ root, id: () => "redactartifact" });
    const session = sessions.startSession({ task: "Redact me" });
    sessions.recordStep(session.session_id, {
      tool: "type_text",
      input: { text: "sk-proj-secret123456789", sensitive: true },
      result: { ok: true },
    });

    const exported = artifacts.exportSession({
      session: sessions.getSession(session.session_id)!,
      steps: sessions.listSteps(session.session_id),
    });

    const manifest = readFileSync(exported.manifest_path, "utf8");
    const audit = readFileSync(exported.audit_path, "utf8");

    expect(manifest).not.toContain("sk-proj-secret123456789");
    expect(audit).not.toContain("sk-proj-secret123456789");
    expect(JSON.parse(manifest).steps[0].input).toMatchObject({
      text: "[REDACTED]",
      sensitive: true,
    });
  });
});
