/**
 * Renderer-safe replacement for the Copilot SDK's `node:async_hooks` import.
 *
 * Webpack (see `app/webpack.common.ts`) redirects only the Copilot SDK's
 * `node:async_hooks` imports in the renderer bundle to this module, so the
 * SDK uses this `AsyncLocalStorage` instead of Node's native one.
 *
 * ## The crash
 *
 * With Node's native `AsyncLocalStorage`, generating a commit message could
 * kill the renderer with:
 *
 *   Fatal error in V8: Isolate::PushStackTraceAndDie null prototype chain root
 *
 * The crash surfaced with Copilot SDK 1.0.30-preview.0, which started wrapping
 * every inbound JSON-RPC message in `AsyncLocalStorage.run()`. The SDK uses
 * the API correctly; it just calls it often enough to trigger the bug below.
 *
 * ## Root cause: V8 (not Desktop, the SDK, Node or Electron)
 *
 * V8 has a single per-isolate slot, the "continuation-preserved embedder
 * data" (CPED), which follows async continuations. In an Electron renderer it
 * has two users:
 *
 * - Node's `AsyncLocalStorage` (AsyncContextFrame implementation, the default
 *   since Node 24) keeps its current frame, a JavaScript `Map`, there.
 * - Blink's task attribution stores a C++ `CppHeapExternal` there while it
 *   runs attributed tasks, such as input event handlers (clicks) and
 *   `scheduler.postTask` callbacks.
 *
 * Node reads the slot through V8's `getContinuationPreservedEmbedderData`
 * builtin. That builtin (`src/builtins/promise-misc.tq`) guards against
 * non-JavaScript data and returns `undefined` for it, so `getStore()` just
 * sees "no store". V8's optimizing compilers drop that guard: TurboFan
 * (`JSCallReducer::ReduceGetContinuationPreservedEmbedderData`, lowered by
 * Turboshaft to a raw load) and Maglev
 * (`MaglevReducer::TryReduceGetContinuationPreservedEmbedderData`) replace the
 * builtin call with a raw load of the slot.
 *
 * So once `AsyncLocalStorage.run()`/`getStore()` have been called enough times
 * (about 1,000 calls in testing) to be optimized, a `getStore()` call inside a
 * Blink-attributed task receives the raw `CppHeapExternal` as its frame.
 * The property lookup `frame?.has(...)` on that object then aborts V8.
 *
 * Reproduced without Desktop or the SDK, using only native
 * `AsyncLocalStorage` warmed up and then read from a click handler or a
 * `scheduler.postTask` callback, on Electron 44.9.1, 44.11.4, 45.3.4 and
 * 46.0.0-alpha.11 (V8 15.2 to 16.0). It doesn't reproduce cold, with
 * `--no-maglev --no-turbofan`, or with `--jitless`. It also reproduces in
 * plain Node (no Blink) when a native addon puts non-JavaScript data in the
 * slot with `Isolate::SetContinuationPreservedEmbedderDataV2`. No released
 * V8 had fixed the optimizer paths when this was written.
 *
 * ## Why this workaround
 *
 * This module implements the subset of `AsyncLocalStorage` the SDK uses
 * (`getStore` and `run`) on top of `createRepositoryOperationContext`, which
 * tracks context with public `async_hooks` callbacks and never reads the CPED
 * slot. All instances share one hook. Each instance keeps its value under its
 * own key, so nesting and isolation work as they do natively.
 *
 * Alternatives considered:
 *
 * - Disabling AsyncContextFrame with `--no-async-context-frame` also works.
 *   Electron only accepts this Node option through `NODE_OPTIONS`, but the
 *   main process can set `process.env.NODE_OPTIONS` before creating the
 *   window, and the renderer inherits it (verified: a warmed click crashes
 *   without it and passes with it). The `EnableNodeOptionsEnvironmentVariable`
 *   fuse must stay enabled. This covers every native `AsyncLocalStorage` user
 *   in the renderer, not just the SDK, and needs no bundler replacement.
 *   It was not chosen because:
 *   - Every child process inherits the variable: Git, Git hooks, credential
 *     helpers and the Copilot runtime. Node versions before 24 reject the
 *     unknown flag in `NODE_OPTIONS` and refuse to start, which would break
 *     user Node-based Git hooks. Desktop would have to strip the flag from
 *     every spawned environment and merge it with any user `NODE_OPTIONS`.
 *   - Renderers created later (reloads, crash recovery) must still get it.
 *   - All native `AsyncLocalStorage` in the renderer would fall back to the
 *     slower async_hooks-based implementation.
 * - Excluding Node's functions from optimization (`--turbo-filter` and
 *   `--maglev-filter` on `activeCurrent` or `getStore`) does not help: the
 *   builtin call is still inlined and reduced in other optimized callers.
 * - Disabling Blink task attribution
 *   (`TaskAttributionInfrastructureDisabledForTesting`) fixes clicks but not
 *   `scheduler.postTask`, and is a testing-only feature.
 * - Disabling Maglev and TurboFan would slow down all JavaScript.
 * - The SDK has no option to skip `AsyncLocalStorage`, and it relies on it to
 *   reject re-entrant session initialization.
 * - Running the SDK in a utility process (no Blink, so nothing else writes
 *   the slot) would fix this for good, but it means moving token, session FS,
 *   permission, streaming and cancellation plumbing across processes.
 *   Possible future work; the main process was ruled out because SDK work
 *   there would block the UI and an SDK crash would take down the whole app.
 *
 * Remove this module and the webpack replacement once Desktop ships an
 * Electron whose V8 keeps the non-JavaScript guard in optimized code, or once
 * the SDK no longer runs in the renderer.
 */
import { createRepositoryOperationContext } from '../git/repository-operation-context'

// Share one async hook across SDK clients rather than registering one per store.
const context = createRepositoryOperationContext<ReadonlyMap<symbol, unknown>>()

/** Renderer-safe subset of AsyncLocalStorage used by the Copilot SDK. */
export class AsyncLocalStorage<T> {
  private readonly key = Symbol()

  /** Read this instance's value for the current async operation. */
  public getStore(): T | undefined {
    // Only this instance can write to its key, and run only accepts T.
    return context.getStore()?.get(this.key) as T | undefined
  }

  /** Run a callback and its async descendants with this instance's value. */
  public run<TArgs extends unknown[], TResult>(
    store: T,
    callback: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult {
    if (Object.is(store, this.getStore())) {
      return callback(...args)
    }

    const stores = new Map(context.getStore())
    stores.set(this.key, store)
    return context.run(stores, () => callback(...args))
  }
}
