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
  target?: string;
  selector?: {
    role?: string;
    label?: string;
    value?: string;
  };
  key?: string;
  modifiers?: string[];
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

    if (input.tool === "click") {
      const targetText = [input.target, input.selector?.label, input.selector?.value].filter(isNonEmptyString).join(" ");
      if (looksDestructive(targetText)) {
        return { decision: "approval_required", reason: "destructive_action" };
      }
      if (looksExternalOrFinancial(targetText)) {
        return { decision: "approval_required", reason: "external_action" };
      }
    }

    if (input.tool === "press_key" && isDestructiveShortcut(input.key, input.modifiers)) {
      return { decision: "approval_required", reason: "destructive_action" };
    }

    return { decision: "allowed" };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
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

function looksDestructive(text: string): boolean {
  return /(^|\b)(delete|remove|erase|discard|reset|format|terminate|revoke|disable|destroy|drop|truncate)(\b|$)/i.test(
    text,
  );
}

function looksExternalOrFinancial(text: string): boolean {
  return /(^|\b)(send|share|post|publish|email|pay|buy|purchase|checkout|transfer|submit)(\b|$)/i.test(text);
}

function isDestructiveShortcut(key: string | undefined, modifiers: string[] | undefined): boolean {
  const normalizedKey = key?.trim().toLocaleLowerCase();
  const normalizedModifiers = new Set((modifiers ?? []).map((modifier) => modifier.trim().toLocaleLowerCase()));
  if (!normalizedKey) {
    return false;
  }

  return (
    normalizedKey === "delete" ||
    normalizedKey === "backspace" ||
    (normalizedModifiers.has("cmd") && (normalizedKey === "delete" || normalizedKey === "backspace"))
  );
}
