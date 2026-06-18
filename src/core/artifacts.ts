import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Session, Step } from "./session.js";

export type ArtifactKind = "screenshot" | "accessibility_tree" | "audit";

export type FileArtifactInput = {
  session_id: string;
  kind: ArtifactKind;
  source_path: string;
  extension: string;
  mime_type: string;
};

export type JsonArtifactInput = {
  session_id: string;
  kind: ArtifactKind;
  value: unknown;
};

export type Artifact = {
  artifact_id: string;
  session_id: string;
  kind: ArtifactKind;
  uri: string;
  path: string;
  mime_type: string;
};

export type SessionExportInput = {
  session: Session;
  steps: Step[];
};

export type SessionExport = {
  session_id: string;
  uri: string;
  export_path: string;
  manifest_path: string;
  audit_path: string;
};

export type ArtifactStoreOptions = {
  root?: string;
  id?: () => string;
};

export class ArtifactStore {
  private readonly root: string;
  private readonly id: () => string;

  constructor(options: ArtifactStoreOptions = {}) {
    this.root =
      options.root ?? process.env.OPEREL_COMPUTER_USE_HOME ?? join(process.env.HOME ?? process.cwd(), ".operel/computer-use");
    this.id = options.id ?? (() => randomUUID());
  }

  saveFileArtifact(input: FileArtifactInput): Artifact {
    const artifactId = `artifact_${this.id()}`;
    const extension = input.extension.replace(/^\./, "");
    const sessionDir = join(this.root, "sessions", input.session_id, "artifacts");
    const path = join(sessionDir, `${artifactId}.${extension}`);

    mkdirSync(sessionDir, { recursive: true });
    copyFileSync(input.source_path, path);

    return {
      artifact_id: artifactId,
      session_id: input.session_id,
      kind: input.kind,
      uri: `operel://sessions/${input.session_id}/artifacts/${artifactId}`,
      path,
      mime_type: input.mime_type || mimeTypeForExtension(basename(path)),
    };
  }

  saveJsonArtifact(input: JsonArtifactInput): Artifact {
    const artifactId = `artifact_${this.id()}`;
    const sessionDir = join(this.root, "sessions", input.session_id, "artifacts");
    const path = join(sessionDir, `${artifactId}.json`);

    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path, JSON.stringify(redactForExport(input.value), null, 2));

    return {
      artifact_id: artifactId,
      session_id: input.session_id,
      kind: input.kind,
      uri: `operel://sessions/${input.session_id}/artifacts/${artifactId}`,
      path,
      mime_type: "application/json",
    };
  }

  exportSession(input: SessionExportInput): SessionExport {
    const exportPath = join(this.root, "sessions", input.session.session_id, "export");
    const manifestPath = join(exportPath, "manifest.json");
    const auditPath = join(exportPath, "audit.jsonl");
    const safeSession = redactForExport(input.session) as Session;
    const safeSteps = redactForExport(input.steps) as Step[];
    mkdirSync(exportPath, { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          session: safeSession,
          steps: safeSteps,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      auditPath,
      [
        JSON.stringify({ type: "session", session: safeSession }),
        ...safeSteps.map((step) => JSON.stringify({ type: "step", step })),
      ].join("\n") + "\n",
    );

    return {
      session_id: input.session.session_id,
      uri: `operel://sessions/${input.session.session_id}/export`,
      export_path: exportPath,
      manifest_path: manifestPath,
      audit_path: auditPath,
    };
  }
}

function redactForExport(value: unknown, sensitiveContext = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactForExport(item, sensitiveContext));
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const nextSensitiveContext = sensitiveContext || object.sensitive === true;
    return Object.fromEntries(
      Object.entries(object).map(([key, child]) => [
        key,
        shouldRedactKey(key) || (nextSensitiveContext && key === "text")
          ? "[REDACTED]"
          : redactForExport(child, nextSensitiveContext),
      ]),
    );
  }

  if (typeof value === "string" && looksSensitive(value)) {
    return "[REDACTED]";
  }

  return value;
}

function shouldRedactKey(key: string): boolean {
  return /^(password|token|api[_-]?key|secret|clipboard)$/i.test(key);
}

function looksSensitive(text: string): boolean {
  return [
    /sk-[a-z0-9_-]{8,}/i,
    /sk-proj-[a-z0-9_-]{8,}/i,
    /api[_-]?key/i,
    /password/i,
    /token/i,
  ].some((pattern) => pattern.test(text));
}

function mimeTypeForExtension(path: string): string {
  if (path.endsWith(".png")) {
    return "image/png";
  }
  if (path.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}
