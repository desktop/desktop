# GitHub Desktop Release Notes Style Guide

## Important: Use existing `Notes:` lines

Many PRs include a `Notes:` line in their body (e.g., `Notes: [Fixed] Keep PR badge on top of progress bar`).

- If the `Notes:` line is `Notes: no-notes`, **skip that PR entirely** — it should not appear in the release notes.
- If a PR has a `Notes:` line that already follows the style guide (correct `[Tag]` prefix, user-facing language, present tense), **use it as-is**.
- If a PR has a `Notes:` line but it is missing a tag, uses developer-facing language, or doesn't follow the writing style below, **use it as the basis** for your entry but clean it up to match the style guide. Stay as close to the author's intent as possible.
- Only generate your own entry from scratch when a PR has **no `Notes:` line at all**.

## Tags

Prefix each entry with one of these tags, sorted in this order:

1. `[New]` — Shiniest, most significant features (use sparingly — these are release highlights)
2. `[Added]` — Smaller features, new commands, or discrete additions
3. `[Fixed]` — Bug fixes (describe what was done and how behavior improved, not what was wrong)
4. `[Improved]` — Enhancements to existing features that weren't broken
5. `[Removed]` — Removed functionality (rare)

**Rule of thumb:** If it's a small new end-to-end feature, use `[Added]`. If it's a change to a portion of an existing feature, use `[Improved]`.

## Entry Format

```
[Tag] Description of work or change - #PR_NUMBER
```

If it was done by an external contributor (not a member of the `desktop` org), add attribution:

```
[Tag] Description of work or change - #PR_NUMBER. Thanks @contributor!
```

## What to Skip

Do NOT generate entries for:
- CI/CD changes, test-only changes, internal refactoring
- Dependency bumps (unless fixing a security vulnerability)
- Build system or developer tooling changes
- Documentation updates
- PRs with `Notes: no-notes` in their body

**Exception:** Security vulnerability fixes should always be included, even if they are dependency updates. Keep them general — do not include CVE numbers. Example:
```
[Fixed] Update embedded Git to address security vulnerability - #4791
```

## Writing Style

1. **Write for users, not developers** — describe impact on user workflow, not technical process
   - ✅ `[Fixed] Keep PR badge on top of progress bar - #8622`
   - ❌ `[Fixed] Increase z-index of the progress bar PR badge - #8622`

2. **Use present tense** (unless it significantly reduces clarity)
   - ✅ `[Added] Add external editor integration for Xcode - #8255`
   - ❌ `[Added] Adding external editor integration for Xcode - #8255`

3. **Keep the description readable independently from the tag**
   - ✅ `[Improved] Always fast forward recent branches after fetch - #7761`
   - ❌ `[Improved] Branch fast-forwarding after fetch - #7761`

4. **For bug fixes, describe what works now** — not what was broken
   - ✅ `[Fixed] Keep conflicting untracked files when bringing changes to another branch - #8084`
   - ❌ `[Fixed] Conflicting untracked files are lost when bringing changes to another branch - #8084`

## Uncertainty

If you cannot confidently determine the correct tag or whether a PR is user-facing, prefix the entry with `[???]` instead. These will be flagged for human review.
