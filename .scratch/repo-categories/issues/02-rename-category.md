# 02 — Rename a category via the sidebar header right-click

Status: ready-for-human
Type: HITL
Blocked by: [01 — Create + assign](./01-create-and-assign.md)

## What to build

Right-clicking a category header in the repositories sidebar opens a context menu with a "Rename Category…" item. Selecting it opens a prompt popup pre-filled with the current name. On submit the category is renamed everywhere it appears (sidebar header re-sorts alphabetically if needed; repository rows under it are unaffected since they reference by id).

This slice plumbs a new `onGroupHeaderContextMenu` callback through `SectionFilterList` — today only `onItemContextMenu` exists for rows.

## Why HITL

`SectionFilterList` is shared across several lists in the app. Adding a header-context-menu API touches a hot file. A human should eyeball the API surface change before merge. If the spike (below) shows the plumbing is trivial and uncontroversial, this becomes AFK.

## Spike before implementation

1. Read `app/src/ui/lib/section-filter-list.tsx`. Identify how `onItemContextMenu` is currently wired from prop → row render.
2. Identify every consumer of `SectionFilterList` (`grep -rn "SectionFilterList" app/src`). Confirm none break when an optional `onGroupHeaderContextMenu?` prop is added.
3. Confirm the header is currently rendered through `renderGroupHeader` — can we attach the handler at that render site, or is the row layer doing the work?

If any of those raise red flags, surface them in this issue's comments before coding.

## Acceptance criteria

- [ ] `SectionFilterList` accepts an optional `onGroupHeaderContextMenu?: (group, event) => void` prop. Existing consumers compile and behave identically when the prop is omitted.
- [ ] `RepositoriesList` passes a handler that, for `kind: 'category'` groups, invokes a context menu containing "Rename Category…".
- [ ] The rename action opens a prompt popup pre-filled with the existing name, validates non-empty + case-insensitive uniqueness, and on submit calls `CategoriesStore.rename(id, newName)`.
- [ ] `CategoriesStore.rename(id, name)` persists and emits an update. UI reflects the new name immediately, and the category re-sorts in alphabetical order if its position changes.
- [ ] Non-category group headers (`Recent`, `dotcom:owner`, `enterprise:host`, `Other`) do NOT open a header context menu.
- [ ] Manually verified: rename a category, see header text update and re-sort.

## Out of scope (later slices)

- Delete (slice 3)
- Tests + telemetry (slice 4)
