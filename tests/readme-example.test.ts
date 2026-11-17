import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Runs the README's first example against the built package, installed the way a user gets it:
// build, npm pack, install the tarball into an empty directory, import "alert-redactor".
const root = resolve(import.meta.dirname, "..");

test("README first example runs against the packed package entry", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const block = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
  assert.ok(block, "README has a ts example");

  const lines = block.split("\n");
  const expected: unknown[] = [];
  const script: string[] = [];
  for (const line of lines) {
    const exp = /^\/\/ (\{.*\})\s*$/.exec(line);
    if (exp) expected.push(new Function(`return (${exp[1]})`)());
    else if (line.startsWith("classifyThrow(")) script.push(`console.log(JSON.stringify(${line.replace(/;\s*$/, "")}));`);
    else if (line.startsWith("import ")) script.push(line);
  }
  assert.equal(expected.length, 2, "README example shows two results");

  const work = mkdtempSync(join(tmpdir(), "alert-redactor-readme-"));
  const packDir = join(work, "pack");
  const appDir = join(work, "app");
  mkdirSync(packDir);
  mkdirSync(appDir);
  try {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
    execFileSync("npm", ["pack", "--pack-destination", packDir], { cwd: root, stdio: "pipe" });
    const tgz = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
    assert.ok(tgz, "npm pack produced a tarball");
    writeFileSync(join(appDir, "package.json"), '{"name":"readme-check","private":true,"type":"module"}');
    execFileSync("npm", ["install", join(packDir, tgz), "--no-audit", "--no-fund"], { cwd: appDir, stdio: "pipe" });
    writeFileSync(join(appDir, "example.mjs"), script.join("\n") + "\n");
    const out = execFileSync("node", ["example.mjs"], { cwd: appDir, encoding: "utf8" });
    const got = out.trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(got, expected);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
