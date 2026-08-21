# alert-redactor

A sync daemon I run had a catch-all that labelled every push failure the same way: a validation failure. When the real cause was the backend being administratively switched off, the alert confidently named a cause it had never diagnosed, 324 times over about thirty hours, while the exception object that said the true cause in plain English got thrown away by a bare catch block

Two rules came out of fixing that, and neither was specific to the daemon. An alert must never name a cause that was not actually diagnosed, because "unclassified" is an honest verdict and a wrong specific class isn't. And exception text has exactly one permitted sink, the machine-local log, rather than being threaded into anything that leaves the process.

If anything you run turns a caught exception into a message somebody else reads, you have both of these, and the wrong-cause one is the harder to notice because it looks like a working alert.

So this is those two rules as a pair of pure functions, about 230 lines of TypeScript.

## Use it if

- your alerts are assembled from caught exceptions
- a bare catch block somewhere decides what your alert says the cause was
- you want record ids in the message and never record content
- you'd rather read "unclassified" than a confident guess

## How it works

`classify-throw.ts` takes whatever a try/catch handed you and turns it into a class plus a note code, using an ordered list of regex rules you supply. First match wins, so more specific causes go first in your rule list. Anything that matches nothing falls through to a fallback you also supply, rather than getting guessed at.

`alert-redactor.ts` takes that class (plus optional record ids, a count, and a note) and assembles a single line of text, using a vocabulary you own: one fixed lead sentence per class, an optional set of note-code endings, and a tag that identifies the sender. Record ids that look suspicious get replaced with a placeholder before they are ever printed. An id counts as suspicious if it's longer than 128 characters or contains whitespace, since a real identifier should never need either. Only the first five ids get listed; beyond that it just says how many more there were. The whole assembled line is checked one more time before it goes out, and if that check fails, the function throws the rest away and returns the smallest line it can, naming only the class.

Both halves are pure functions. Nothing here does IO, reads the network, or writes a log. What you do with the string you get back is up to you.

## Install

There's no package registry entry yet. Copy `src/alert-redactor.ts` and `src/classify-throw.ts` into your project, or clone this repository and import from it directly. Both files run as-is under a TypeScript runtime that supports `.ts` imports natively, such as a recent Node.

## What it won't do

- stop you putting real content inside your own lead strings, since the vocabulary you
  hand it is trusted as-is, so a lead sentence carrying something it shouldn't is a
  vocabulary problem rather than something this can catch
- recognize anything you haven't given it a rule for, so everything else falls through
  to your fallback, where the honest default is unclassified rather than a guess
- keep `localDetail` out of places it shouldn't go, since it builds text meant for a
  local log file and nothing enforces that once you're holding the string

## How I tested it

Every test runs under `node --test` against the TypeScript source directly, no build step. There are 27 tests across the two modules, covering the id-length and whitespace placeholder rule, the content-guard hook on both individual ids and the assembled line, the five-id cap, note-code sanitization, the classifier's five example rule families plus overlap ordering and fallback behavior, and `localDetail` bounding. Two tests plant a fake identifier and a fake exception message and check the planted text directly: one shows what naive string interpolation would leak, then shows the protected path doesn't leak it.

The last run:

```
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 117.24375
```

## License

MIT. See [LICENSE](LICENSE). No warranty. Security notes and how to report a problem: [SECURITY.md](SECURITY.md).

Design decisions and what changed while building it: [docs/ADR.md](docs/ADR.md).

---

This little tool is one of a handful I pulled out of my own day-to-day agent setup. I use them all myself, so when something breaks I usually notice fast. But if you run into any issues, or anything that looks off, open an issue. I read every one. More tools on my [GitHub profile](https://github.com/justin-rhee).
