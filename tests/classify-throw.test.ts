import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyThrow, localDetail, exampleRules, exampleFallback } from "../src/classify-throw.ts";
import type { ExampleClass } from "../src/classify-throw.ts";
import { buildAlert } from "../src/alert-redactor.ts";
import type { Vocabulary } from "../src/alert-redactor.ts";

// A vocabulary covering every example class, used for the falsification test at the bottom.
const vocab: Vocabulary<ExampleClass> = {
  tag: "example-daemon",
  leads: {
    service_disabled: "The backend is switched off, most likely a plan ceiling.",
    unauthorized: "The backend refused the credentials it was given.",
    unreachable: "The backend could not be reached at all.",
    validation_rejected: "The backend rejected the request on its shape.",
    server_error: "The backend answered with a server error.",
    unclassified: "The cause was not one this daemon recognizes.",
  },
};

test("service_disabled family: an administratively disabled backend classifies as such, not as a validation failure", () => {
  const c = classifyThrow(
    new Error("You have exceeded the free plan limits, so your deployments have been disabled."),
    exampleRules,
    exampleFallback,
  );
  assert.equal(c.errorClass, "service_disabled");
  assert.notEqual(c.errorClass, "validation_rejected");
});

test("unauthorized family: a string throw with a 401-shaped message classifies as unauthorized", () => {
  const c = classifyThrow("Unauthorized: bad bridge secret", exampleRules, exampleFallback);
  assert.equal(c.errorClass, "unauthorized");
});

test("unreachable family: an object throw carrying a transport error code classifies as unreachable", () => {
  const c = classifyThrow({ message: "fetch failed: ECONNREFUSED 127.0.0.1:443" }, exampleRules, exampleFallback);
  assert.equal(c.errorClass, "unreachable");
});

test("unreachable family: DNS and timeout codes also classify as unreachable", () => {
  assert.equal(
    classifyThrow(new Error("getaddrinfo ENOTFOUND example-backend.invalid"), exampleRules, exampleFallback).errorClass,
    "unreachable",
  );
  assert.equal(
    classifyThrow(new Error("request timed out"), exampleRules, exampleFallback).errorClass,
    "unreachable",
  );
});

test("validation_rejected family: a genuine schema rejection still reports as one", () => {
  const c = classifyThrow(
    new Error("ArgumentValidationError: Object contains extra field `title`"),
    exampleRules,
    exampleFallback,
  );
  assert.equal(c.errorClass, "validation_rejected");
});

test("server_error family: a plain 5xx status classifies as server_error", () => {
  const c = classifyThrow(new Error("500 Internal Server Error"), exampleRules, exampleFallback);
  assert.equal(c.errorClass, "server_error");
});

test("overlap ordering: a disabled-service message that also contains the word Error classifies as disabled, not 5xx", () => {
  const c = classifyThrow(
    new Error("Server Error: deployments have been disabled. Decrease your usage or upgrade."),
    exampleRules,
    exampleFallback,
  );
  assert.equal(c.errorClass, "service_disabled");
  assert.notEqual(c.errorClass, "server_error");
});

test("fallback on garbage: an unrecognized cause reports unclassified rather than inventing one", () => {
  const c = classifyThrow(new Error("something nobody has seen before"), exampleRules, exampleFallback);
  assert.equal(c.errorClass, "unclassified");
  assert.equal(c.note, exampleFallback.note);
});

test("fallback on non-Error, non-string, non-object garbage throws", () => {
  assert.equal(classifyThrow(null, exampleRules, exampleFallback).errorClass, "unclassified");
  assert.equal(classifyThrow(undefined, exampleRules, exampleFallback).errorClass, "unclassified");
  assert.equal(classifyThrow(42, exampleRules, exampleFallback).errorClass, "unclassified");
});

test("localDetail collapses whitespace and newlines into single spaces", () => {
  const d = localDetail(new Error("line one\nline two\t\tline three"));
  assert.ok(!d.includes("\n"));
  assert.equal(d, "Error: line one line two line three");
});

test("localDetail is bounded to the default 400 characters", () => {
  const d = localDetail(new Error("x".repeat(5000)));
  assert.ok(d.length <= 400);
});

test("localDetail honors a caller-supplied max", () => {
  const d = localDetail(new Error("x".repeat(5000)), 10);
  assert.equal(d.length, 10);
});

test("localDetail keeps the real sentence, unlike the classified alert path", () => {
  const d = localDetail(new Error("You have exceeded the free plan limits, so your deployments have been disabled."));
  assert.ok(d.includes("exceeded the free plan limits"));
});

test("falsification: naive interpolation of a planted exception leaks it, the protected path does not", () => {
  const PLANTED = "PLANTED_EXCEPTION_MARKER_QRS_789";
  const e = new Error(`ArgumentValidationError near ${PLANTED} in field notes`);

  // The naive path: just stringify the exception into an outbound-shaped string. This is what
  // the incident's bare catch effectively threw away the chance to avoid - shown here as a
  // negative control that WOULD leak if someone did this instead of using this module.
  const naive = `push failed: ${String(e)}`;
  assert.ok(naive.includes(PLANTED), "the naive path leaks the planted marker, as expected");
  assert.ok(String(e).includes(PLANTED), "String(e) itself carries the planted marker");

  // The protected path: classify locally, then build the outbound line from the class and a
  // fixed note code only. No fragment of `e` is threaded through.
  const { errorClass, note } = classifyThrow(e, exampleRules, exampleFallback);
  assert.equal(errorClass, "validation_rejected");
  const line = buildAlert({ errorClass, note, surface: "example/surface", count: 1 }, vocab);
  assert.ok(!line.includes(PLANTED), "the protected outbound line does not carry the planted marker");

  // And the local-only sink is explicitly allowed to carry it - that is the one permitted sink.
  const detail = localDetail(e);
  assert.ok(detail.includes(PLANTED), "localDetail is the one sink allowed to carry exception text");
});
