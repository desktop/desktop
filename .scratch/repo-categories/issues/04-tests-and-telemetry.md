# 04 — Tests + telemetry harden

Status: ready-for-agent
Type: AFK
Blocked by: [01 — Create + assign](./01-create-and-assign.md), [02 — Rename](./02-rename-category.md), [03 — Delete](./03-delete-category.md)

## What to build

Bring the category feature up to the "personal-now / maybe-upstream" quality bar:

1. **Unit tests** for the pieces with non-trivial logic.
2. **Telemetry counters** for every category-mutating action, following the existing `recordRepoClicked` pattern in the `StatsStore` / dispatcher.

## Acceptance criteria

### Tests

- [ ] `groupRepositories` test cases:
  - [ ] A repo with `categoryId` set appears under its `Category` group and NOT under its underlying `dotcom`/`enterprise`/`other` group.
  - [ ] A repo with `categoryId = null` appears under its underlying `dotcom`/`enterprise`/`other` group as today.
  - [ ] `Recent` continues to duplicate categorized repos (existing behavior preserved).
  - [ ] Categories sort alphabetically among themselves.
  - [ ] Group order is `Recent` → `Category` → `dotcom` → `enterprise` → `Other`.
  - [ ] Empty categories produce a group with `items: []`.
- [ ] `CategoriesStore` test cases:
  - [ ] `create(name)` persists and rejects duplicates (case-insensitive).
  - [ ] `rename(id, name)` persists; rejects duplicates; no-op on identical case-insensitive name.
  - [ ] `delete(id)` clears `categoryId` on every matching repository AND deletes the category row, in one transaction.
- [ ] Migration test: an existing v9 database loads cleanly on v10 with no data loss and no `categoryId` field unexpectedly set on pre-existing repositories.

### Telemetry

- [ ] `recordCategoryCreated()` fires from `CategoriesStore.create` flow.
- [ ] `recordCategoryAssigned()` fires whenever a repository's `categoryId` changes (including assign, reassign, clear-to-null).
- [ ] `recordCategoryRenamed()` fires from rename flow.
- [ ] `recordCategoryDeleted()` fires from delete flow (once per delete, regardless of cascade count).
- [ ] All four counters are surfaced in the daily measures payload alongside existing repository counters.

## Out of scope

- E2E browser-style tests (the project doesn't have an existing harness for sidebar interactions).
- Color / sortOrder / drag-to-assign (MVP 2/3).
