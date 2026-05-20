# Repository Categories — MVP 1

User-curated grouping in the left sidebar. Each repo can be assigned to one category; categorized repos move out of their `dotcom`/`enterprise`/`other` bucket into the category bucket.

## Goals

- Reduce visual clutter in the sidebar when the user tracks many repos.
- Let the user create, assign, rename, and delete categories without leaving the sidebar.

## Non-goals (deferred)

- Per-category color (MVP 2).
- Manual reordering of categories (MVP 3).
- Drag-to-assign in the sidebar.
- Settings panel for bulk management.

## Design decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Cardinality | One category per repo |
| 2 | Group merge | Categorized repo moves out of `dotcom`/`enterprise`/`other` (still duplicates into `Recent`) |
| 3 | Default order | `Recent` → `Categories` (alpha) → `dotcom` → `enterprise` → `Other` |
| 4 | Schema | Separate `categories` table (`id`, `name`, `color?`, `sortOrder?`) + `categoryId` FK on repositories |
| 5 | Name | `Category` / `category` / `categoryId` |
| 6 | Manage | Right-click on category sidebar header → Rename / Delete (delete confirms "Move N repos to uncategorized?") |
| 7 | Assign | Repo right-click → "Category ▶" submenu: checkbox list + None + "New Category…" |
| 8 | Empty cat | Shown in sidebar (immediate feedback after create) |
| 9 | Quality bar | Personal-now / maybe-upstream → tests on store + grouping, telemetry, strict upstream style |

## Slices

1. [Create + assign in one click (tracer)](issues/01-create-and-assign.md) — AFK
2. [Rename via category-header right-click](issues/02-rename-category.md) — HITL
3. [Delete category with cascade](issues/03-delete-category.md) — AFK
4. [Tests + telemetry harden](issues/04-tests-and-telemetry.md) — AFK
