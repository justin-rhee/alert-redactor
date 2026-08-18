/**
 * Content-free outbound alert builder (pure).
 *
 * The idea this codifies: an alert that leaves a process and lands in a chat channel or a log
 * aggregator should never be able to carry the thing that made the process unhappy in the first
 * place. It carries an error CLASS drawn from a closed vocabulary the caller declares, plus
 * record IDENTIFIERS, never record content and never an interpolated exception string.
 *
 * The caller owns the vocabulary (the lead sentence per class, the tag, an optional extra guard).
 * This module owns the assembly and the shape guarantees: id length/whitespace checks, a cap on
 * how many ids get listed, note-code sanitization, and a final self-check on the assembled line.
 *
 * PURE: spec + vocabulary in, string out. No IO, no globals, no throw on bad input (bad input is
 * redacted, not rejected).
 */

/** A record spec. `errorClass` is the only thing here that names what went wrong. Everything
 *  else is an identifier or a count - never a description of the failure. */
export type AlertSpec<C extends string> = {
  errorClass: C;
  surface?: string;
  recordIds?: string[];
  count?: number;
  note?: string;
};

/**
 * The caller-owned vocabulary. `tag` prefixes the technical tail (a short label for the process
 * sending the alert). `leads` is one fixed sentence per class - zero interpolation, so nothing in
 * the caller's runtime state can end up in a lead. `notes` maps a handful of known note codes to
 * a plain-English ending appended to the lead; unknown codes render as the raw code in the tail,
 * never in the lead. `contentGuard`, if given, is the caller's chance to plant their own
 * never-send patterns (an id-shaped canary, a secret fragment, whatever the caller knows must
 * never appear in an outbound line) and have both ids and the assembled line checked against it.
 */
export type Vocabulary<C extends string> = {
  tag: string;
  leads: Record<C, string>;
  notes?: Record<string, string>;
  contentGuard?: (s: string) => boolean;
};

const MAX_ID_LEN = 128;
const MAX_IDS_LISTED = 5;
const NOTE_CODE_MAX = 48;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Reduce a caller-supplied "id" to something safe to print, or replace it with a placeholder.
 * An id longer than MAX_ID_LEN, or containing whitespace, is suspicious on its face - it may be
 * content masquerading as an id, so it is never printed as-is. A contentGuard hit is the same
 * call for a different reason: the caller flagged this exact shape as something that must never
 * be sent.
 */
function safeId<C extends string>(raw: unknown, vocab: Vocabulary<C>): string {
  const s = String(raw ?? "");
  if (s.length > MAX_ID_LEN || /\s/.test(s)) return "<redacted-oversized-id>";
  if (vocab.contentGuard && vocab.contentGuard(s)) return "<redacted-guarded-id>";
  return s;
}

/**
 * Assemble the one-line, content-free alert string described above. Deterministic: the same
 * spec and vocabulary always produce the same line.
 */
export function buildAlert<C extends string>(spec: AlertSpec<C>, vocab: Vocabulary<C>): string {
  const lead = vocab.leads[spec.errorClass];
  const knownEnding = spec.note && vocab.notes ? vocab.notes[spec.note] : undefined;
  const noteLead = knownEnding ? ` ${capitalize(knownEnding)}` : "";

  const parts: string[] = [`${lead}${noteLead} · [${vocab.tag}] ${spec.errorClass}`];

  if (spec.surface) parts.push(`surface=${safeId(spec.surface, vocab)}`);

  if (spec.recordIds && spec.recordIds.length) {
    const ids = spec.recordIds.slice(0, MAX_IDS_LISTED).map((id) => safeId(id, vocab)).join(",");
    parts.push(`ids=${ids}`);
    if (spec.recordIds.length > MAX_IDS_LISTED) {
      parts.push(`(+${spec.recordIds.length - MAX_IDS_LISTED} more)`);
    }
  }

  if (typeof spec.count === "number") parts.push(`n=${spec.count}`);

  if (spec.note) {
    const sanitized = spec.note.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, NOTE_CODE_MAX);
    parts.push(`(${sanitized})`);
  }

  const line = parts.join(" ");

  // Final self-check: the assembled line itself must pass the caller's guard. If it does not,
  // emit the smallest possible line rather than risk sending whatever tripped it.
  if (vocab.contentGuard && vocab.contentGuard(line)) {
    return `[${vocab.tag}] ${spec.errorClass} (alert_self_redacted)`;
  }

  return line;
}
