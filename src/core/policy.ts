export type AppPolicyConfig = {
  apps?: {
    allowed?: string[];
    denied?: string[];
    prompt?: string[];
  };
};

export type PolicyDecision =
  | { decision: "allowed"; reason?: undefined }
  | { decision: "denied"; reason: string }
  | { decision: "prompt_required"; reason: string }
  | { decision: "approval_required"; reason: string };

export type ActionPolicyInput = {
  tool: string;
  text?: string;
};

export class PolicyEngine {
  private readonly allowed: Set<string>;
  private readonly denied: Set<string>;
  private readonly prompt: Set<string>;

  constructor(config: AppPolicyConfig = {}) {
    this.allowed = new Set(config.apps?.allowed ?? []);
    this.denied = new Set(config.apps?.denied ?? []);
    this.prompt = new Set(config.apps?.prompt ?? []);
  }

  evaluateApp(app: string): PolicyDecision {
    if (this.denied.has(app)) {
      return { decision: "denied", reason: "app_denied" };
    }

    if (this.allowed.has(app)) {
      return { decision: "allowed" };
    }

    if (this.prompt.has(app)) {
      return { decision: "prompt_required", reason: "app_requires_prompt" };
    }

    return { decision: "prompt_required", reason: "app_not_preapproved" };
  }

  evaluateAction(input: ActionPolicyInput): PolicyDecision {
    if (input.text && looksSensitive(input.text)) {
      return { decision: "approval_required", reason: "sensitive_text" };
    }

    return { decision: "allowed" };
  }
}

function looksSensitive(text: string): boolean {
  const patterns = [
    /sk-[a-z0-9_-]{8,}/i,
    /sk-proj-[a-z0-9_-]{8,}/i,
    /api[_-]?key/i,
    /password/i,
    /token/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}
