# Authoritative branch-rule oracle

This tests-only package executes the current legacy `checkBranchNameRules`,
`parseRepoRules`, rule models, account matching, and endpoint capability code.
It does not install or run Electron. The matcher/model source has moved to
shared browser modules; the legacy helper imports those same implementations.

```sh
npm ci --prefix rust/web --ignore-scripts
npm ci --prefix rust/tests/branch-rules-oracle --ignore-scripts
npm test --prefix rust/tests/branch-rules-oracle
```

The first install supplies the existing pinned esbuild/TypeScript development
tools. The second supplies RE2JS **2.0.1** and semver **5.7.2**, matching the
legacy app lockfile. Neither is a new frontend runtime dependency. The lockfile
pins registry integrity. No API, Git, authentication, or other network operation
runs during the tests.

`oracle.mjs` bundles authoritative TypeScript in memory. TypeScript AST
extraction retains the original account/repository predicate functions and API
branch-rule method, including `encodeURIComponent` of the complete branch name.
Only renderer functions, network responses, Git configuration reads, and the
GitHub repository data constructor are controlled boundaries. Endpoint policy
runs its original source with empty version storage and no development endpoint
override. API error classification is a controlled diagnostic boundary; the
original method's catch/empty-array behavior runs unchanged. This is evidence
of local rule evaluation, not full account/HTTP/provider parity.

`cases.json` is the input contract. Each case supplies `id`, `branch`, raw
`rules`, and cached `rulesets`; optional account, GitHub repository, assigned
login, API-error, and signing inputs exercise gating. Missing optional account
fields use a signed-in pro account assigned to a public GitHub.com repository.
`matcher_only` marks branch texts containing control characters: these test the
regex engine but are not valid Git branch names.

`expected.json` captures final check status (`pass`, `warning`, `blocked`, or
`error`), exact messages, parsed creation/pattern failure/bypass data, API calls,
and check-time Git configuration reads. Parsed data is computed independently
even if account/capability/API gates skip the final check; it is diagnostic
oracle evidence rather than a claim that the gated check parsed those rules.
`engine-expected.json` captures each distinct metadata matcher invocation for
native-engine differential tests.

```sh
node rust/tests/branch-rules-oracle/oracle.mjs --check
node rust/tests/branch-rules-oracle/oracle.mjs --json
node rust/tests/branch-rules-oracle/oracle.mjs --evaluate < cases-to-evaluate.json
```

`--evaluate` accepts one case or an array of cases on stdin and prints the same
structured result contract. Evaluation is sequential because the controlled
API/config boundaries hold per-case state. `--record` deliberately updates both
expected fixture files after the explicit semantic assertions in `cases.json`
pass. Review baseline changes; recording is not validation of a new Rust
implementation. `--json` includes SHA-256 hashes of the authoritative sources.
The source oracle currently requires those legacy sources; the recorded corpus
and native engine fixture remain usable when removal gates retire that source.

The corpus preserves these observed legacy decisions:

- Missing cached rulesets are skipped during parsing. A missing ruleset can
  nevertheless prevent bypass if another known pattern triggers final failure.
- A creation restriction bypassable `always`, by itself, returns no warning.
- A failing bypassable pattern produces a warning only when **every** relevant
  raw ruleset ID is bypassable. A separate passing, non-bypassable pattern can
  therefore turn that warning into a block.
- `pull_requests_only`, missing bypass fields, and unknown bypass values act as
  enforced restrictions. Duplicate rules retain their parsed failures.
- Unknown metadata operators always fail matching, including when negated.
- Literal operators quote metacharacters. Invalid regex compilation throws;
  negation does not hide invalid syntax. Rules missing parameters are ignored.
- No account/association, unsupported host, and own-private free/missing plan
  skip the check. The owner-plan comparison is case-sensitive even though
  account association comparison is case-insensitive.
- The legacy API method returns no rules after an API error. This must remain
  distinguishable from a successfully checked policy in the Rust service.

## Trusted embedded matcher

The Rust service embeds `rust/crates/core/src/repo_rules/re2js.js`. It is a
static ES2020 IIFE built from the shared matcher and pinned RE2JS ESM, with the
upstream MIT license retained in the banner and `RE2JS-LICENSE.txt`.

```sh
node rust/tests/branch-rules-oracle/build-engine.mjs
node rust/tests/branch-rules-oracle/build-engine.mjs --check
```

The single exposed global is
`__desktopMatchRules(patternsJSON, branch) -> JSON boolean array string`.
`patternsJSON` must encode an array of objects containing string `operator`,
string `pattern`, and boolean `negate`; optional `name` is ignored. Invalid
structure throws. Invalid regex preserves the RE2JS exception. The engine does
not receive arbitrary JavaScript source. The embedding caller supplies bounded
strings as function arguments and must bound memory, stack, and execution time.

There is no CommonJS loader, Node process/Buffer, network, timer, or OS
requirement. RE2JS optionally uses TextEncoder/TextDecoder and has built-in
fallbacks; `embedded-parity.mjs` deliberately runs without either. That V8
sandbox check is not proof of QuickJS execution: the Rust tests must exercise
its actual embedded runtime and resource limits.

Known dialect facts captured here include ASCII `\w`, `\d`, `\s` and word
boundaries; Unicode properties and astral characters; `\Q...\E`; strict final
anchors; octal escapes; invalid backreferences/lookaround; and class-intersection
syntax interpreted as literals. RE2JS rejects `\C`, unlike native RE2.
A generic Rust regex engine or native RE2 binding cannot claim equivalence from
its name or a small passing subset. The corpus is concrete differential
evidence and is not an exhaustive grammar or Unicode certification.
