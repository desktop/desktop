# UI Component Testing with Testing Library

This document describes the supported path for DOM-based UI component tests in
GitHub Desktop.

## Scope

The current setup is for component-level tests under `app/`. It keeps the
existing `node:test` runner, reuses the repo's jsdom bootstrap, and adds a thin
Testing Library helper layer for React components.

This is intentionally not a Jest or Vitest migration guide.

## File Locations

- Put component tests under `app/test/unit/ui`.
- Keep shared UI helpers under `app/test/helpers/ui`.
- Use `-test.tsx` for React component tests so the existing test runner can
  discover them in directory-based runs.

## Running UI Tests

- Run one file directly: `node script/test.mjs app/test/unit/ui/tab-bar-test.tsx`
- Run the UI directory: `yarn test:unit app/test/unit/ui`
- Run the full unit suite: `yarn test:unit`

Directory discovery for `script/test.mjs` now includes `-test.tsx` and
`-test.jsx`. If a future change regresses that pattern, UI directory runs will
silently miss these tests.

## Preferred Imports

UI tests should import from the shared render helper instead of importing
Testing Library directly in each file.

```tsx
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'
```

That helper ensures the UI-specific setup path is loaded consistently.

## Shared UI Setup

The shared setup currently lives in `app/test/helpers/ui/setup.ts` and is loaded
through `app/test/helpers/ui/render.tsx`.

It owns the test-only DOM behavior that UI tests need:

- Testing Library cleanup after each test
- a minimal `ResizeObserver` shim for tooltip-backed components
- `CustomEvent` alignment with jsdom's implementation

Keeping this setup UI-only avoids changing behavior for non-UI unit tests.

## Timer Pattern

Timer-driven UI components should use the shared timer helpers from
`app/test/helpers/ui/timers.ts`.

```ts
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

beforeEach(() => {
  enableTestTimers(['Date', 'setTimeout'], Date.parse('2026-03-26T12:00:00Z'))
})

afterEach(() => {
  resetTestTimers()
})

advanceTimersBy(1000)
```

Use Node mock timers for scheduled UI refreshes and transient feedback states.
That keeps the tests deterministic and matches the existing unit-test style in
this repository.

## Targeted Electron Mocks

Prefer targeted overrides in the individual test file over expanding the global
Electron mock for every new component.

For clipboard-style tests, use the helper in `app/test/helpers/ui/electron.ts`.

```ts
import { captureClipboardWrites } from '../../helpers/ui/electron'

let clipboardCapture = captureClipboardWrites()

beforeEach(() => {
  clipboardCapture = captureClipboardWrites()
})

afterEach(() => {
  clipboardCapture.restore()
})
```

The global Electron mock in `app/test/globals.mts` should stay minimal. Add a
new global stub only when multiple unrelated UI tests need the same default
Electron surface.

## Assertions

Assertions should stay aligned with `node:assert` and DOM APIs.

- Prefer `screen.getByRole`, `screen.getByText`, and related Testing Library
  queries.
- Assert accessibility state through DOM attributes like `aria-selected`.
- Assert class or structure only when it is part of visible behavior or a
  stable contract.

This rollout intentionally skips `@testing-library/jest-dom` to avoid mixing in
an additional assertion style.

## Component Selection Guidance

Start with components that are mostly prop-driven and avoid heavy store, IPC, or
authentication coupling.

Good first targets:

- presentational rows and small wrappers
- components with clear role and aria state
- timer-driven UI with deterministic output
- moderate composition components that expose callbacks through props

Defer components that require large AppStore, dispatcher, or Electron-heavy test
doubles until the helper pattern needs to expand.
