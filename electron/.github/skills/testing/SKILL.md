---
name: testing
description: >-
  Instructions for writing and maintaining tests in GitHub Desktop. Covers unit
  tests, UI component tests, and ad-hoc E2E tests. Use this skill when
  implementing features or bugfixes to write relevant tests, update existing
  tests, run the full suite to check for regressions, and produce screenshots
  and videos for Pull Request documentation.
---

# Testing in GitHub Desktop

This document describes the three tiers of tests in GitHub Desktop, how to run
them, and the patterns you should follow when writing new tests or updating
existing ones as part of a feature or bugfix.

## Overview

| Tier | Purpose | Location | Runner |
|------|---------|----------|--------|
| Unit / integration (non-UI) | Pure logic, stores, models, git operations | `app/test/unit/` | `node:test` via `yarn test` |
| UI component | React components rendered in JSDOM | `app/test/unit/ui/` | `node:test` + React Testing Library via `yarn test` |
| E2E (ad-hoc) | Full app launched with Playwright + Electron | `app/test/e2e/` | Playwright via `yarn test:e2e:*` |

### When to use each tier

- **Unit / integration**: new or changed logic in `app/src/lib/`, `app/src/models/`, git operations, store behavior, utility functions, IPC contracts.
- **UI component**: new or changed React components, dialog behavior, banners, toolbar items, list rendering.
- **Ad-hoc E2E**: only for **temporary** validation of a feature or bugfix across the full app. E2E tests you write are meant to be run locally and to capture screenshots/video for the PR, **not** to be merged into the permanent smoke suite.

---

## Running Tests

```bash
# All unit and UI tests
yarn test

# A specific test file
yarn test app/test/unit/my-feature-test.ts

# All tests in a directory (recursive)
yarn test app/test/unit/ui

# E2E — build unpackaged app + run (fast local iteration)
yarn test:e2e:unpackaged

# E2E — run against an already-built unpackaged app
DESKTOP_E2E_APP_MODE=unpackaged npx playwright test --config app/test/e2e/playwright.config.ts

# E2E — full packaged build + run (production-like)
yarn test:e2e:packaged
```

The test runner (`script/test.mjs`) discovers files matching
`-test.(ts|tsx|js|jsx|mts|mjs)` recursively in `app/test/unit/` by default, or
in the paths you pass.

---

## Test Verification Workflow

After implementing any change you **must** run the full unit test suite:

```bash
yarn test
```

If any tests fail:

1. Determine whether the failure is a **regression** (a bug you introduced) or
   an **expected behavior change** (your change intentionally altered the
   behavior).
2. If it is a regression, fix the code.
3. If it is an expected change, update the test assertions so they reflect the
   new correct behavior.
4. Re-run the suite until everything passes.

Then verify linting:

```bash
yarn lint
```

If lint errors are reported and you want to auto-fix them:

```bash
yarn lint:fix
```

> **Note:** `yarn lint:fix` rewrites files across the repository (Prettier +
> ESLint `--fix`). Only run it when you intend to apply those edits — do not
> use it as a read-only check.

---

## Bug-First Testing

When fixing a bug:

1. **Write a failing test first** that reproduces the bug.
2. Verify the test fails.
3. Apply the fix.
4. Verify the test now passes.

This proves the fix works and protects against regressions.

---

## Unit / Integration Tests (Non-UI)

### File conventions

- Location: `app/test/unit/`, mirroring the source tree
  (e.g. `app/src/lib/git/clone.ts` → `app/test/unit/git/clone-test.ts`).
- File name: `*-test.ts`.
- Extension: `.ts` (use `.tsx` only when the file contains JSX).

### Imports

```ts
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
```

Use `node:assert` for all assertions — never Jest or Chai matchers.

### Test structure

Synchronous tests are fine for pure logic:

```ts
describe('MyFeature', () => {
  it('does something useful', () => {
    const result = myFunction('input')
    assert.equal(result, 'expected')
  })
})
```

Use `async` when the test or its helpers need it. Pass the test context `t`
when using helpers that register cleanup via `t.after()`:

```ts
it('creates a repo', async t => {
  const repo = await setupEmptyRepository(t)
  // repo's temp directory is cleaned up automatically after the test
})
```

### Assertion patterns

| Pattern | Use |
|---------|-----|
| `assert.equal(a, b)` | Abstract equality (`==`) — use when coercion is intentional |
| `assert.strictEqual(a, b)` | Strict equality (`===`) — preferred; catches type mismatches |
| `assert.deepEqual(a, b)` | Deep structural equality |
| `assert.notEqual(a, b)` | Abstract inequality (`!=`) |
| `assert.notStrictEqual(a, b)` | Strict inequality (`!==`) |
| `assert.ok(value)` | Truthy check |
| `assert.rejects(asyncFn, /pattern/)` | Async rejection with message |
| `assert.throws(fn, /pattern/)` | Sync throw |

> **`assert.equal` vs `assert.strictEqual`**: `assert.equal(a, b)` uses the `==` operator
> (abstract equality), so `assert.equal(42, '42')` passes. `assert.strictEqual(a, b)` uses
> `===`, so it also checks that types match. **Prefer `assert.strictEqual`** in most cases
> to avoid silent type-coercion surprises. Use `assert.equal` only when you explicitly
> want coercion semantics.

### Existing helpers — reuse them

| Helper file | Key exports | Purpose |
|-------------|------------|---------|
| `app/test/helpers/repositories.ts` | `setupEmptyRepository(t)`, `setupFixtureRepository(t, name)`, `setupConflictedRepo(t)` | Create temporary git repos with automatic cleanup |
| `app/test/helpers/repository-scaffolding.ts` | `makeCommit()`, `createBranch()`, `switchTo()`, `cloneRepository()` | Build git state (commits, branches) |
| `app/test/helpers/temp.ts` | `createTempDirectory(t)` | Temporary directory with auto-cleanup via `t.after()` |
| `app/test/helpers/mock-api.ts` | `createMockAPI(overrides)`, `createMockAPIRepository()`, `createMockAPIIdentity()` | Proxy-based mock API — rejects unmocked methods to prevent real HTTP requests |
| `app/test/helpers/mock-ipc.ts` | `MockIPC` | Records `send()`/`invoke()` calls, simulates main→renderer messages via `emit()` |
| `app/test/helpers/app-store-test-harness.ts` | `createTestStores()`, `createTestAccountsStore()`, `createTestRepositoriesStore()` | Factory functions for wired-up test store instances backed by in-memory storage |
| `app/test/helpers/test-stats-store.ts` | `TestStatsStore` | In-memory stats store for verifying metric increments |
| `app/test/helpers/stores/` | `InMemoryStore`, `AsyncInMemoryStore` | Key-value stores for testing code that depends on persistent storage |
| `app/test/helpers/databases/` | `TestRepositoriesDatabase`, `TestIssuesDatabase`, etc. | Dexie database wrappers with `reset()` for cleanup |
| `app/test/helpers/git.ts` | `getTipOrError()`, `getRefOrError()`, `getBranchOrError()` | Safe git object accessors for tests |
| `app/test/helpers/random-data.ts` | `generateString()` | Random hex strings using crypto |

### Patterns to follow

**Factory functions for dependencies** — create stores, databases, and API
instances through dedicated factory functions, not raw constructors:

```ts
const stores = createTestStores()
const api = createMockAPI({
  fetchRepository: async () => createMockAPIRepository(),
})
```

**Promise wrappers with timeouts** for callback-based async APIs:

```ts
async function waitForResult(store, ...args): Promise<Result> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out')),
      5_000
    )
    store.getResult(...args, result => {
      clearTimeout(timeout)
      resolve(result)
    })
  })
}
```

**State machine testing** — verify store transitions by calling methods and
asserting intermediate states:

```ts
signInStore.beginDotComSignIn()
const state = signInStore.getState()
assert.equal(state?.kind, SignInStep.Authentication)
```

**Compile-time contract verification** — use TypeScript's type system to catch
missing cases at compile time (see `ipc-contract-test.ts` for example):

```ts
type AssertExactUnion<TExpected, TActual> = [
  Exclude<TExpected, TActual>,
  Exclude<TActual, TExpected>,
] extends [never, never]
  ? true
  : never
```

---

## UI Component Tests

### File conventions

- Location: `app/test/unit/ui/`.
- File name: `*-test.tsx` (must be `.tsx` for JSX).

### Critical import rule

**Always** import render utilities from the project's wrapper module:

```tsx
import { render, fireEvent, screen, waitFor, within } from '../../helpers/ui/render'
```

**Never** import directly from `@testing-library/react`. The wrapper module
(`app/test/helpers/ui/render.tsx`) imports `app/test/helpers/ui/setup.ts` as a
side-effect, which:

1. Polyfills `ResizeObserver` (not available in JSDOM).
2. Aligns `globalThis.Event`/`CustomEvent` with the jsdom window versions.
3. Registers an `afterEach(cleanup)` hook so the DOM is cleaned between tests.

Skipping this import will cause test failures or leaks.

### Rendering and querying

```tsx
import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'

describe('MyComponent', () => {
  it('renders a button and responds to clicks', () => {
    let clicked = 0
    render(<MyComponent onClick={() => clicked++} />)

    const button = screen.getByRole('button', { name: 'Submit' })
    assert.ok(button)

    fireEvent.click(button)
    assert.equal(clicked, 1)
  })
})
```

**Querying elements:**

| Method | Use |
|--------|-----|
| `screen.getByRole('button', { name: 'X' })` | Accessible role + name (preferred) |
| `screen.getByText('Hello')` | Visible text content |
| `screen.getByTestId('my-id')` | `data-testid` attribute |
| `view.container.querySelector('.css-class')` | CSS selector on the render container |
| `screen.queryByRole(...)` | Returns `null` instead of throwing (for absence checks) |

**Assertions** use `node:assert`, not Jest matchers:

```tsx
assert.notEqual(view.container.querySelector('.my-class'), null)
assert.equal(screen.queryByRole('button', { name: 'Gone' }), null)
```

### Re-rendering

```tsx
const view = render(<MyComponent visible={true} />)
// ... assert initial state ...
view.rerender(<MyComponent visible={false} />)
// ... assert updated state ...
```

### Callback verification

Capture callbacks in local variables and assert after interaction:

```tsx
let dismissed = 0
render(<Banner onDismissed={() => dismissed++} />)
fireEvent.click(screen.getByRole('button', { name: 'Dismiss this message' }))
assert.equal(dismissed, 1)
```

### Timer mocking

For components with timeouts (banners, auto-dismiss, debounce):

```tsx
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  advanceTimersBy,
  enableTestTimers,
  resetTestTimers,
} from '../../helpers/ui/timers'

describe('auto-dismissing banner', () => {
  beforeEach(() => enableTestTimers(['setTimeout']))
  afterEach(() => resetTestTimers())

  it('dismisses after timeout', () => {
    let dismissed = 0
    render(<Banner timeout={500} onDismissed={() => dismissed++} />)

    advanceTimersBy(500)
    assert.equal(dismissed, 1)
  })
})
```

### Clipboard testing

Register `restore()` in `afterEach` so the mock is always torn down even when
an assertion throws:

```tsx
import { afterEach, it } from 'node:test'
import { captureClipboardWrites } from '../../helpers/ui/electron'

describe('CopyButton', () => {
  let restore: () => void
  let writes: string[]

  afterEach(() => restore?.())

  it('copies text to clipboard', () => {
    ;({ writes, restore } = captureClipboardWrites())
    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    assert.deepEqual(writes, ['hello'])
  })
})
```

Calling `restore()` inline at the end of the test body is **not** safe — if
any assertion before it throws, the global `clipboard.writeText` mock stays
patched and will silently contaminate subsequent tests.

### ESLint note

The `react/jsx-no-bind` rule is disabled for test files, so inline arrow
functions in JSX are fine in tests.

---

## Ad-hoc E2E Tests

E2E tests launch the real Desktop app via Playwright's Electron support. Use
them **only for temporary validation** of your work — to capture screenshots
and video for the Pull Request. Do **not** add tests to the permanent smoke
suite (`app-launch.e2e.ts`) unless explicitly asked.

### File conventions

- Location: `app/test/e2e/`.
- File name: `*.e2e.ts` (Playwright config matches this pattern).
- Do **not** modify `app-launch.e2e.ts` unless explicitly asked.

> ⚠️ **Delete ad-hoc specs before opening your PR.** Playwright's config
> matches every `*.e2e.ts` file in `app/test/e2e/`, so any file you create
> there will run in CI. Ad-hoc specs are for local validation only — stage and
> run them locally, then `git rm` them before committing.

### Imports

```ts
import {
  test,
  expect,
  controlMockServer,
  getMockRequests,
  dismissMoveToApplicationsDialog,
} from './e2e-fixtures'
import type { Page } from '@playwright/test'
```

### Test structure

```ts
test.describe.configure({ mode: 'serial' })

test.describe('My Feature E2E', () => {
  test('launches app and shows feature', async ({ mainWindow: page }) => {
    // Wait for the React app to mount
    await page.waitForFunction(
      () =>
        (document.getElementById('desktop-app-container')?.innerHTML.length ??
          0) > 100,
      null,
      { timeout: 30000 }
    )

    // ... interact with the app ...
  })
})
```

All tests run **serially** in the same Electron session (one app launch per
test file).

### Locating elements

```ts
// CSS selector
const button = page.locator('button:has-text("Finish")')

// XPath
const item = page.locator('//div[contains(@class, "list-item")]')

// Waiting for visibility
await button.waitFor({ state: 'visible', timeout: 15000 })
```

### Setting React controlled inputs

For most inputs, Playwright's `.fill()` works fine. However, some React
controlled inputs ignore `.fill()` because they rely on React's synthetic
event system rather than native DOM events. If `.fill()` doesn't update
the React state (i.e., the value appears empty after filling), use this
workaround that fires both `input` and `change` events through React's
internal value setter:

```ts
await input.evaluate((el, value) => {
  const inp = el as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    ?.set?.call(inp, value)
  inp.dispatchEvent(new Event('input', { bubbles: true }))
  inp.dispatchEvent(new Event('change', { bubbles: true }))
}, 'my-value')
```

Use `.fill()` first — only fall back to the workaround when `.fill()` does
not produce the expected state change in React.

### Assertions

**Direct assertions** on locators:

```ts
await expect(locator).toContainText('expected text', { timeout: 15000 })
await expect(locator).toBeVisible()
await expect(locator).not.toBeVisible()
```

**Polling assertions** for async conditions (git state, server requests):

```ts
await expect
  .poll(() => getSmokeRepoCurrentBranch(), {
    timeout: 15000,
    intervals: [1000],
  })
  .toBe('my-branch')
```

### IPC events

Trigger menu events or app actions from the renderer:

```ts
await page.evaluate(() => {
  require('electron').ipcRenderer.emit('menu-event', {}, 'show-about')
})
```

### Taking screenshots

Take screenshots at key UI moments during the test. Save them under
`playwright-videos/` so they are collected alongside videos:

```ts
await page.screenshot({
  path: 'playwright-videos/01-feature-dialog-open.png',
})
```

Name screenshots with a numeric prefix so they appear in order. Be
descriptive:

```ts
await page.screenshot({ path: 'playwright-videos/02-branch-created.png' })
await page.screenshot({ path: 'playwright-videos/03-diff-view.png' })
```

### Video recording

Videos are recorded **automatically** by the fixture configuration at
1280×800 resolution. They are saved in the `playwright-videos/` directory.
You do not need to configure recording — just run the tests.

### Running ad-hoc E2E tests

For local iteration, use the unpackaged mode to avoid a full packaging step:

```bash
# Build unpackaged + run all E2E tests
yarn test:e2e:unpackaged

# Run only your specific test file (after building)
DESKTOP_E2E_APP_MODE=unpackaged npx playwright test \
  --config app/test/e2e/playwright.config.ts \
  app/test/e2e/my-feature.e2e.ts
```

> ⚠️ **Do NOT use `yarn build:dev` for E2E tests.** The development build
> produces an `index.html` that loads the renderer bundle from
> `http://localhost:3000/build/renderer.js` (the webpack dev server). Without
> the dev server running, the React app never mounts and the Playwright
> `waitForFunction` on `desktop-app-container` will time out silently.
>
> Always use `yarn test:e2e:build:unpackaged` (or the combined
> `yarn test:e2e:unpackaged`) which runs a **production** build with
> `DESKTOP_SKIP_PACKAGE=1`. This bundles `renderer.js` directly into `out/`
> so the app is self-contained.

### Handling the welcome flow and macOS dialogs

If your test launches from a fresh state, you will encounter the welcome flow.
Handle it like the smoke test does:

```ts
// Skip the welcome sign-in
const skipButton = page.locator('a.skip-button')
await skipButton.waitFor({ state: 'visible', timeout: 30000 })
await skipButton.click()

// Fill name/email and finish
const nameInput = page.locator('input[placeholder="Your Name"]')
await nameInput.waitFor({ state: 'visible', timeout: 15000 })
if ((await nameInput.inputValue()) === '') {
  await nameInput.fill('GitHub Desktop E2E')
}
const emailInput = page.locator('input[placeholder="your-email@example.com"]')
if ((await emailInput.inputValue()) === '') {
  await emailInput.fill('desktop-e2e@example.com')
}
await page.locator('button:has-text("Finish")').click()
await page.waitForSelector('#welcome', { state: 'hidden', timeout: 15000 })

// Dismiss macOS "Move to Applications" dialog if it appears
await dismissMoveToApplicationsDialog(page)
```

### Attaching artifacts to Pull Requests

After running E2E tests, collect artifacts from `playwright-videos/`:

- **Screenshots**: the `.png` files you captured with `page.screenshot()`.
- **Videos**: the `.webm` files recorded automatically by Playwright.
- **Traces**: the `trace-*.zip` files saved by the fixture teardown.

Attach the screenshots and video to the Pull Request description or as
comments to show the new UI additions and prove the feature works end-to-end.

#### Faking data or state for ad-hoc E2E screenshots

Some UI features are only visible under specific conditions — for example, a
signed-in GitHub.com account, a populated model list, or an active Copilot
subscription. In ad-hoc E2E tests whose sole purpose is capturing screenshots
for a Pull Request, you can temporarily modify source code to bypass those
conditions and show the full UI.

**Workflow:**

1. Make the minimum temporary changes needed (e.g. hardcode a store property,
   inject fake data, force a boolean flag).
2. Rebuild with `yarn test:e2e:build:unpackaged`.
3. Run your ad-hoc E2E spec and capture screenshots/video.
4. **Revert every temporary change** before committing. Verify with
   `git diff <file>` that no fake data leaks into the branch.
5. Delete the ad-hoc E2E spec.

**Tips:**

- **Prefer overriding in `getState()`** (in `AppStore`) rather than deep in a
  store or API layer. This keeps the blast radius small — a single file, a
  few lines — and easy to revert cleanly.
- **Use realistic but obviously fake data.** If you inject model names, use
  real-looking IDs and display names so the screenshots read naturally.
- **Guard with `__DEV__` only if you plan to commit the fake data** (not
  recommended). For ad-hoc screenshots the code is reverted immediately, so
  a plain unconditional override is simpler and avoids issues with `__DEV__`
  being `false` in production E2E builds (`RELEASE_CHANNEL=production`).
- **Watch out for tree-shaking.** The E2E build uses `NODE_ENV=production`.
  Constants like `__DEV__` are `false` in that mode, so any code guarded by
  `if (__DEV__)` will be dead-code-eliminated by webpack. If you need the
  fake data to survive the production build, don't guard it.
- **Verify the revert is complete.** After capturing artifacts, run
  `git diff -- <files you touched>` and confirm zero output before moving on.

**Example — forcing a populated Copilot model list:**

```ts
// In AppStore.getState(), temporarily replace:
copilotModels: this.copilotModels,
copilotAvailable: this.copilotStore.isAvailable,

// With:
copilotModels:
  this.copilotModels !== null && this.copilotModels.length > 0
    ? this.copilotModels
    : fakeModels,       // defined as a const above the class
copilotAvailable: true,
```

After screenshots are captured, revert these two lines back to their originals.

---

## Test Helpers Reference

### Global test environment (`app/test/globals.mts`)

This file is loaded automatically by the test runner. It:

- Imports `fake-indexeddb/auto` and `global-jsdom/register` for browser API
  simulation.
- Defines Webpack build-time constants (`__DEV__`, `__APP_NAME__`, etc.).
- Mocks the `electron` module (clipboard, shell, ipcRenderer).
- Removes `MessageChannel`/`MessagePort`/`BroadcastChannel` to prevent test
  hangs (React 16 + Dexie cleanup issue).

You do **not** need to set up any of this manually — it runs before every test
file.

### Environment variables (`.test.env`)

Loaded automatically by the test runner. Sets `GIT_AUTHOR_NAME`,
`GIT_COMMITTER_NAME`, etc. so git operations produce deterministic results.

---

## Checklist

When you are done implementing a feature or bugfix, verify:

- [ ] Wrote unit tests for new or changed logic.
- [ ] Wrote UI component tests for new or changed React components.
- [ ] Existing tests updated if behavior intentionally changed.
- [ ] `yarn test` passes with no failures.
- [ ] `yarn lint` passes (run `yarn lint:fix` to auto-fix if needed).
- [ ] (If applicable) Ran ad-hoc E2E test and captured screenshots/video.
- [ ] (If applicable) Attached screenshots and video to the PR.
