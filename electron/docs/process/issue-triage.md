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

