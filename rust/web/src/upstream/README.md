# Shared upstream components

These components were moved from `app/src/ui/lib/` at upstream commit
`1bfab971ad2d373d5ef996dda2b894232658f8f6`. Original entrypoints re-export them
while the legacy app remains. They have no Electron or Node dependencies.

- Row/Form: removed the classnames dependency for their two string inputs.
- HorizontalRule: implementation preserved.
- HighlightText: removed an unnecessary `any` type argument; runtime unchanged.

Copyright GitHub, Inc. and contributors, under the root MIT LICENSE.

DiffLine and the raw diff models were moved from `app/src/models/diff/`. The
DiffHunkHeader equality check now compares `newLineCount` (the original repeated
`oldStartLine` and missed changes to the new hunk size).

Commit, CommitIdentity, GitAuthor, Branch, remote helpers, removeRemotePrefix,
and pure trailer parsing were migrated from upstream models/lib modules. The
legacy modules re-export their shared definitions; Git execution stays in Rust.

WorktreeEntry/display helpers and the uncommitted-changes strategy model now
live in shared source. The worktree helper accepts an optional native separator;
the temporary legacy Node adapter passes `path.sep`, while the browser infers
the style of absolute Git paths.

The existing stash marker and its pure message/branch helpers moved from
`app/src/lib/git/stash.ts` into `stash-metadata.ts`. The legacy Git wrapper
imports and re-exports them; the browser uses the same message generator for
branch association. Git stash operations and reflog parsing run in Rust.

The standalone checkout review now consumes the moved
`UncommittedChangesStrategy` values directly for leave/bring choices and stored
preferences. The legacy model continues to re-export the same definition.

Repository-rule models and the pure metadata matcher now live in shared source.
The legacy model re-exports them and its parser imports the same matcher. The
trusted backend bundle uses pinned RE2JS 2.0.1 from the isolated
`rust/tests/branch-rules-oracle` package; it runs inside Rust's bounded embedded
engine, with no Node dependency at runtime. Its license is preserved alongside
the generated bundle and in `rust/THIRD_PARTY_NOTICES.txt`.

Image comparison components also moved from `app/src/ui/diff/image-diffs/`. The
browser port validates raster image data and reports decode failures, handles
container resizing without Node APIs, starts Swipe/Onion controls at 50%, and
reports percentage size changes. DDS conversion remains unchanged.

The repository-name sanitizer is shared with the legacy add/publish dialogs; the
original entrypoint re-exports its unchanged implementation.

The legacy `CommitAttribution` component is shared with commit history. Its
input type was narrowed to the author name it actually renders, so callers do
not need to invent avatar metadata; rendering behavior is unchanged. The legacy
entrypoint re-exports the shared component.

The unchanged `Ref` component now marks branch names and commit IDs in review
views. The legacy entrypoint re-exports it; browser styling adapts Desktop's
`app/styles/ui/_ref.scss` to the shared light and dark theme variables.
