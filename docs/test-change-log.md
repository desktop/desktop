# Test Change Log

## 2026-09-04T16:32:40-07:00

- Tests: `app/test/unit/diff-parser-test.ts` (`parses file mode changes from mode-only diffs`)
- Change/reason: Added coverage for preserving Git `old mode`/`new mode` header data so permission-only diffs can be explained in the UI; comment is adjacent to the test.
- Checks performed: Verified the test failed before implementation and passed after implementation.
- Available evidence: Approved bounded design in this session; no separate historical requirement found.
- Validation/limitations: Covers mode-only text-diff header parsing only.

## 2026-09-04T16:34:24-07:00

- Tests: `app/test/unit/ui/diff-empty-state-test.tsx` (`explains a mode-only change with the old and new Git file mode`, `keeps the unchanged empty-state message without a mode change`)
- Change/reason: Added focused UI coverage to verify parser mode data reaches the empty diff state and that the original message remains unchanged when no mode metadata exists; rationale is at the top of the test file.
- Checks performed: Verified the mode test failed before implementation and passed after implementation; verified the no-mode message behavior remains unchanged.
- Available evidence: Approved bounded design in this session; no separate historical requirement found.
- Validation/limitations: Covers text-diff empty states only; permission changes combined with content hunks intentionally remain outside this scope.
