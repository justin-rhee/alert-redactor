# alert-redactor

[![tests](https://github.com/justin-rhee/alert-redactor/actions/workflows/test.yml/badge.svg)](https://github.com/justin-rhee/alert-redactor/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/alert-redactor.svg)](https://www.npmjs.com/package/alert-redactor) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![node >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg) ![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Builds alert messages from caught errors without guessing at the cause or leaking the data that caused them.

```ts
import { classifyThrow, exampleRules, exampleFallback } from "alert-redactor";

classifyThrow(new Error("Deployments have been disabled for this project"), exampleRules, exampleFallback);
// { errorClass: "service_disabled", note: "service_disabled" }

classifyThrow(new Error("something nobody planned for"), exampleRules, exampleFallback);
// { errorClass: "unclassified", note: "cause_not_recognized" }
```

A sync daemon of mine labeled every push failure the same way, including the hour the backend had been switched off. The alert named a cause it had never diagnosed, 324 times over about thirty hours, while a bare catch block threw away the error that said the real cause in plain English.

## Use it if

- your alerts are built from caught errors, and a bare catch block decides what the cause says
- you want record ids in the message and never record content
- you'd rather read "unclassified" than a confident guess

## Install

```sh
npm install alert-redactor
```

Node 22 or newer. No dependencies. It ships compiled JavaScript with type definitions. Rather vendor it? Copy `src/alert-redactor.ts` and `src/classify-throw.ts` into your project instead: about 230 lines, and Node 22 reads TypeScript directly.

## How it works

1. `classifyThrow` matches the error against your ordered rules, first match wins, and anything unmatched gets your fallback instead of a guess
2. `buildAlert` turns the class into one line from a vocabulary you own: a lead sentence per class, optional endings, and a sender tag
3. record ids longer than 128 characters or containing whitespace are replaced with a placeholder, and only the first five are listed
4. the whole line is checked once more before it goes out, and if that fails, it returns the smallest line it can, naming only the class

Both halves are pure functions with no IO. What you do with the string is up to you.

## What it won't do

- stop you putting real content in your own lead sentences, since the vocabulary you hand it is trusted as-is
- recognize anything you haven't written a rule for, so the honest default is unclassified
- keep `localDetail` out of places it shouldn't go, since it builds text meant for a local log and nothing enforces that afterwards

## How I tested it

- 27 tests on Node's built-in runner, against the TypeScript source: `bash tests/run.sh`
- covers the placeholder rule, the content guard on single ids and the whole line, the five-id cap, and rule ordering and fallback
- two tests plant a fake id and a fake error message, show naive string building leaking them, then show the protected path doesn't

## License

MIT. See [LICENSE](LICENSE). No warranty. Security notes and how to report a problem: [SECURITY.md](SECURITY.md). Design decisions: [docs/ADR.md](docs/ADR.md).

<!-- related:start -->
## Related

- [alert-throttle](https://github.com/justin-rhee/alert-throttle): holds back repeat alerts and says how many it held
- [deid-allowlist](https://github.com/justin-rhee/deid-allowlist): drops every field you didn't allow before a record leaves your machine

Part of a small set of tools I pulled out of my own agent harness. I use them myself and read every issue. More on my [GitHub profile](https://github.com/justin-rhee).
<!-- related:end -->
