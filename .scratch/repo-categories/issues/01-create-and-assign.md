# 01 — Create + assign a category in one click

Status: ready-for-agent
Type: AFK
Blocked by: None — can start immediately

## What to build

End-to-end tracer slice for repository categorization. A user can right-click any repository row in the sidebar, open a new "Category ▶" submenu, and either pick an existing category, clear the assignment ("None"), or invoke "New Category…" to type a name. Creating a category through the prompt also assigns it to the repo that triggered the menu, in one shot.

The sidebar groups categorized repositories under their category header. Categorized repos no longer appear in the `dotcom`/`enterprise`/`other` buckets they previously lived in (but still appear in `Recent` when applicable — recent duplication is preserved). Group order: `Recent` → `Categories` (alphabetical) → `dotcom` → `enterprise` → `Other`. Empty categories (no repos yet) are still rendered in the sidebar so the user gets immediate feedback after creating one.

Storage shape (from the agreed design — see PRD):

```ts
// New Dexie v10 table
categories: { id: number; name: string; color?: string | null; sortOrder?: number | null }
//           indexes: '++id, &name'

// New column on the existing repositories table
repositories: { ..., categoryId: number | null }
//              add index: 'categoryId'
```

Pure additive migration — no data transformation needed for existing users. `color` and `sortOrder` columns ship now (unused) so MVP 2 and 3 don't require another schema bump.

## Acceptance criteria

- [ ] Dexie schema is at version 10. `categories` table exists with `++id, &name`. `repositories` has a `categoryId` indexed column.
- [ ] A `Category` model exists in `app/src/models/`.
- [ ] A `CategoriesStore` exists alongside `RepositoriesStore`, exposing `getAll()` and `create(name)`, emitting updates that the `AppStore` listens to.
- [ ] `AppStore` state surfaces the current list of categories so the UI can render them.
- [ ] `RepositoryListGroup` union (in `group-repositories.ts`) gains a `{ kind: 'category'; id: number; name: string }` variant.
- [ ] `getGroupKey` orders groups as: `recent` → `category:{name}` → `dotcom` → `enterprise` → `other`.
- [ ] `getGroupForRepository` returns the category group for a repo whenever its `categoryId` is non-null, regardless of whether it would otherwise be `dotcom`/`enterprise`/`other`.
- [ ] `Recent` continues to duplicate categorized repos as today (no special-casing).
- [ ] Empty categories (no repos assigned) render a header in the sidebar.
- [ ] Repository row right-click menu has a "Category ▶" submenu containing:
  - one checkbox-style item per existing category (the currently assigned one is `checked`)
  - a separator
  - a "None" item (clears `categoryId` to null)
  - a "New Category…" item that opens a prompt popup
- [ ] A new `PopupType.CreateCategory` (or similarly named) prompt collects a name (validation: non-empty, trimmed, case-insensitive uniqueness against existing categories). On submit the category is created AND assigned to the repository the menu was opened from.
- [ ] Manually verified: create a category, see the row jump from its old bucket into the new category header; create with the same name → rejected; pick "None" → row returns to its `dotcom`/`enterprise`/`other` bucket.

## Out of scope (later slices)

- Rename a category (slice 2)
- Delete a category (slice 3)
- Tests + telemetry (slice 4)
- Color, manual ordering, drag-to-assign (MVP 2/3)

## Notes

- Match upstream code style and patterns strictly — quality bar is "personal now, maybe upstream later".
- Reuse the existing prompt-popup pattern used for `PopupType.ChangeRepositoryAlias`.
- See [PRD](../PRD.md) for the full design context.
