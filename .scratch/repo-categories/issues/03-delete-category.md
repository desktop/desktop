# 03 — Delete a category with cascade

Status: ready-for-agent
Type: AFK
Blocked by: [02 — Rename a category](./02-rename-category.md) (shares header context menu plumbing)

## What to build

The category-header context menu (introduced in slice 2) gains a "Delete Category" item. Selecting it:

- If the category has 0 repos assigned → deletes immediately.
- If the category has N>0 repos assigned → opens a confirmation dialog: "Delete category 'X' and move N repositor{y|ies} to uncategorized?" with Cancel / Delete buttons.

On delete, `CategoriesStore.delete(id)` cascades by setting `categoryId = null` for every repository pointing at it, then deletes the category row, all in a single Dexie transaction. Affected repository rows in the sidebar return to their `dotcom`/`enterprise`/`other` bucket automatically (no explicit re-grouping needed — the existing memoized `groupRepositories` reruns when repository state changes).

## Acceptance criteria

- [ ] Category-header context menu has a "Delete Category" item after "Rename Category…".
- [ ] Deleting a category with 0 repos skips the confirmation and removes the header.
- [ ] Deleting a category with ≥1 repo opens a confirmation popup naming the category and the affected count. Cancel does nothing; Delete proceeds.
- [ ] `CategoriesStore.delete(id)` runs as a single Dexie transaction: clear `categoryId` on every matching repository, then delete the category row. If the transaction fails, neither change persists.
- [ ] After delete, affected repository rows appear under their `dotcom`/`enterprise`/`other` bucket without a full app reload.
- [ ] Repository selection state is preserved across the delete (the previously-selected repo stays selected, even if it moved buckets).
- [ ] Manually verified: delete an empty category, delete a non-empty category, cancel a delete.

## Out of scope (later slices)

- Tests + telemetry (slice 4)
- Undo (not in MVP)
