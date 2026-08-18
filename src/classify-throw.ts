/**
 * Classify a caught throw into a FIXED error class plus a note code (pure).
 *
 * Why this shape exists: a sync daemon I ran had a catch-all that labelled every push failure
 * with the same class, "a validation failure." When the real cause was the backend having been
 * administratively switched off, the alert confidently named a cause it had never diagnosed, 324
 * times over about thirty hours, while the exception object that said the true cause in plain
 * English was thrown away by a bare catch block.
 *
 * Two lessons live in this module. First: an alert must never name a cause that was not actually
 * diagnosed - "unclassified" is an honest verdict and a wrong specific class is not. Second:
 * exception text has exactly one permitted sink, the machine-local log. `localDetail()` is the
 * only function here that returns exception text, and it must never be threaded into an alert.
 *
 * PURE: unknown throw in, {errorClass, note} out.
 */

export type ClassifierRule<C extends string> = {
  re: RegExp;
  errorClass: C;
  note: string;
};

/** Extract a matchable string from an unknown throw without assuming it is an Error. */
function textOf(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}

/**
 * Match a thrown value against an ordered list of rules and return the first hit, or the caller's
 * fallback if nothing matches. Order matters: real-world error text overlaps (a "disabled" message
 * can also contain the word "Error"), so rules are tried in the order given and the first match
 * wins. An unmatched throw is reported through the fallback rather than guessed at.
 */
export function classifyThrow<C extends string>(
  e: unknown,
  rules: readonly ClassifierRule<C>[],
  fallback: { errorClass: C; note: string },
): { errorClass: C; note: string } {
  const text = textOf(e);
  for (const rule of rules) {
    if (rule.re.test(text)) return { errorClass: rule.errorClass, note: rule.note };
  }
  return { errorClass: fallback.errorClass, note: fallback.note };
}

/** Max chars of exception text handed to the local log. Bounded so a large payload embedded in
 *  an error cannot fill up the log file it lands in. */
const LOCAL_DETAIL_MAX_DEFAULT = 400;

/**
 * The exception text, for a machine-local log ONLY. Never pass this to buildAlert or any other
 * outbound path - see the module comment above. Whitespace (including newlines) is collapsed to
 * single spaces so one entry is always one line, and the result is bounded to `max` characters.
 */
export function localDetail(e: unknown, max = LOCAL_DETAIL_MAX_DEFAULT): string {
  return textOf(e).replace(/\s+/g, " ").slice(0, max);
}

/**
 * An example closed vocabulary of error classes for the five families below, and the fallback
 * used when nothing matches. These exist to give callers a working starting point; most callers
 * will want their own classes and their own regexes tuned to their own backend's error text.
 */
export type ExampleClass =
  | "service_disabled"
  | "unauthorized"
  | "unreachable"
  | "validation_rejected"
  | "server_error"
  | "unclassified";

export const exampleFallback: { errorClass: ExampleClass; note: string } = {
  errorClass: "unclassified",
  note: "cause_not_recognized",
};

/**
 * Five ordered families that generalize to talking to almost any hosted backend over a network.
 * Ordered because the patterns overlap: a disabled-service message can also contain a word like
 * "Error", and an auth failure can be described as a server error by an intermediary. First
 * match wins, so the more specific, more diagnostic causes are listed first.
 */
export const exampleRules: ClassifierRule<ExampleClass>[] = [
  // The service is administratively disabled - most often a free-plan ceiling. Not a validation
  // problem, and not a transport problem either: the backend answered, and the answer is "off."
  {
    re: /free plan limits|deployments? (?:have been |are |is )?disabled|projects? (?:are|is) disabled|decrease your usage|exceeded the free|quota exceeded|over the free/i,
    errorClass: "service_disabled",
    note: "service_disabled",
  },
  // Credentials refused. Distinct from "could not reach it" - the backend answered, and said no.
  {
    re: /unauthorized|forbidden|\b401\b|\b403\b|invalid (?:token|secret|api key|auth)|authentication failed|not authenticated/i,
    errorClass: "unauthorized",
    note: "unauthorized",
  },
  // Transport never completed - no answer came back at all.
  {
    re: /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|fetch failed|socket hang up|network error|timed? ?out/i,
    errorClass: "unreachable",
    note: "network_error",
  },
  // The request really was rejected on its shape - a schema or argument validation failure.
  {
    re: /ArgumentValidationError|validator|Invalid argument|does not match the schema|Unexpected field|schema validation|Object contains extra field|Expected .* but got/i,
    errorClass: "validation_rejected",
    note: "validation_rejected",
  },
  // Reachable, and it answered with a server error.
  {
    re: /\b50[0-9]\b|Internal Server Error|Server Error/i,
    errorClass: "server_error",
    note: "server_error",
  },
];
