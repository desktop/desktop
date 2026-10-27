import assert from 'node:assert'
import { describe, it } from 'node:test'
import { AssistedCommitCoordinator } from '../../src/lib/assisted-commit/coordinator'
import { IAssistedCommitRepository } from '../../src/lib/assisted-commit/types'
import { readAssistedCommitHead } from '../../src/lib/git/assisted-commit'
import { PopupManager } from '../../src/lib/popup-manager'
import { Branch, BranchType } from '../../src/models/branch'
import { ICopilotAssistedCommitRequest } from '../../src/models/copilot-assisted-commit'
import { TipState } from '../../src/models/tip'
import {
  createTestAccountsStore,
  createTestRepositoryStateCache,
} from '../helpers/app-store-test-harness'
import { count, seed } from '../helpers/assisted-commit'
import {
  createMockPlanner,
  deferred,
  makeCopilotAccount,
} from '../helpers/copilot-assisted-commit'

describe('standalone assisted coordinator', () => {
  for (const cancel of [false, true]) {
    it(`owns native empty-commit acceptance without AppStore (cancel=${cancel})`, async t => {
      const previousPreview = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
      process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
      t.after(() => {
        if (previousPreview === undefined) {
          delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
        } else {
          process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreview
        }
      })
      const repository = await seed(t, { file: 'unchanged\n' })
      const cache = createTestRepositoryStateCache()
      const credentials = createTestAccountsStore()
      const account = await credentials.addAccount(makeCopilotAccount())
      assert.ok(account !== null)
      const planner = createMockPlanner(t)
      t.mock.method(
        planner.store,
        'isAssistedCommitRuntimeAvailable',
        async () => true
      )
      const tokenGetter = t.mock.method(credentials, 'createTokenGetter')
      const finalRefresh = deferred<void>()
      const releaseRefresh = deferred<void>()
      const failures: Error[] = []
      const recorded: string[] = []
      let held = false
      const synchronizeHead = async () => {
        const head = await readAssistedCommitHead(repository)
        const sha = head.sha
        const ref = head.ref
        assert.ok(sha !== null && ref !== null)
        cache.updateBranchesState(repository, state => ({
          ...state,
          tip: {
            kind: TipState.Valid,
            branch: new Branch(
              ref.replace(/^refs\/heads\//, ''),
              null,
              { sha },
              BranchType.Local,
              ref
            ),
          },
        }))
      }
      await synchronizeHead()
      cache.update(repository, state => ({
        allowEmptyCommit: true,
        changesState: {
          ...state.changesState,
          commitMode: 'copilot',
          commitMessage: {
            summary: 'Retained manual title',
            description: 'Retained manual body',
            timestamp: 123,
          },
        },
      }))
      const host: IAssistedCommitRepository = {
        push: async () => {
          throw new Error('Local-only coordinator test must not push')
        },
        recordPush: () =>
          assert.fail('Local-only coordinator test must not record a push'),
        refresh: async (_repository, clearPartialState) => {
          await synchronizeHead()
          if (clearPartialState && !held) {
            held = true
            finalRefresh.resolve()
            await releaseRefresh.promise
          }
        },
        refreshAll: synchronizeHead,
        loadHistory: async () => {},
        recordCommit: async (_repository, _initial, context) => {
          recorded.push(context.summary)
        },
      }
      const coordinator = new AssistedCommitCoordinator(
        cache,
        credentials,
        planner.store,
        new PopupManager(),
        host,
        () => ({
          accounts: [account],
          providers: [],
          models: new Map(),
          selectedRepository: repository,
          hideWhitespace: false,
        }),
        async () => {
          throw new Error('Empty commits must never resolve a model')
        },
        { changed: () => {}, error: error => failures.push(error) }
      )
      const request: ICopilotAssistedCommitRequest = {
        files: [],
        trailers: [],
        skipCommitHooks: false,
        signOffCommits: false,
        allowEmptyCommit: true,
      }
      const prepared = await coordinator.prepare(repository, request)
      const operation = coordinator.create(repository, prepared)
      await Promise.race([
        finalRefresh.promise,
        operation.then(outcome => {
          throw new Error(`Run settled before final refresh: ${outcome.kind}`, {
            cause: outcome.kind === 'error' ? outcome.error : undefined,
          })
        }),
      ])
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(
        (await coordinator.create(repository, prepared)).kind,
        'busy'
      )
      if (cancel) {
        const state = cache.get(repository).changesState.assistedCommit
        assert.ok(state.kind !== 'idle')
        coordinator.state.cancel(repository, state.runId)
      }
      releaseRefresh.resolve()
      const outcome = await operation
      assert.strictEqual(outcome.kind, cancel ? 'cancelled' : 'local-ready')
      assert.strictEqual(await count(repository), cancel ? 1 : 2)
      assert.deepStrictEqual(recorded, cancel ? [] : ['Empty commit'])
      assert.strictEqual(planner.createClient.mock.callCount(), 0)
      assert.strictEqual(tokenGetter.mock.callCount(), 0)
      assert.strictEqual(failures.length, 0)
      assert.strictEqual(cache.get(repository).isCommitting, false)
      assert.strictEqual(
        cache.get(repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(cache.get(repository).allowEmptyCommit, cancel)
      assert.deepStrictEqual(cache.get(repository).changesState.commitMessage, {
        summary: 'Retained manual title',
        description: 'Retained manual body',
        timestamp: 123,
      })
    })
  }
})
