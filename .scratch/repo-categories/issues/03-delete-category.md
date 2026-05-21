# 03 — Delete a category

Status: ready-for-agent
Type: AFK
Blocked by: [02 — Rename a category](./02-rename-category.md) (shares header context menu plumbing)

## What to build

The category-header context menu (introduced in slice 2) gains a "Delete Category" item. Selecting it deletes the category immediately — no confirmation prompt. Any repositories currently assigned to that category have their `categoryId` cleared as a side effect of the delete and fall back to their default sidebar group (`dotcom`/`enterprise`/`other`).

User-stated rationale: "se deletar uma categoria, só tira a categoria dos repositorios que pertencem a ela e eles voltam naturalmente para o 'others'" — the unassign is implicit, not a prompted choice.

`CategoriesStore.delete(id)` runs as a single Dexie transaction: clears `categoryId` on every matching repository row, then deletes the category row. Because the cross-table write bypasses `RepositoriesStore`'s own write path, `AppStore._deleteCategory` nudges `repositoriesStore.refresh()` after the categories store re-emits so the sidebar regroups affected rows immediately.

## Acceptance criteria

- [ ] Category-header context menu has a "Delete Category" item after "Rename Category…".
- [ ] Selecting "Delete Category" deletes immediately with no confirmation popup.
- [ ] `CategoriesStore.delete(id)` runs as a single Dexie transaction: clear `categoryId` on every matching repository, then delete the category row. If the transaction fails, neither change persists.
- [ ] After delete, affected repository rows appear under their `dotcom`/`enterprise`/`other` bucket without a full app reload.
- [ ] Repository selection state is preserved across the delete (the previously-selected repo stays selected, even if it moved buckets).
- [ ] Manually verified: delete an empty category, delete a category with repos assigned (repos return to their default bucket).

## Out of scope (later slices)

- Tests + telemetry (slice 4)
- Undo (not in MVP)
