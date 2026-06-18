import { randomUUID } from "node:crypto";

export type SessionStatus = "active" | "waiting_for_approval" | "blocked" | "completed" | "expired" | "cancelled";
export type CloseSessionReason = Extract<SessionStatus, "completed" | "expired" | "cancelled" | "blocked">;
export type RiskProfile = "low" | "normal" | "high";

export type StartSessionInput = {
  task: string;
  app?: string;
  window_title?: string;
  risk_profile?: RiskProfile;
};

export type Session = {
  session_id: string;
  task: string;
  app?: string;
  window_title?: string;
  risk_profile: RiskProfile;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  last_step_id?: string;
};

export type RecordStepInput = {
  tool: string;
  input: unknown;
  result?: unknown;
  error?: unknown;
};

export type Step = {
  step_id: string;
  session_id: string;
  tool: string;
  input: unknown;
  result?: unknown;
  error?: unknown;
  status: "completed" | "failed";
  created_at: string;
};

export type SessionStoreOptions = {
  now?: () => Date;
  id?: () => string;
};

export class SessionStore {
  private readonly now: () => Date;
  private readonly id: () => string;
  private readonly sessions = new Map<string, Session>();
  private readonly steps = new Map<string, Step[]>();

  constructor(options: SessionStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? (() => randomUUID());
  }

  startSession(input: StartSessionInput): Session {
    const timestamp = this.now().toISOString();
    const session: Session = {
      session_id: `sess_${this.id()}`,
      task: input.task,
      app: input.app,
      window_title: input.window_title,
      risk_profile: input.risk_profile ?? "normal",
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
    };

    this.sessions.set(session.session_id, session);
    this.steps.set(session.session_id, []);

    return { ...session };
  }

  getSession(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : undefined;
  }

  listSessions(): Session[] {
    return [...this.sessions.values()].map((session) => ({ ...session }));
  }

  recordStep(sessionId: string, input: RecordStepInput): Step {
    const session = this.requireActiveSession(sessionId);
    const timestamp = this.now().toISOString();
    const step: Step = {
      step_id: `step_${this.id()}`,
      session_id: sessionId,
      tool: input.tool,
      input: input.input,
      result: input.result,
      error: input.error,
      status: input.error === undefined ? "completed" : "failed",
      created_at: timestamp,
    };

    const steps = this.steps.get(sessionId) ?? [];
    steps.push(step);
    this.steps.set(sessionId, steps);

    session.last_step_id = step.step_id;
    session.updated_at = timestamp;
    this.sessions.set(sessionId, session);

    return { ...step };
  }

  closeSession(sessionId: string, reason: CloseSessionReason): Session {
    const session = this.requireSession(sessionId);
    const timestamp = this.now().toISOString();
    session.status = reason;
    session.updated_at = timestamp;
    session.closed_at = timestamp;
    this.sessions.set(sessionId, session);
    return { ...session };
  }

  private requireActiveSession(sessionId: string): Session {
    const session = this.requireSession(sessionId);
    if (session.status !== "active") {
      throw new Error(`session is not active: ${sessionId}`);
    }
    return session;
  }

  private requireSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`unknown session: ${sessionId}`);
    }
    return { ...session };
  }
}
