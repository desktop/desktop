import { writeFile, rename, mkdir } from 'fs/promises'
import { createTempDirectory } from '../../helpers/temp'
import { Repository } from '../../../src/models/repository'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../../src/models/status'
import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as FileSystem from 'fs/promises'
import { join } from 'path'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
let models: typeof import('../../helpers/copilot-assisted-commit')
let diffs: typeof import('../../../src/lib/git/diff')
let diffModels: typeof import('../../../src/models/diff')
let operations: typeof import('../../../src/lib/git/repository-operation')
let runErrors: typeof import('../../../src/lib/assisted-commit-run')
let afterStat:
  | ((path: Parameters<typeof FileSystem.lstat>[0]) => Promise<void>)
  | undefined

before(async () => {
  const stat = FileSystem.lstat
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      lstat: async (...args: Parameters<typeof FileSystem.lstat>) => {
        const result = await stat(...args)
        await afterStat?.(args[0])
        return result
      },
    },
  })
  ;[harness, fixtures, models, diffs, diffModels, operations, runErrors] =
    await Promise.all([
      import('../../helpers/assisted-commit-run'),
      import('../../helpers/assisted-commit'),
      import('../../helpers/copilot-assisted-commit'),
      import('../../../src/lib/git/diff'),
      import('../../../src/models/diff'),
      import('../../../src/lib/git/repository-operation'),
      import('../../../src/lib/assisted-commit-run'),
    ])
})

describe('assisted certified diff publication', () => {
  it('merges certified selection into the latest real status instead of overwriting other rows', async t => {
    const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
    const source = await fixtures.seed(t, { file: base.join('') })
    const current = [...base]
    current[3] = 'selected prefix\n'
    current[49] = 'unselected suffix\n'
    await FileSystem.writeFile(join(source.path, 'file'), current.join(''))
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await diffs.getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === diffModels.DiffType.Text && diff.hunks.length === 2)
    let selection = file.selection
    for (const [index, line] of diff.hunks[1].lines.entries()) {
      if (line.isIncludeableLine()) {
        selection = selection.withLineSelection(
          diff.hunks[1].unifiedDiffStart + index,
          false
        )
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'cancelled'
    )
    const reload = h.appStore['updateChangesWorkingDirectoryDiff'].bind(
      h.appStore
    )
    let insideStatus = false
    h.appStore['updateChangesWorkingDirectoryDiff'] = async repo => {
      if (!insideStatus) {
        await reload(repo)
      }
    }
    let injected = false
    t.after(() => {
      afterStat = undefined
    })
    afterStat = async path => {
      if (path === join(repository.path, 'file') && !injected) {
        injected = true
        afterStat = undefined
        await FileSystem.writeFile(
          join(repository.path, 'later'),
          'new unselected file\n'
        )
        insideStatus = true
        try {
          await h.appStore._loadStatus(repository)
        } finally {
          insideStatus = false
        }
        assert.ok(
          h
            .state(repository)
            .changesState.workingDirectory.files.some(
              file => file.path === 'later'
            )
        )
      }
    }
    await reload(repository)
    assert.strictEqual(injected, true)
    const files = h.state(repository).changesState.workingDirectory.files
    assert.ok(files.some(file => file.path === 'later'))
    assert.strictEqual(
      files.find(file => file.path === 'file')?.selection.getSelectionType(),
      diffModels.DiffSelectionType.Partial
    )
    assert.strictEqual(await fixtures.count(repository), 1)
  })
})

describe('assisted commit reader settlement and publication', () => {
  it('does not auto-select a new unselected edit discovered in a later finishing status read', async t => {
    const source = await fixtures.seed(t, {
      selected: 'before\n',
      other: 'before other\n',
    })
    await writeFile(join(source.path, 'selected'), 'selected now\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    h.appStore._refreshRepository = async repo => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await writeFile(
          join(repository.path, 'other'),
          'new unselected finishing edit\n'
        )
      }
      return refresh(repo)
    }
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file =>
            file.selection.getSelectionType() ===
            diffModels.DiffSelectionType.None
        )
    )
  })

  it('propagates required reader failures during finishing rather than silently accepting failable-operation defaults', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const original = gitStore.loadLocalCommits.bind(gitStore)
    const failed = new Error('Required history reconciliation failed')
    gitStore.loadLocalCommits = async (...args) => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await gitStore.performFailableOperation(async () => {
          throw failed
        })
        return null
      }
      return original(...args)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    if (outcome.kind === 'error') {
      assert.ok(
        runErrors.assistedCommitErrorCauses(outcome.error).includes(failed)
      )
    }
  })

  it('releases history request keys after a strict reader fails', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const operation = gitStore.performFailableOperation.bind(gitStore)
    gitStore.performFailableOperation = async () => {
      throw new Error('Synthetic required reader failure')
    }
    await assert.rejects(gitStore.loadCommitBatch('HEAD', 0), /reader failure/)
    gitStore.performFailableOperation = operation
    const commits = await gitStore.loadCommitBatch('HEAD', 0)
    assert.ok(commits !== null && commits.length === 1)
  })

  it('keeps exclusion association for a status reader queued before its run is removed', async t => {
    const source = await fixtures.seed(t, {
      selected: 'before\n',
      other: 'before other\n',
    })
    await writeFile(join(source.path, 'selected'), 'selected now\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let status: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      status = h.appStore._loadStatus(repository)
      return models.wholeSelectionResponse(analysis)
    })
    const refresh = h.assisted.recovery['refresh'].bind(h.assisted.recovery)
    h.assisted.recovery['refresh'] = async (...args) => {
      await refresh(...args)
      if (args[1]) {
        await writeFile(
          join(repository.path, 'other'),
          'late unselected edit\n'
        )
      }
    }
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await status
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file =>
            file.selection.getSelectionType() ===
            diffModels.DiffSelectionType.None
        )
    )
  })

  it('rejects strict status exit-128 instead of returning null', async t => {
    const missingGit = await createTempDirectory(t)
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = new Repository(missingGit, 999, null, false)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    await assert.rejects(
      gitStore.loadStatus({ propagateErrors: true }),
      /not a git repository/i
    )
  })

  it('resumes working-directory diffs after a settled planning failure when returning to manual', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Synthetic planner failure')
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
    const selection = h.state(repository).changesState.selection
    assert.ok(selection.kind === 'WorkingDirectory' && selection.diff !== null)
  })

  it('resumes automatic history file and diff loading after a rolled-back finishing failure', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.assisted.recovery['refresh'].bind(h.assisted.recovery)
    h.assisted.recovery['refresh'] = async (repo, afterSuccess) => {
      if (afterSuccess) {
        throw new Error('Synthetic finishing refresh failure')
      }
      return refresh(repo, afterSuccess)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === null)
    const run = h.assisted.state['runs'].get(repository.id)
    assert.ok(
      run?.finished && run.result !== undefined && run.lease === undefined
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    const sha = await fixtures.rawGit(repository, ['rev-parse', 'HEAD'])
    await h.appStore['updateOrSelectFirstCommit'](repository, [sha])
    const selected = h.state(repository).commitSelection
    assert.deepStrictEqual(selected.shas, [sha])
    assert.strictEqual(selected.changesetData.files.length, 1)
    assert.ok(selected.file !== null && selected.diff !== null)
  })

  it('keeps mutations blocked through a released associated reader before final publication', async t => {
    const { h, repository, current } = await harness.partialSelectionFixture(
      t,
      1
    )
    const entered = models.deferred<void>()
    const finish = models.deferred<void>()
    const loadDiff = h.assisted.readers['updateDiffCore'].bind(
      h.assisted.readers
    )
    let owned: ReturnType<typeof h.assisted.state['runs']['get']>
    let paused = false
    h.assisted.readers['updateDiffCore'] = async repo => {
      if (!paused && owned !== undefined && owned.lease === undefined) {
        paused = true
        entered.resolve()
        await finish.promise
      }
      return loadDiff(repo)
    }
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.assisted.state['runs'].get(repository.id)
      reader = h.appStore._loadStatus(repository)
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    try {
      const next = [...current]
      next[1] = 'new earlier unselected\n'
      await writeFile(join(repository.path, 'file'), next.join(''))
      await assert.rejects(
        h.appStore._commitIncludedChanges(repository, {
          summary: 'Must not commit during verification',
          description: '',
          trailers: [],
        }),
        /assisted commit/
      )
    } finally {
      finish.resolve()
      await operation
      await reader
    }
    assert.strictEqual(await fixtures.count(repository), 1)
  })

  it('resumes the current Changes diff immediately after verified analysis cancellation', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'cancelled')
    const selection = h.state(repository).changesState.selection
    assert.ok(selection.kind === 'WorkingDirectory' && selection.diff !== null)
  })

  it('preserves an associated reader failure after release instead of reporting quiet cancellation', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const load = gitStore.loadStatus.bind(gitStore)
    const failure = new Error('Synthetic released status failure')
    let owned: ReturnType<typeof h.assisted.state['runs']['get']>
    gitStore.loadStatus = async (...args) => {
      if (owned !== undefined && owned.lease === undefined) {
        throw failure
      }
      return load(...args)
    }
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.assisted.state['runs'].get(repository.id)
      reader = h.appStore._loadStatus(repository).catch(error => error)
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(await reader, failure)
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.ok(
      runErrors.assistedCommitErrorCauses(state.error).includes(failure)
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('protects accepted physical resources through released-reader settlement across repository IDs', async t => {
    const parentSource = await fixtures.seed(t, { parent: 'parent\n' })
    const childSource = await fixtures.seed(t, { file: 'before\n' })
    const childPath = join(parentSource.path, 'nested')
    await rename(childSource.path, childPath)
    await mkdir(childSource.path)
    await writeFile(join(childPath, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const child = await h.register(new Repository(childPath, -1, null, false))
    const parent = await h.register(parentSource)
    const entered = models.deferred<void>()
    const finish = models.deferred<void>()
    const load = h.assisted.readers['updateDiffCore'].bind(h.assisted.readers)
    let owned: ReturnType<typeof h.assisted.state['runs']['get']>
    let paused = false
    h.assisted.readers['updateDiffCore'] = async repo => {
      if (
        repo.id === child.id &&
        !paused &&
        owned?.finalized &&
        owned.lease === undefined
      ) {
        paused = true
        entered.resolve()
        await finish.promise
      }
      return load(repo)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.assisted.state['runs'].get(child.id)
      return models.wholeSelectionResponse(analysis)
    })
    let discarded = false
    h.appStore['discardChangesCore'] = async () => {
      discarded = true
    }
    const operation = h.dispatcher.createCopilotAssistedCommits(
      child,
      h.request(child)
    )
    await entered.promise
    const affected = operations.isRepositoryAffectedByAssistedCommit(
      parent.path
    )
    const outcome = await h.appStore
      ._discardChanges(
        parent,
        [
          new WorkingDirectoryFileChange(
            'nested',
            { kind: AppFileStatusKind.Untracked },
            diffModels.DiffSelection.fromInitialSelection(
              diffModels.DiffSelectionType.All
            )
          ),
        ],
        false
      )
      .then(
        () => null,
        error => error
      )
    finish.resolve()
    assert.strictEqual((await operation).kind, 'local-ready')
    assert.strictEqual(affected, true)
    assert.ok(
      outcome instanceof Error && /assisted commit/i.test(outcome.message)
    )
    assert.strictEqual(discarded, false)
    assert.strictEqual(await fixtures.count(child), 2)
  })

  it('retains a reader admitted during final fence verification until its result settles', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const fenceEntered = models.deferred<void>()
    const finishFence = models.deferred<void>()
    const readerEntered = models.deferred<void>()
    const finishReader = models.deferred<void>()
    const verify = h.assisted.selections['verifyFence'].bind(
      h.assisted.selections
    )
    let paused = false
    h.assisted.selections['verifyFence'] = async run => {
      const owner = h.assisted.state['runs'].get(run.repository.id)
      if (
        !paused &&
        owner?.lease === undefined &&
        owner?.selectionReaders.size === 0
      ) {
        paused = true
        fenceEntered.resolve()
        await finishFence.promise
        return
      }
      return verify(run)
    }
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const load = gitStore.loadStatus.bind(gitStore)
    const failure = new Error('Synthetic final-drain reader failure')
    gitStore.loadStatus = async (...args) => {
      if (paused) {
        readerEntered.resolve()
        await finishReader.promise
        throw failure
      }
      return load(...args)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    let completed = false
    const operation = h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .then(outcome => {
        completed = true
        return outcome
      })
    await fenceEntered.promise
    const reader = h.appStore._loadStatus(repository).catch(error => error)
    await readerEntered.promise
    finishFence.resolve()
    await new Promise(resolve => setImmediate(resolve))
    const premature = completed
    finishReader.resolve()
    const outcome = await operation
    await reader
    assert.strictEqual(premature, false)
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(
      state.kind === 'error' &&
        runErrors.assistedCommitErrorCauses(state.error).includes(failure)
    )
  })

  it('keeps fresh status rows discovered during refresh-only restoration', async t => {
    const { h, repository } = await harness.partialSelectionFixture(t)
    const restore = h.assisted.recovery['restore'].bind(h.assisted.recovery)
    h.assisted.recovery['restore'] = async () => {
      throw new Error('Initial refresh failure')
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return models.wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    h.assisted.recovery['restore'] = restore
    const getDiff = h.assisted.selections['getRecoveryDiff'].bind(
      h.assisted.selections
    )
    let injected = false
    h.assisted.selections['getRecoveryDiff'] = async (...args) => {
      const diff = await getDiff(...args)
      if (!injected) {
        injected = true
        await writeFile(join(repository.path, 'later'), 'new unselected row\n')
        await h.appStore._loadStatus(repository)
      }
      return diff
    }
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(file => file.path === 'later')
    )
    assert.strictEqual(await fixtures.count(repository), 1)
  })

  it('resumes deferred native History reads under retained refresh protection', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sha = await fixtures.rawGit(repository, ['rev-parse', 'HEAD'])
    h.dispatcher.changeCommitSelection(repository, [sha], true)
    h.assisted.readers['deferredHistory'].set(repository.id, repository)
    const protection = operations.protectAssistedCommitResources(
      repository.path
    )
    t.after(() => protection.release())
    const load = t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      h.appStore._loadChangedFilesForCurrentSelection.bind(h.appStore)
    )
    await h.assisted.readers['resumeHistory'](repository)
    assert.strictEqual(load.mock.callCount(), 1)
    assert.strictEqual(
      h.state(repository).commitSelection.changesetData.files.length,
      1
    )
    assert.strictEqual(
      h.assisted.readers['deferredHistory'].has(repository.id),
      false
    )
  })

  it('retains a deferred History request until native visualization succeeds', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.readers['deferredHistory'].set(repository.id, repository)
    t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      async () => {
        throw new Error('Synthetic History read failure')
      }
    )
    await h.assisted.readers['resumeHistory'](repository)
    assert.strictEqual(
      h.assisted.readers['deferredHistory'].has(repository.id),
      true
    )
  })

  it('does not recursively resume an already-admitted deferred History read', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sha = await fixtures.rawGit(repository, ['rev-parse', 'HEAD'])
    h.dispatcher.changeCommitSelection(repository, [sha], true)
    h.assisted.readers['deferredHistory'].set(repository.id, repository)
    const original = h.appStore._loadChangedFilesForCurrentSelection.bind(
      h.appStore
    )
    let loaded = 0
    h.appStore._loadChangedFilesForCurrentSelection = async repo => {
      loaded++
      if (loaded === 1) {
        await h.assisted.readers['resumeHistory'](repo)
      }
      return original(repo)
    }
    await h.assisted.readers['resumeHistory'](repository)
    assert.strictEqual(loaded, 1)
  })

  it('defers optional History without waiting behind an unfinished owner lacking a result', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = models.deferred<void>()
    const finish = models.deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return models.wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    h.assisted.readers['deferredHistory'].set(repository.id, repository)
    let resumed = false
    const history = h.assisted.readers['resumeHistory'](repository).then(() => {
      resumed = true
    })
    try {
      await new Promise(resolve => setImmediate(resolve))
      assert.strictEqual(resumed, true)
    } finally {
      h.cancel(repository)
      finish.resolve()
      await operation
      await history
    }
    assert.strictEqual(await fixtures.count(repository), 1)
  })

  it('keeps accepted outcome and statistics when deferred History error delivery throws', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const nativeFailure = new Error('Synthetic deferred History failure')
    const notificationFailure = new Error('Synthetic History error observer')
    t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      async () => {
        throw nativeFailure
      }
    )
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.assisted.readers['deferredHistory'].set(repository.id, repository)
      return models.wholeSelectionResponse(analysis)
    })
    const subscription = h.appStore.onDidError(() => {
      throw notificationFailure
    })
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('keeps settled manual diff failures outside old assisted refresh recovery', async t => {
    const source = await fixtures.seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Settled planner error')
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    h.assisted.readers['updateDiffCore'] = async () => {
      throw new Error('Ordinary manual diff failure')
    }
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository).catch(
      error => error
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === null)
    assert.strictEqual(h.state(repository).changesState.commitMode, 'manual')
  })

  it('keeps newly observed changes excluded through a sealed status continuation, without leaking policy to later reads', async t => {
    const source = await fixtures.seed(t, { selected: 'before\n' })
    await writeFile(join(source.path, 'selected'), 'selected\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sealed = models.deferred<void>()
    const finish = models.deferred<void>()
    const settle = h.assisted.readers['finish'].bind(h.assisted.readers)
    let paused = false
    h.assisted.readers['finish'] = async run => {
      await settle(run)
      if (!paused && run.finalized) {
        paused = true
        sealed.resolve()
        await finish.promise
      }
    }
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await sealed.promise
    const status = h.appStore._loadStatus(repository)
    await writeFile(join(repository.path, 'introduced'), 'UNSELECTED\n')
    finish.resolve()
    assert.strictEqual((await operation).kind, 'local-ready')
    await status
    const introduced = h
      .state(repository)
      .changesState.workingDirectory.files.find(
        file => file.path === 'introduced'
      )
    assert.ok(introduced !== undefined)
    assert.strictEqual(
      introduced.selection.getSelectionType(),
      diffModels.DiffSelectionType.None
    )
    assert.strictEqual(h.assisted.state['runs'].has(repository.id), false)
    await writeFile(join(repository.path, 'later'), 'ordinary later edit\n')
    await h.appStore._loadStatus(repository)
    const later = h
      .state(repository)
      .changesState.workingDirectory.files.find(file => file.path === 'later')
    assert.ok(later !== undefined)
    assert.strictEqual(
      later.selection.getSelectionType(),
      diffModels.DiffSelectionType.All
    )
    assert.strictEqual(await fixtures.count(repository), 2)
  })

  it('does not let a sealed status request clear a replacement run selected after its read begins', async t => {
    const { h, repository } = await harness.partialSelectionFixture(t)
    const sealed = models.deferred<void>()
    const finish = models.deferred<void>()
    const settle = h.assisted.readers['finish'].bind(h.assisted.readers)
    let paused = false
    h.assisted.readers['finish'] = async run => {
      await settle(run)
      if (!paused && run.finalized) {
        paused = true
        sealed.resolve()
        await finish.promise
      }
    }
    const first = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await sealed.promise
    const installing = models.deferred<void>()
    const install = models.deferred<void>()
    let held = false
    h.runtime.mock.mockImplementation(async () => {
      if (!held) {
        held = true
        installing.resolve()
        await install.promise
      }
      return true
    })
    const status = h.appStore._loadStatus(repository, true)
    finish.resolve()
    assert.strictEqual((await first).kind, 'local-ready')
    await installing.promise
    const file = h.state(repository).changesState.workingDirectory.files[0]
    const diff = await diffs.getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === diffModels.DiffType.Text)
    const hunk = diff.hunks[0]
    const index = hunk.lines.findIndex(line => line.isIncludeableLine())
    assert.ok(index >= 0)
    const selection = file.selection.withLineSelection(
      hunk.unifiedDiffStart + index,
      true
    )
    assert.strictEqual(
      selection.getSelectionType(),
      diffModels.DiffSelectionType.Partial
    )
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    const planning = models.deferred<void>()
    const plan = models.deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      planning.resolve()
      await plan.promise
      return models.wholeSelectionResponse(analysis)
    })
    const preparing = models.deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'preparing'
      ) {
        preparing.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const replacement = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const started = await Promise.race([
      preparing.promise.then(() => true),
      replacement.then(() => false),
    ])
    install.resolve()
    try {
      await status
      const phase = await Promise.race([
        planning.promise.then(() => 'planning'),
        replacement.then(outcome => outcome.kind),
      ])
      assert.strictEqual(started, true)
      assert.strictEqual(phase, 'planning')
      assert.strictEqual(
        h
          .state(repository)
          .changesState.workingDirectory.files[0].selection.getSelectionType(),
        diffModels.DiffSelectionType.Partial
      )
    } finally {
      plan.resolve()
      await replacement
    }
    assert.strictEqual(await fixtures.count(repository), 3)
  })
})
