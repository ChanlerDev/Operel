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

export type ElementSnapshot = {
  runtime_handle: string;
  role: string;
  label: string;
  value: string;
  enabled: boolean;
  frame: { x: number; y: number; width: number; height: number };
  children: ElementSnapshot[];
};

export type RegisteredElement = ElementSnapshot & {
  element_id: string;
  tree_id: string;
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
  private readonly elements = new Map<string, Map<string, RegisteredElement>>();
  private readonly actionQueues = new Map<string, Promise<void>>();

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

  listSteps(sessionId: string): Step[] {
    this.requireSession(sessionId);
    return (this.steps.get(sessionId) ?? []).map((step) => ({ ...step }));
  }

  registerElements(sessionId: string, treeId: string, elements: ElementSnapshot[]): RegisteredElement[] {
    this.requireActiveSession(sessionId);
    const registered = elements.map((element) => ({
      ...cloneElement(element),
      element_id: `el_${this.id()}`,
      tree_id: treeId,
    }));
    this.elements.set(sessionId, new Map(registered.map((element) => [element.element_id, element])));
    return registered.map(cloneRegisteredElement);
  }

  getElement(sessionId: string, elementId: string): RegisteredElement | undefined {
    this.requireSession(sessionId);
    const element = this.elements.get(sessionId)?.get(elementId);
    return element ? cloneRegisteredElement(element) : undefined;
  }

  async runExclusive<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    this.requireActiveSession(sessionId);
    const previous = this.actionQueues.get(sessionId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        this.requireActiveSession(sessionId);
        return operation();
      });
    const current = run.then(
      () => undefined,
      () => undefined,
    );

    this.actionQueues.set(sessionId, current);

    try {
      return await run;
    } finally {
      if (this.actionQueues.get(sessionId) === current) {
        this.actionQueues.delete(sessionId);
      }
    }
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

function cloneElement(element: ElementSnapshot): ElementSnapshot {
  return {
    ...element,
    frame: { ...element.frame },
    children: element.children.map(cloneElement),
  };
}

function cloneRegisteredElement(element: RegisteredElement): RegisteredElement {
  return {
    ...cloneElement(element),
    element_id: element.element_id,
    tree_id: element.tree_id,
  };
}
