# Security policy. alert-redactor

## Posture

alert-redactor is provided as-is, with NO WARRANTY (see LICENSE). Use it as one
control among several, never as a sole guarantee.

If this is a security-oriented tool, the honest ceiling applies: it **reduces,
does not eliminate**, the risk it addresses. Behavioral rules are defense-in-depth
on top of a structural limit, and the structural limit only holds if the host
environment actually enforces it (e.g. actually withholds the tools/permissions
the design assumes are withheld). State that assumption; do not let it read as a
promise the code can't keep.

## Validation status

The offline test suite has been run: 28 of 28 tests pass on Node 22 with `npm test` (which runs `bash tests/run.sh`). The tests cover id placeholders, the content guard, the five-id cap, rule ordering and fallback, and one check that the README example runs against the packed package. They do not cover real alert channels, real error messages from your services, or a vocabulary other than the examples. No outside red-team corpus has been run.

## Reporting a vulnerability

Report privately to https://github.com/justin-rhee. Please do not open a public issue for a
suspected vulnerability. give a reasonable window for a fix first.
