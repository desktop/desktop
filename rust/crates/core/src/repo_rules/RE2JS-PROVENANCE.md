# Trusted RE2JS matcher provenance

`re2js.js` is generated from `rust/web/src/upstream/repo-rules-matcher.ts` and
the ESM distribution of RE2JS 2.0.1, originally used by GitHub Desktop.
The shared matcher and model preserve the repository's MIT-licensed source.
RE2JS's MIT license is included in `RE2JS-LICENSE.txt` and the generated banner.

The isolated development dependency is pinned in
`rust/tests/branch-rules-oracle/package-lock.json`, including registry integrity:
`sha512-X59sWAF3UaMKfsVZT5/kJk1kBK10artA4jxScW4dPYtIuyDAWITcTDgkgEf9GPaqCKMVPgL2oEJGib9jN4WnkQ==`.

Build or verify with:

```sh
npm ci --prefix rust/web --ignore-scripts
npm ci --prefix rust/tests/branch-rules-oracle --ignore-scripts
node rust/tests/branch-rules-oracle/build-engine.mjs
node rust/tests/branch-rules-oracle/build-engine.mjs --check
```

The bundle exposes only `__desktopMatchRules(patternsJSON, branch)`, which
returns a JSON boolean array string. Its input is data passed as function
arguments, never JavaScript source. The host must impose memory/stack/time
limits. Runtime use requires no Node, CommonJS, module loader, browser APIs,
network, or OS integration. Engine exceptions remain errors; they must never
be converted into a passed policy. The source oracle and dialect corpus in the
tests-only package provide the matching/bypass reference contract.
