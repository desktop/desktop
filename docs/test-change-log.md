# Test Change Log

## 2026-09-04T16:32:40-07:00

- Tests: `app/test/unit/diff-parser-test.ts` (`parses file mode changes from mode-only diffs`)
- Change/reason: Added coverage for preserving Git `old mode`/`new mode` header data so permission-only diffs can be explained in the UI; comment is adjacent to the test.
- Checks performed: Intentionally run before implementation to verify failure; will rerun after implementation.
- Available evidence: Approved bounded design in this session; no separate historical requirement found.
- Validation/limitations: Initial failing run pending; this entry will be updated after validation.
