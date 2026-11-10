# Issue Triage

This document describes how we triage issues in [desktop/desktop](https://github.com/desktop/desktop).

## Quick Guide

Pick an issue from the First Responder triage queue.

**Your goal:** Do what is needed to remove the `needs-triage` label.

1. **Can we close it?**
   - Duplicate → Comment and close as duplicate, linking the original
   - Spam → Add `invalid` or `suspected-spam` (auto-closes)
   - Abuse → Add `invalid`, remove content, report, block
   - Off-topic → Add `off-topic` (auto-closes with comment)

2. **Is it a bug?**
   - Reproducible → Add `bug` and a priority label (`priority-1`, `priority-2`, or `priority-3`)
   - Not reproducible → Add `unable-to-reproduce` (auto-requests info, 14-day timer)

3. **Is it an enhancement?**
   - Clear value → Add `enhancement` (auto-posts backlog comment)
   - Unclear → Comment for clarification and add `more-info-needed` (14-day timer)

The `needs-triage` label is automatically removed when end-state labels (`enhancement`, `bug`, `ready-for-review`) are applied or the issue is closed.

## Recurring P1 pattern proposals

The separate `issue-pattern-escalation` agentic workflow reviews public issue
activity daily, independently of per-issue triage. It searches issues created or
updated in the preceding 14 days, including older issues with recent activity,
and checks related open and closed trackers. It considers at least two
independent reports as a candidate signal, not proof of P1 impact.

When public evidence supports both parts of the P1 definition below, it may
create at most one public issue per run with the `priority-1` label. This is an
automated proposal, not a human priority decision: a maintainer must assess its
evidence and take any escalation action. The workflow does not change existing
issues or post comments. Material new evidence about an existing tracker is
reported in the Actions run summary for human follow-up.

The workflow uses `GITHUB_TOKEN` for its safe output, so its proposal does not
trigger the existing issue-opened or labeling workflows and does not
automatically receive `needs-triage`. It does not notify Slack or replace a
human P1 escalation. Check Actions for run failures and coverage limitations.
The scan is bounded to 200 recently active issues, with up to 100 comments per
relevant issue; search-index delay, missed runs, older inactive reports, API
limits, and model error may leave evidence undiscovered. Semantic duplicate and
severity judgments and the coverage checks are model-driven, not guarantees.
The workflow instructs the agent to suppress proposals when coverage is
incomplete and to report the gap rather than treat it as a clean scan.

The workflow is compiled with gh-aw v1.0.1. The repository's earlier v0.87.1
compiler automatically comments on the detection tracking issue on detection
warnings or failures; v1.0.1 can disable that reporting without disabling
threat detection. Recompile this workflow separately with
`gh aw compile issue-pattern-escalation --shellcheck` using v1.0.1, and
preserve the action pins needed by other compiled workflows.

## Priority Levels

| Priority | Description |
|----------|-------------|
| `priority-1` | Affects many users, prevents core functions. **Escalate in Slack; may require a hotfix.** |
| `priority-2` | Affects multiple users, does not prevent core functions. |
| `priority-3` | Few users affected, cosmetic. |

## Automated Workflows

| Label | Automation |
|-------|------------|
| `needs-triage` | Auto-added on open; removed when classified or closed |
| `more-info-needed` | Auto-closes after 14 days without response |
| `unable-to-reproduce` | Auto-adds `more-info-needed` + posts comment |
| `enhancement` | Auto-posts backlog comment |
| `invalid` | Auto-closes immediately |
| `suspected-spam` | Auto-closes immediately |
| `off-topic` | Auto-posts explanation comment + closes |
| `no-help-wanted-issue` | PRs only: Auto-posts explanation comment + closes |
| `ready-for-review` | Auto-removes `needs-triage` + posts acknowledging comment |

## Off-topic, Spam & Abuse

- **Off-topic issues:** Add `off-topic` → auto-comments and closes.
- **Spam:** Add `invalid` or `suspected-spam` → auto-closes.
- **Spam comments:** Mark as spam via GitHub.
- **Abuse:** Remove content, report, and use your judgment on blocking.
  - Blocking a user from the `desktop` org requires admin permissions.
