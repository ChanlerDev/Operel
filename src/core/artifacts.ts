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
};

export type ArtifactStoreOptions = {
  root?: string;
  id?: () => string;
};

export class ArtifactStore {
  private readonly root: string;
  private readonly id: () => string;

  constructor(options: ArtifactStoreOptions = {}) {
    this.root = options.root ?? join(process.env.HOME ?? process.cwd(), ".operel/computer-use");
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

  exportSession(input: SessionExportInput): SessionExport {
    const exportPath = join(this.root, "sessions", input.session.session_id, "export");
    const manifestPath = join(exportPath, "manifest.json");
    mkdirSync(exportPath, { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          session: input.session,
          steps: input.steps,
        },
        null,
        2,
      ),
    );

    return {
      session_id: input.session.session_id,
      uri: `operel://sessions/${input.session.session_id}/export`,
      export_path: exportPath,
      manifest_path: manifestPath,
    };
  }
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
