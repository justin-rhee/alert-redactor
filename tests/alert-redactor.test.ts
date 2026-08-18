import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlert } from "../src/alert-redactor.ts";
import type { AlertSpec, Vocabulary } from "../src/alert-redactor.ts";

type C = "thing_broke" | "not_found" | "rejected";

const vocab: Vocabulary<C> = {
  tag: "example-daemon",
  leads: {
    thing_broke: "Something broke and was held back.",
    not_found: "A record could not be found.",
    rejected: "A batch was rejected.",
  },
  notes: {
    already_handled: "it was already handled before this ran, no harm done.",
    rolled_back: "the whole batch rolled back, nothing partial was written.",
  },
};

// A planted marker standing in for actual record content - a real body must never survive into
// an assembled alert line no matter how it is passed in.
const PLANTED_BODY = "PLANTED_RECORD_BODY_CONTAINS_SECRET_XYZ";

test("a normal spec assembles lead, tag, class, surface, ids, count, and note code", () => {
  const spec: AlertSpec<C> = {
    errorClass: "thing_broke",
    surface: "widgets/sync",
    recordIds: ["a1", "a2"],
    count: 2,
    note: "already_handled",
  };
  const line = buildAlert(spec, vocab);
  assert.ok(line.startsWith("Something broke and was held back."));
  assert.ok(line.includes("It was already handled before this ran"));
  assert.ok(line.includes("[example-daemon] thing_broke"));
  assert.ok(line.includes("surface=widgets/sync"));
  assert.ok(line.includes("ids=a1,a2"));
  assert.ok(line.includes("n=2"));
  assert.ok(line.includes("(already_handled)"));
});

test("an id shaped like real content (a fake record body) never reaches the output", () => {
  const spec: AlertSpec<C> = {
    errorClass: "not_found",
    recordIds: [PLANTED_BODY + " has embedded whitespace so it reads as content"],
  };
  const line = buildAlert(spec, vocab);
  assert.ok(!line.includes(PLANTED_BODY), "planted content must not appear in the alert");
  assert.ok(line.includes("<redacted-oversized-id>"), "the whitespace-bearing id becomes a placeholder");
});

test("an id over 128 chars becomes a placeholder even with no whitespace", () => {
  const longId = "x".repeat(129);
  const line = buildAlert({ errorClass: "not_found", recordIds: [longId] }, vocab);
  assert.ok(!line.includes(longId));
  assert.ok(line.includes("<redacted-oversized-id>"));
});

test("an id under the length limit and free of whitespace passes through untouched", () => {
  const line = buildAlert({ errorClass: "not_found", recordIds: ["record-42"] }, vocab);
  assert.ok(line.includes("ids=record-42"));
});

test("a contentGuard hit on an id replaces it with the guarded placeholder", () => {
  const guardedVocab: Vocabulary<C> = {
    ...vocab,
    contentGuard: (s: string) => s.includes(PLANTED_BODY),
  };
  const line = buildAlert(
    { errorClass: "not_found", recordIds: [PLANTED_BODY] },
    guardedVocab,
  );
  assert.ok(!line.includes(PLANTED_BODY));
  assert.ok(line.includes("<redacted-guarded-id>"));
});

test("more than 5 ids list the first 5 and cap the rest with a plus-N-more marker", () => {
  const ids = ["i1", "i2", "i3", "i4", "i5", "i6", "i7"];
  const line = buildAlert({ errorClass: "not_found", recordIds: ids }, vocab);
  assert.ok(line.includes("ids=i1,i2,i3,i4,i5"));
  assert.ok(!line.includes("i6"));
  assert.ok(!line.includes("i7"));
  assert.ok(line.includes("(+2 more)"));
});

test("exactly 5 ids list all of them with no plus-more marker", () => {
  const ids = ["i1", "i2", "i3", "i4", "i5"];
  const line = buildAlert({ errorClass: "not_found", recordIds: ids }, vocab);
  assert.ok(line.includes("ids=i1,i2,i3,i4,i5"));
  assert.ok(!line.includes("more)"));
});

test("a note code is sanitized to a safe character set and bounded to 48 chars", () => {
  const dirty = "weird code! with spaces & symbols ".repeat(3);
  const line = buildAlert({ errorClass: "not_found", note: dirty }, vocab);
  const match = line.match(/\(([^()]*)\)$/);
  assert.ok(match, "expected a trailing parenthesized note code");
  const code = match![1]!;
  assert.ok(/^[A-Za-z0-9_.:-]*$/.test(code), "note code must only contain the allowed characters");
  assert.ok(code.length <= 48, "note code must be bounded to 48 characters");
});

test("an unknown note code renders as the sanitized code, not as a lead ending", () => {
  const line = buildAlert({ errorClass: "not_found", note: "some_unknown_code" }, vocab);
  assert.ok(line.includes("(some_unknown_code)"));
  // The lead itself must be unchanged - no known ending was appended.
  assert.ok(line.startsWith("A record could not be found. · ["));
});

test("a known note code appends its plain ending to the lead sentence, capitalized", () => {
  const line = buildAlert({ errorClass: "rejected", note: "rolled_back" }, vocab);
  assert.ok(line.startsWith("A batch was rejected. The whole batch rolled back"));
});

test("self-redaction: when the assembled line itself trips the guard, it collapses to a minimal line", () => {
  const guardedVocab: Vocabulary<C> = {
    ...vocab,
    // Flags the lead sentence itself, which only shows up once the parts are joined - this
    // forces the final-line check, not just the per-id check.
    contentGuard: (s: string) => s.includes("Something broke"),
  };
  const line = buildAlert({ errorClass: "thing_broke", surface: "x", count: 1 }, guardedVocab);
  assert.equal(line, "[example-daemon] thing_broke (alert_self_redacted)");
});

test("with no contentGuard supplied, guard checks are skipped entirely", () => {
  // No guard on this vocab, so nothing about id length/whitespace-adjacent content should trip
  // anything beyond the whitespace/length rule itself.
  const line = buildAlert({ errorClass: "not_found", recordIds: ["clean-id"] }, vocab);
  assert.ok(line.includes("ids=clean-id"));
});

test("falsification: naive string interpolation of the same planted body would leak it", () => {
  // This is the thing buildAlert exists to prevent - shown here as a negative control.
  const naive = `record failed: ${PLANTED_BODY}`;
  assert.ok(naive.includes(PLANTED_BODY), "the naive path leaks the planted marker, as expected");

  // buildAlert given only the class and the body as if it were an id does not leak it, because
  // the body contains no whitespace here it would pass through - so the real protection is the
  // contentGuard the caller plants for exactly this shape.
  const guardedVocab: Vocabulary<C> = { ...vocab, contentGuard: (s) => s.includes(PLANTED_BODY) };
  const protectedLine = buildAlert({ errorClass: "not_found", recordIds: [PLANTED_BODY] }, guardedVocab);
  assert.ok(!protectedLine.includes(PLANTED_BODY), "the protected path does not leak the planted marker");
});
