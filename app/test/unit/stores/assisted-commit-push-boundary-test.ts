/* eslint-disable no-sync */
import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'
import * as Dugite from 'dugite'
import * as FileSystem from 'fs/promises'
import * as FileSystemSync from 'fs'
import type { PathLike } from 'fs'
import { basename, join, sep } from 'path'

let harness: typeof import('../../helpers/assisted-commit-run')
let fixtures: typeof import('../../helpers/assisted-commit')
let remotes: typeof import('../../helpers/assisted-commit-push')
let errors: typeof import('../../../src/lib/assisted-commit-run')
let repositories: typeof import('../../../src/models/repository')
let temporary: typeof import('../../helpers/temp')
let diffs: typeof import('../../../src/models/diff')
let selectionStates: typeof import('../../../src/lib/app-state')
let operations: typeof import('../../../src/lib/git/repository-operation')
let actualExec: typeof Dugite.exec
let capturePushes = false
const pushArguments: Array<ReadonlyArray<string>> = []
const allArguments: Array<ReadonlyArray<string>> = []
const allExecutions: Array<{
  readonly path: string
  readonly args: ReadonlyArray<string>
}> = []
let reportPushFailure: Error | undefined
let beforePush: ((path: string) => Promise<void>) | undefined
let afterPush: ((path: string) => Promise<void>) | undefined
let afterFollowUpFetch: (() => Promise<void>) | undefined
let afterHistoryRead: (() => Promise<void>) | undefined
let beforeImageRead: (() => Promise<void>) | undefined
let beforeAliasFenceCapture: (() => Promise<void>) | undefined
let aliasResolutionPath: string | undefined
let beforePublicationConfig: ((path: string) => Promise<void>) | undefined
let afterConfigurationRead: ((path: string) => Promise<void>) | undefined
let afterPinnedLookup: ((path: string) => Promise<void>) | undefined
let denySyncStat: ((path: PathLike) => boolean) | undefined
let syncFailure: Error | undefined
let statusFailure: Error | undefined
let historyFailure: Error | undefined
let configurationReadFailure:
  | { readonly path: string; readonly error: Error }
  | undefined
let directoryStatFailure: Error | undefined
let retainDirectoryStatFailure = false
let failedDirectory: string | undefined
let markerOpenFailure: Error | undefined
let stagingDirectoryCreations = 0
let afterStagingDirectoryCreation: ((path: string) => Promise<void>) | undefined
let afterMarkerUnlink: ((path: string) => Promise<void>) | undefined
let afterPublicationLockClose: ((path: string) => Promise<void>) | undefined
let afterModeStat: ((path: PathLike) => Promise<void>) | undefined
let afterFinalPublicationLockStat: ((path: string) => void) | undefined
const publicationLockReadFlags: number[] = []
let afterPublicationTrackingProbe: ((path: string) => Promise<void>) | undefined
let afterAlternateRoutingRead: ((path: string) => Promise<void>) | undefined
let denyUnlink: ((path: PathLike) => Promise<boolean>) | undefined
let denyRemove: ((path: PathLike) => Promise<boolean>) | undefined
let denyConfigKey: string | undefined
let duringConfigWrite:
  | ((args: ReadonlyArray<string>, path: string) => Promise<void>)
  | undefined

before(async () => {
  actualExec = Dugite.exec
  const unlink = FileSystem.unlink
  const remove = FileSystem.rm
  const stat = FileSystem.lstat
  const open = FileSystem.open
  const mkdtemp = FileSystem.mkdtemp
  const resolvePath = FileSystem.realpath
  const readFile = FileSystem.readFile
  const lstatSync = FileSystemSync.lstatSync
  const openSync = FileSystemSync.openSync
  const syncExports = {
    ...Object.fromEntries(
      Object.entries(FileSystemSync).filter(([name]) => name !== 'default')
    ),
    lstatSync: (...args: Parameters<typeof FileSystemSync.lstatSync>) => {
      if (denySyncStat?.(args[0])) {
        denySyncStat = undefined
        throw syncFailure ?? new Error('Synthetic metadata read failure')
      }
      const result = lstatSync(...args)
      if (
        typeof args[0] === 'string' &&
        basename(args[0]) === 'config.lock' &&
        afterFinalPublicationLockStat !== undefined
      ) {
        const mutate = afterFinalPublicationLockStat
        afterFinalPublicationLockStat = undefined
        mutate(args[0])
      }
      return result
    },
    openSync: (...args: Parameters<typeof FileSystemSync.openSync>) => {
      if (
        capturePushes &&
        typeof args[0] === 'string' &&
        basename(args[0]) === 'config.lock'
      ) {
        assert.strictEqual(typeof args[1], 'number')
        if (typeof args[1] === 'number') {
          publicationLockReadFlags.push(args[1])
        }
      }
      return openSync(...args)
    },
  }
  mock.module('fs', {
    defaultExport: { ...syncExports },
    namedExports: syncExports,
  })
  mock.module('dugite', {
    namedExports: {
      ...Dugite,
      exec: async (
        args: string[],
        path: string,
        options?: Dugite.IGitExecutionOptions
      ) => {
        if (
          historyFailure !== undefined &&
          pushArguments.length > 0 &&
          args.includes('log')
        ) {
          const failure = historyFailure
          historyFailure = undefined
          throw failure
        }
        if (
          statusFailure !== undefined &&
          pushArguments.length > 0 &&
          args.includes('status')
        ) {
          const failure = statusFailure
          statusFailure = undefined
          historyFailure = undefined
          throw failure
        }
        if (
          beforePublicationConfig !== undefined &&
          pushArguments.length > 0 &&
          args[0] === 'rev-parse' &&
          args.includes('--git-path') &&
          args.at(-1) === 'config'
        ) {
          await beforePublicationConfig(path)
        }
        if (
          duringConfigWrite !== undefined &&
          args[0] === 'config' &&
          (args.includes('--file') || args.includes('--local')) &&
          args.includes('--') &&
          (args.length > args.indexOf('--') + 2 ||
            (args.includes('--get-all') &&
              args[args.indexOf('--file') + 1] === '-'))
        ) {
          await duringConfigWrite(args, path)
        }
        if (capturePushes) {
          allArguments.push([...args])
          allExecutions.push({ path, args: [...args] })
        }
        if (
          denyConfigKey !== undefined &&
          args[0] === 'config' &&
          args.includes('--file') &&
          args[args.indexOf('--') + 1] === denyConfigKey
        ) {
          throw new Error('Synthetic publication metadata write failure')
        }
        if (capturePushes && args[0] === 'push') {
          pushArguments.push([...args])
          await beforePush?.(path)
          const result = await actualExec(args, path, options)
          await afterPush?.(path)
          if (reportPushFailure !== undefined) {
            const failure = reportPushFailure
            reportPushFailure = undefined
            throw failure
          }
          return result
        }
        const result = await actualExec(args, path, options)
        if (
          afterPublicationTrackingProbe !== undefined &&
          pushArguments.length > 0 &&
          args[0] === 'config' &&
          args.includes('--get-all') &&
          args.at(-1)?.endsWith('.merge')
        ) {
          const mutate = afterPublicationTrackingProbe
          afterPublicationTrackingProbe = undefined
          await mutate(path)
        }
        if (
          afterHistoryRead !== undefined &&
          pushArguments.length > 0 &&
          args.includes('log') &&
          args.includes('--numstat')
        ) {
          await afterHistoryRead()
        }
        if (
          afterFollowUpFetch !== undefined &&
          pushArguments.length > 0 &&
          args[0] === 'fetch' &&
          args.includes('--') &&
          args.at(-1) === 'origin'
        ) {
          await afterFollowUpFetch()
        }
        if (
          afterConfigurationRead !== undefined &&
          args[0] === 'config' &&
          args.includes('--list') &&
          args.includes('--show-origin')
        ) {
          await afterConfigurationRead(path)
        }
        if (
          afterPinnedLookup !== undefined &&
          args[0] === 'remote' &&
          args[1] === 'get-url' &&
          args.includes('--push') &&
          args.includes('--all') &&
          options?.env?.GIT_CONFIG_PARAMETERS?.includes('remote.origin.url=')
        ) {
          await afterPinnedLookup(path)
        }
        return result
      },
    },
  })
  mock.module('fs/promises', {
    namedExports: {
      ...FileSystem,
      realpath: async (...args: Parameters<typeof FileSystem.realpath>) => {
        const result = await resolvePath(...args)
        if (args[0] === aliasResolutionPath) {
          await beforeAliasFenceCapture?.()
        }
        return result
      },
      readFile: async (...args: Parameters<typeof FileSystem.readFile>) => {
        if (typeof args[0] === 'string' && basename(args[0]) === 'image.png') {
          await beforeImageRead?.()
        }
        return readFile(...args)
      },
      open: async (...args: Parameters<typeof FileSystem.open>) => {
        if (
          markerOpenFailure !== undefined &&
          typeof args[0] === 'string' &&
          basename(args[0]) === '.desktop-publication-owner'
        ) {
          const error = markerOpenFailure
          markerOpenFailure = undefined
          throw error
        }
        const handle = await open(...args)
        if (
          afterAlternateRoutingRead !== undefined &&
          typeof args[0] === 'string' &&
          basename(args[0]) === 'alternates'
        ) {
          const path = args[0]
          const close = handle.close.bind(handle)
          handle.close = async () => {
            await close()
            await afterAlternateRoutingRead?.(path)
          }
        }
        if (
          afterPublicationLockClose !== undefined &&
          typeof args[0] === 'string' &&
          basename(args[0]) === 'config.lock' &&
          pushArguments.length > 0
        ) {
          const path = args[0]
          const close = handle.close.bind(handle)
          handle.close = async () => {
            await close()
            await afterPublicationLockClose?.(path)
          }
        }
        return handle
      },
      mkdtemp: async (...args: Parameters<typeof FileSystem.mkdtemp>) => {
        const directory = await mkdtemp(...args)
        if (
          typeof directory === 'string' &&
          basename(directory).startsWith('desktop-publication-')
        ) {
          stagingDirectoryCreations++
          await afterStagingDirectoryCreation?.(directory)
        }
        return directory
      },
      unlink: async (path: PathLike) => {
        if (await denyUnlink?.(path)) {
          throw Object.assign(
            new Error('Synthetic owned HEAD lock unlink failure'),
            {
              code: 'EACCES',
              errno: -13,
              syscall: 'unlink',
            }
          )
        }
        await unlink(path)
        if (
          typeof path === 'string' &&
          basename(path) === '.desktop-publication-owner'
        ) {
          await afterMarkerUnlink?.(path)
        }
      },
      rm: async (...args: Parameters<typeof FileSystem.rm>) => {
        if (await denyRemove?.(args[0])) {
          throw Object.assign(
            new Error('Synthetic publication directory cleanup EIO'),
            { code: 'EIO' }
          )
        }
        return remove(...args)
      },
      lstat: async (...args: Parameters<typeof FileSystem.lstat>) => {
        if (args[0] === configurationReadFailure?.path) {
          throw configurationReadFailure.error
        }
        if (
          directoryStatFailure !== undefined &&
          typeof args[0] === 'string' &&
          basename(args[0]).startsWith('desktop-publication-')
        ) {
          failedDirectory = args[0]
          const failure = directoryStatFailure
          if (!retainDirectoryStatFailure) {
            directoryStatFailure = undefined
          }
          throw failure
        }
        const result = await stat(...args)
        if (afterModeStat !== undefined && args[1] === undefined) {
          await afterModeStat(args[0])
        }
        return result
      },
    },
  })
  ;[
    harness,
    fixtures,
    remotes,
    errors,
    repositories,
    temporary,
    diffs,
    selectionStates,
    operations,
  ] = await Promise.all([
    import('../../helpers/assisted-commit-run'),
    import('../../helpers/assisted-commit'),
    import('../../helpers/assisted-commit-push'),
    import('../../../src/lib/assisted-commit-run'),
    import('../../../src/models/repository'),
    import('../../helpers/temp'),
    import('../../../src/models/diff'),
    import('../../../src/lib/app-state'),
    import('../../../src/lib/git/repository-operation'),
  ])
})

function reset() {
  capturePushes = false
  pushArguments.length = 0
  allArguments.length = 0
  allExecutions.length = 0
  reportPushFailure = undefined
  beforePush = undefined
  afterPush = undefined
  afterFollowUpFetch = undefined
  afterHistoryRead = undefined
  beforeImageRead = undefined
  beforeAliasFenceCapture = undefined
  aliasResolutionPath = undefined
  beforePublicationConfig = undefined
  afterConfigurationRead = undefined
  afterPinnedLookup = undefined
  denySyncStat = undefined
  syncFailure = undefined
  statusFailure = undefined
  configurationReadFailure = undefined
  directoryStatFailure = undefined
  retainDirectoryStatFailure = false
  failedDirectory = undefined
  markerOpenFailure = undefined
  stagingDirectoryCreations = 0
  afterStagingDirectoryCreation = undefined
  afterMarkerUnlink = undefined
  afterPublicationLockClose = undefined
  afterModeStat = undefined
  afterFinalPublicationLockStat = undefined
  publicationLockReadFlags.length = 0
  afterPublicationTrackingProbe = undefined
  afterAlternateRoutingRead = undefined
  denyUnlink = undefined
  denyRemove = undefined
  denyConfigKey = undefined
  duringConfigWrite = undefined
}

describe('assisted native push boundary', () => {
  for (const empty of [false, true]) {
    it(`never publishes tracking into configuration covered by a foreign lease, empty ${empty}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      const foreign = await fixtures.seed(t, { foreign: 'Foreign checkout\n' })
      const sourceConfig = join(source.path, '.git', 'config')
      const foreignConfig = join(foreign.path, '.git', 'config')
      const configuration = await FileSystem.readFile(sourceConfig)
      await FileSystem.writeFile(foreignConfig, configuration)
      await FileSystem.unlink(sourceConfig)
      await FileSystem.symlink(foreignConfig, sourceConfig, 'file')
      if (!empty) {
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      const lease = await operations.acquireAssistedCommitGitLease(foreign.path)
      let releasedForTimeout = false
      const timer = setTimeout(() => {
        releasedForTimeout = true
        lease.release()
      }, 60000)
      capturePushes = true
      try {
        const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
          repository,
          h.request(repository)
        )
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          request
        )
        assert.deepStrictEqual(
          await FileSystem.readFile(foreignConfig),
          configuration
        )
        assert.ok(outcome.kind === 'push-error')
        assert.strictEqual(outcome.attempted, false)
        assert.strictEqual(
          await remote.read([
            'for-each-ref',
            '--format=%(objectname)',
            remote.remoteRef,
          ]),
          ''
        )
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(pushArguments.length, 0)
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        assert.strictEqual(releasedForTimeout, false)
      } finally {
        clearTimeout(timer)
        lease.release()
      }
    })
  }

  for (const input of ['global', 'system', 'include'] as const) {
    it(`certifies unresolved ${input} traversal without collapsing its native pathname`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const directory = await temporary.createTempDirectory(t)
      const target = `${directory}${sep}absent-route${sep}..${sep}missing-config`
      if (input === 'include') {
        await fixtures.rawGit(source, [
          'config',
          '--local',
          '--',
          'includeIf.onbranch:another-layer5-branch.path',
          target,
        ])
      }
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const variable =
        input === 'system' ? 'GIT_CONFIG_SYSTEM' : 'GIT_CONFIG_GLOBAL'
      const previous = process.env[variable]
      const previousNoSystem = process.env.GIT_CONFIG_NOSYSTEM
      if (input !== 'include') {
        process.env[variable] = target
        process.env.GIT_CONFIG_NOSYSTEM = '0'
      }
      const failure = Object.assign(
        new Error('Uncollapsed configuration path EIO'),
        {
          code: 'EIO',
          syscall: 'lstat',
        }
      )
      configurationReadFailure = { path: target, error: failure }
      try {
        if (input === 'include') {
          await assert.rejects(
            h.dispatcher.prepareCopilotAssistedCommitRequest(
              repository,
              h.request(repository)
            ),
            error => errors.assistedCommitErrorCauses(error).includes(failure)
          )
          assert.strictEqual(await fixtures.count(source), 1)
          assert.strictEqual(h.propose.mock.callCount(), 0)
        } else {
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
          assert.ok(outcome.kind === 'push-error')
          assert.strictEqual(outcome.attempted, false)
          assert.strictEqual(pushArguments.length, 0)
          assert.strictEqual(await fixtures.count(source), 2)
          assert.strictEqual(h.propose.mock.callCount(), 1)
        }
        assert.strictEqual(await remote.tip(), remote.originalTip)
      } finally {
        if (previous === undefined) {
          delete process.env[variable]
        } else {
          process.env[variable] = previous
        }
        if (previousNoSystem === undefined) {
          delete process.env.GIT_CONFIG_NOSYSTEM
        } else {
          process.env.GIT_CONFIG_NOSYSTEM = previousNoSystem
        }
      }
    })
  }

  it('rejects configuration staging through a nonregular replacement after tracking probes and releases its lock', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const config = join(source.path, '.git', 'config')
    const original = await FileSystem.readFile(config)
    afterPublicationTrackingProbe = async () => {
      await FileSystem.rename(config, `${config}-original`)
      await FileSystem.mkdir(config)
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    await assert.rejects(FileSystem.lstat(`${config}.lock`), { code: 'ENOENT' })
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, null)
    assert.strictEqual(state.settling, false)
    await FileSystem.rmdir(config)
    await FileSystem.rename(`${config}-original`, config)
    assert.deepStrictEqual(await FileSystem.readFile(config), original)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  it('reads final publication bytes through a nonblocking descriptor tied to the owned lock', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(outcome.refreshError, undefined)
    assert.ok(publicationLockReadFlags.length > 0)
    for (const flags of publicationLockReadFlags) {
      assert.strictEqual(
        flags & FileSystemSync.constants.O_NONBLOCK,
        FileSystemSync.constants.O_NONBLOCK
      )
    }
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
  })

  it('refuses a same-byte replacement between the final publication stat and descriptor open', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const config = join(source.path, '.git', 'config')
    const original = await FileSystem.readFile(config)
    let lockPath: string | undefined
    let replacement: Buffer | undefined
    afterFinalPublicationLockStat = path => {
      lockPath = path
      replacement = FileSystemSync.readFileSync(path)
      const mode = FileSystemSync.statSync(path).mode & 0o777
      FileSystemSync.renameSync(path, `${path}-original`)
      FileSystemSync.writeFileSync(path, replacement, { mode })
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.deepStrictEqual(await FileSystem.readFile(config), original)
    assert.ok(lockPath !== undefined && replacement !== undefined)
    assert.deepStrictEqual(await FileSystem.readFile(lockPath), replacement)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    await FileSystem.rename(lockPath, `${lockPath}-foreign`)
    await FileSystem.unlink(`${lockPath}-original`)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    const recovered = h.state(repository).changesState.assistedCommit
    assert.strictEqual(
      recovered.kind,
      'idle',
      recovered.kind === 'error'
        ? errors
            .assistedCommitErrorCauses(recovered.error)
            .map(cause =>
              cause instanceof Error ? cause.message : String(cause)
            )
            .join('\n')
        : recovered.kind
    )
    assert.deepStrictEqual(
      await FileSystem.readFile(`${lockPath}-foreign`),
      replacement
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const empty of [false, true]) {
    it(`preserves local ${
      empty ? 'Empty' : 'selected'
    } execution when optional push configuration graph changes during capture`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const directory = await temporary.createTempDirectory(t)
      const globalConfiguration = join(directory, 'global-config')
      const included = join(directory, 'empty-include')
      await FileSystem.writeFile(globalConfiguration, '')
      await FileSystem.writeFile(included, '')
      if (!empty) {
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Preserved manual draft',
        description: 'Preserved description',
        timestamp: 1,
      })
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      const previous = process.env.GIT_CONFIG_GLOBAL
      process.env.GIT_CONFIG_GLOBAL = globalConfiguration
      afterConfigurationRead = async () => {
        afterConfigurationRead = undefined
        await FileSystem.appendFile(
          globalConfiguration,
          `[include]\n\tpath = "${included.replace(/\\/g, '\\\\')}"\n`
        )
      }
      capturePushes = true
      try {
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'push-error')
        assert.strictEqual(outcome.attempted, false)
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(pushArguments.length, 0)
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        assert.strictEqual(h.commits.mock.callCount(), 1)
        assert.ok(
          errors
            .assistedCommitErrorCauses(outcome.error)
            .some(
              cause =>
                cause instanceof Error &&
                cause.message.includes('Configuration dependencies changed')
            )
        )
        if (empty) {
          assert.strictEqual(
            await fixtures.rawGit(source, [
              'show',
              '-s',
              '--format=%s',
              'HEAD',
            ]),
            'Empty commit'
          )
        }
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.summary,
          'Preserved manual draft'
        )
      } finally {
        if (previous === undefined) {
          delete process.env.GIT_CONFIG_GLOBAL
        } else {
          process.env.GIT_CONFIG_GLOBAL = previous
        }
      }
    })
  }

  it('stops branch-conditional follow-up fetch after a successful hook changes symbolic HEAD', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await fixtures.rawGit(source, ['branch', '--', 'other', remote.originalTip])
    const tree = await fixtures.rawGit(source, ['rev-parse', 'HEAD^{tree}'])
    const unrelated = await fixtures.rawGit(source, [
      'commit-tree',
      tree,
      '-m',
      'Independent unrelated root',
    ])
    await fixtures.rawGit(source, [
      'update-ref',
      'refs/heads/unrelated',
      unrelated,
    ])
    const target = join(await temporary.createTempDirectory(t), 'branch-config')
    await FileSystem.writeFile(
      target,
      `[remote "origin"]\n\tfetch = +${remote.branchRef}:refs/heads/unrelated\n`
    )
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'includeIf.onbranch:other.path',
      target,
    ])
    await fixtures.writeHook(
      source,
      'pre-push',
      'git symbolic-ref HEAD refs/heads/other'
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'rev-parse',
        '--verify',
        'refs/heads/unrelated',
      ]),
      unrelated
    )
    assert.ok(outcome.refreshError)
    assert.strictEqual(
      await fixtures.rawGit(source, ['symbolic-ref', 'HEAD']),
      'refs/heads/other'
    )
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'rev-parse',
        '--verify',
        remote.branchRef,
      ]),
      outcome.result.head.sha
    )
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'rev-list',
        '--count',
        remote.branchRef,
        '--',
      ]),
      '2'
    )
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'file'), 'utf8'),
      'after\n'
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('stops branch-conditional follow-up fetch after a successful hook introduces a symbolic branch alias', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await fixtures.rawGit(source, ['branch', '--', 'other', remote.originalTip])
    const tree = await fixtures.rawGit(source, ['rev-parse', 'HEAD^{tree}'])
    const unrelated = await fixtures.rawGit(source, [
      'commit-tree',
      tree,
      '-m',
      'Independent unrelated root',
    ])
    await fixtures.rawGit(source, [
      'update-ref',
      'refs/heads/unrelated',
      unrelated,
    ])
    const target = join(await temporary.createTempDirectory(t), 'branch-config')
    await FileSystem.writeFile(
      target,
      `[remote "origin"]\n\tfetch = +${remote.branchRef}:refs/heads/unrelated\n`
    )
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'includeIf.onbranch:other.path',
      target,
    ])
    const headPath = join(source.path, '.git', 'HEAD')
    const originalHead = await FileSystem.readFile(headPath)
    await fixtures.writeHook(
      source,
      'pre-push',
      `git symbolic-ref ${remote.branchRef} refs/heads/other`
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'rev-parse',
        '--verify',
        'refs/heads/unrelated',
      ]),
      unrelated
    )
    assert.ok(outcome.refreshError)
    assert.deepStrictEqual(await FileSystem.readFile(headPath), originalHead)
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'symbolic-ref',
        '--no-recurse',
        remote.branchRef,
      ]),
      'refs/heads/other'
    )
    assert.ok(outcome.result.head.sha !== null)
    assert.strictEqual(
      await fixtures.rawGit(source, [
        'rev-list',
        '--count',
        outcome.result.head.sha,
        '--',
      ]),
      '2'
    )
    assert.strictEqual(
      await FileSystem.readFile(join(source.path, 'file'), 'utf8'),
      'after\n'
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const empty of [false, true]) {
    it(`refuses same-root alternate-edge drift while freezing raw routes, empty ${empty}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const original = await fixtures.seed(t, {
        original: 'Original objects\n',
      })
      const foreign = await fixtures.seed(t, { foreign: 'Foreign objects\n' })
      await fixtures.rawGit(foreign, [
        'remote',
        'add',
        '--',
        'receiver',
        remote.path,
      ])
      await fixtures.rawGit(foreign, [
        'push',
        '--',
        'receiver',
        'HEAD:refs/heads/borrowed',
      ])
      const directory = await temporary.createTempDirectory(t)
      const oldAlias = join(directory, 'old-alternate')
      const newAlias = join(directory, 'new-alternate')
      for (const alias of [oldAlias, newAlias]) {
        await FileSystem.symlink(
          join(original.path, '.git', 'objects'),
          alias,
          'junction'
        )
      }
      const info = join(source.path, '.git', 'objects', 'info')
      await FileSystem.mkdir(info, { recursive: true })
      const routingFile = join(info, 'alternates')
      await FileSystem.writeFile(routingFile, `${oldAlias}\n`)
      if (!empty) {
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Preserved manual draft',
        description: 'Preserved manual details',
        timestamp: Date.now(),
      })
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      const lease = await operations.acquireAssistedCommitGitLease(foreign.path)
      let releasedForTimeout = false
      const timer = setTimeout(() => {
        releasedForTimeout = true
        lease.release()
      }, 60000)
      let changed = false
      afterAlternateRoutingRead = async path => {
        if (
          (await FileSystem.realpath(path)) !==
          (await FileSystem.realpath(routingFile))
        ) {
          return
        }
        afterAlternateRoutingRead = undefined
        await FileSystem.writeFile(routingFile, `${newAlias}\n`)
        changed = true
      }
      afterPush = async () => {
        afterPush = undefined
        await FileSystem.unlink(newAlias)
        await FileSystem.symlink(
          join(foreign.path, '.git', 'objects'),
          newAlias,
          'junction'
        )
      }
      capturePushes = true
      try {
        const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
          repository,
          h.request(repository)
        )
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          request
        )
        assert.strictEqual(changed, true)
        assert.strictEqual(
          await fixtures.rawGit(source, [
            'for-each-ref',
            '--format=%(objectname)',
            'refs/remotes/origin/borrowed',
          ]),
          ''
        )
        assert.ok(outcome.kind === 'push-error')
        assert.strictEqual(outcome.attempted, false)
        assert.strictEqual(releasedForTimeout, false)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(pushArguments.length, 0)
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        if (empty) {
          assert.strictEqual(
            await fixtures.rawGit(source, [
              'show',
              '-s',
              '--format=%s',
              'HEAD',
            ]),
            'Empty commit'
          )
        }
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.summary,
          'Preserved manual draft'
        )
      } finally {
        clearTimeout(timer)
        lease.release()
      }
    })
  }

  for (const route of ['environment', 'file', 'transitive'] as const) {
    it(`refuses a retargeted raw ${route} alternate alias after acknowledgement`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const original = await fixtures.seed(t, {
        original: 'Original objects\n',
      })
      const intermediate = await fixtures.seed(t, {
        intermediate: 'Intermediate objects\n',
      })
      const foreign = await fixtures.seed(t, { foreign: 'Foreign objects\n' })
      await fixtures.rawGit(foreign, [
        'remote',
        'add',
        '--',
        'receiver',
        remote.path,
      ])
      await fixtures.rawGit(foreign, [
        'push',
        '--',
        'receiver',
        'HEAD:refs/heads/borrowed',
      ])
      const alias = join(await temporary.createTempDirectory(t), 'alternate')
      await FileSystem.symlink(
        join(original.path, '.git', 'objects'),
        alias,
        'junction'
      )
      const lease = await operations.acquireAssistedCommitGitLease(foreign.path)
      const previous = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
      let releasedForTimeout = false
      const timer = setTimeout(() => {
        releasedForTimeout = true
        lease.release()
      }, 60000)
      try {
        if (route === 'environment') {
          process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = alias
        } else {
          const info = join(source.path, '.git', 'objects', 'info')
          await FileSystem.mkdir(info, { recursive: true })
          if (route === 'transitive') {
            const intermediateInfo = join(
              intermediate.path,
              '.git',
              'objects',
              'info'
            )
            await FileSystem.mkdir(intermediateInfo, { recursive: true })
            await FileSystem.writeFile(
              join(intermediateInfo, 'alternates'),
              `${alias}\n`
            )
          }
          await FileSystem.writeFile(
            join(info, 'alternates'),
            `${
              route === 'transitive'
                ? join(intermediate.path, '.git', 'objects')
                : alias
            }\n`
          )
        }
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
        const h = await harness.createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        afterPush = async () => {
          afterPush = undefined
          await FileSystem.unlink(alias)
          await FileSystem.symlink(
            join(foreign.path, '.git', 'objects'),
            alias,
            'junction'
          )
        }
        capturePushes = true
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'pushed')
        assert.strictEqual(
          await fixtures.rawGit(source, [
            'for-each-ref',
            '--format=%(objectname)',
            'refs/remotes/origin/borrowed',
          ]),
          ''
        )
        assert.strictEqual(releasedForTimeout, false)
        assert.ok(outcome.refreshError)
        assert.strictEqual(await remote.tip(), outcome.result.head.sha)
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(pushArguments.length, 1)
      } finally {
        clearTimeout(timer)
        lease.release()
        if (previous === undefined) {
          delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
        } else {
          process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = previous
        }
      }
    })
  }

  it('refuses an alternate pack route changed toward an unadmitted leased store after acknowledgement', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const originalAlternate = await fixtures.seed(t, {
      original: 'Original alternate\n',
    })
    const foreign = await fixtures.seed(t, {
      foreign: 'Packed foreign object\n',
    })
    await fixtures.rawGit(foreign, ['repack', '-a', '-d'])
    await fixtures.rawGit(foreign, [
      'remote',
      'add',
      '--',
      'receiver',
      remote.path,
    ])
    await fixtures.rawGit(foreign, [
      'push',
      '--',
      'receiver',
      'HEAD:refs/heads/borrowed',
    ])
    const info = join(source.path, '.git', 'objects', 'info')
    const pack = join(originalAlternate.path, '.git', 'objects', 'pack')
    await FileSystem.mkdir(info, { recursive: true })
    await FileSystem.mkdir(pack, { recursive: true })
    await FileSystem.writeFile(
      join(info, 'alternates'),
      `${join(originalAlternate.path, '.git', 'objects')}\n`
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let lease:
      | Awaited<ReturnType<typeof operations.acquireAssistedCommitGitLease>>
      | undefined
    let timer: NodeJS.Timeout | undefined
    let releasedForTimeout = false
    afterPush = async () => {
      afterPush = undefined
      lease = await operations.acquireAssistedCommitGitLease(foreign.path)
      await FileSystem.rename(pack, `${pack}-original`)
      await FileSystem.symlink(
        join(foreign.path, '.git', 'objects', 'pack'),
        pack,
        'junction'
      )
      timer = setTimeout(() => {
        releasedForTimeout = true
        lease?.release()
      }, 5000)
    }
    capturePushes = true
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(releasedForTimeout, false)
      assert.strictEqual(
        await fixtures.rawGit(source, [
          'for-each-ref',
          '--format=%(objectname)',
          'refs/remotes/origin/borrowed',
        ]),
        ''
      )
      assert.ok(outcome.refreshError)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
    } finally {
      clearTimeout(timer)
      lease?.release()
    }
  })

  for (const empty of [false, true]) {
    it(`uses a native external object root with no unused default directory for ${
      empty ? 'Empty' : 'selected'
    } commits`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const defaultObjects = join(source.path, '.git', 'objects')
      const objects = join(
        await temporary.createTempDirectory(t),
        'external-objects'
      )
      await FileSystem.rename(defaultObjects, objects)
      const previous = process.env.GIT_OBJECT_DIRECTORY
      process.env.GIT_OBJECT_DIRECTORY = objects
      try {
        if (!empty) {
          await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
        }
        const h = await harness.createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        h.dispatcher.updateCommitOptions(repository, {
          allowEmptyCommit: empty,
        })
        capturePushes = true
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'pushed')
        assert.strictEqual(outcome.refreshError, undefined)
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(await remote.tip(), outcome.result.head.sha)
        assert.ok(outcome.result.head.sha !== null)
        assert.strictEqual(
          await fixtures.rawGit(
            source,
            [
              '--git-dir',
              remote.path,
              'cat-file',
              '-t',
              outcome.result.head.sha,
            ],
            { env: { GIT_OBJECT_DIRECTORY: undefined } }
          ),
          'commit'
        )
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        assert.strictEqual(pushArguments.length, 1)
        await assert.rejects(FileSystem.lstat(defaultObjects), {
          code: 'ENOENT',
        })
        if (empty) {
          assert.strictEqual(
            await fixtures.rawGit(source, [
              'show',
              '-s',
              '--format=%s',
              'HEAD',
            ]),
            'Empty commit'
          )
        }
      } finally {
        if (previous === undefined) {
          delete process.env.GIT_OBJECT_DIRECTORY
        } else {
          process.env.GIT_OBJECT_DIRECTORY = previous
        }
      }
    })
  }

  it('never prunes through a substituted packed-refs target after acknowledged push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const foreignPath = join(
      await temporary.createTempDirectory(t),
      'foreign-packed'
    )
    await fixtures.rawGit(source, ['clone', '--', source.path, foreignPath])
    const foreign = new repositories.Repository(foreignPath, -1, null, false)
    await fixtures.rawGit(foreign, [
      'update-ref',
      'refs/remotes/origin/obsolete',
      remote.originalTip,
    ])
    await fixtures.rawGit(foreign, ['pack-refs', '--all', '--prune'])
    await fixtures.rawGit(source, ['pack-refs', '--all', '--prune'])
    const target = join(foreign.path, '.git', 'packed-refs')
    const original = await FileSystem.readFile(target)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    afterPush = async () => {
      afterPush = undefined
      const route = join(source.path, '.git', 'packed-refs')
      await FileSystem.rename(route, `${route}-original`)
      await FileSystem.symlink(target, route, 'file')
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.deepStrictEqual(await FileSystem.readFile(target), original)
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.pushed, true)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const route of ['primary', 'transitive'] as const) {
    it(`refuses a changed ${route} alternate graph before reading an unadmitted leased object store`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const originalAlternate = await fixtures.seed(t, {
        original: 'Original alternate\n',
      })
      const foreign = await fixtures.seed(t, { foreign: 'Unadmitted object\n' })
      await fixtures.rawGit(foreign, [
        'remote',
        'add',
        '--',
        'receiver',
        remote.path,
      ])
      await fixtures.rawGit(foreign, [
        'push',
        '--',
        'receiver',
        'HEAD:refs/heads/borrowed',
      ])
      const primaryInfo = join(source.path, '.git', 'objects', 'info')
      const alternateInfo = join(
        originalAlternate.path,
        '.git',
        'objects',
        'info'
      )
      await FileSystem.mkdir(primaryInfo, { recursive: true })
      await FileSystem.mkdir(alternateInfo, { recursive: true })
      if (route === 'transitive') {
        await FileSystem.writeFile(
          join(primaryInfo, 'alternates'),
          `${join(originalAlternate.path, '.git', 'objects')}\n`
        )
      }
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      let lease:
        | Awaited<ReturnType<typeof operations.acquireAssistedCommitGitLease>>
        | undefined
      let timer: NodeJS.Timeout | undefined
      let releasedForTimeout = false
      afterPush = async () => {
        afterPush = undefined
        lease = await operations.acquireAssistedCommitGitLease(foreign.path)
        await FileSystem.writeFile(
          join(route === 'primary' ? primaryInfo : alternateInfo, 'alternates'),
          `${join(foreign.path, '.git', 'objects')}\n`
        )
        timer = setTimeout(() => {
          releasedForTimeout = true
          lease?.release()
        }, 5000)
      }
      capturePushes = true
      try {
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'pushed')
        assert.strictEqual(releasedForTimeout, false)
        assert.strictEqual(
          await fixtures.rawGit(source, [
            'for-each-ref',
            '--format=%(objectname)',
            'refs/remotes/origin/borrowed',
          ]),
          ''
        )
        assert.ok(outcome.refreshError)
        const state = h.state(repository).changesState.assistedCommit
        assert.ok(state.kind === 'error')
        assert.strictEqual(state.pushed, true)
        assert.strictEqual(await remote.tip(), outcome.result.head.sha)
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(pushArguments.length, 1)
        assert.strictEqual(h.propose.mock.callCount(), 1)
      } finally {
        clearTimeout(timer)
        lease?.release()
      }
      assert.strictEqual(await fixtures.count(foreign), 1)
    })
  }

  for (const routing of [
    'loose',
    'packed',
    'replace-base',
    'namespace',
  ] as const) {
    it(`refuses introduced ${routing} replacement history after acknowledgement`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const gitStore = h.appStore['gitStoreCache'].get(repository)
      let installedHistory: ReadonlyArray<string> | null | undefined
      const previousBase = process.env.GIT_REPLACE_REF_BASE
      const previousNamespace = process.env.GIT_NAMESPACE
      let changed = false
      afterPush = async () => {
        afterPush = undefined
        const sha = await fixtures.tip(source)
        const tree = await fixtures.rawGit(source, [
          'rev-parse',
          `${sha}^{tree}`,
        ])
        const replacement = await fixtures.rawGit(source, [
          'commit-tree',
          tree,
          '-m',
          'External parentless replacement',
        ])
        if (routing === 'replace-base') {
          process.env.GIT_REPLACE_REF_BASE = 'refs/external-replacements/'
        }
        if (routing === 'namespace') {
          process.env.GIT_NAMESPACE = 'external'
        }
        const prefix = process.env.GIT_REPLACE_REF_BASE ?? 'refs/replace/'
        await fixtures.rawGit(source, [
          'update-ref',
          `${prefix}${sha}`,
          replacement,
        ])
        if (routing === 'packed') {
          await fixtures.rawGit(source, ['pack-refs', '--all'])
        }
        changed = true
      }
      afterFollowUpFetch = async () => {
        afterFollowUpFetch = undefined
        installedHistory = await gitStore.loadCommitBatch('HEAD', 0)
      }
      capturePushes = true
      try {
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'pushed')
        assert.strictEqual(changed, true)
        assert.ok(
          installedHistory === undefined ||
            installedHistory?.includes(remote.originalTip),
          `Replacement history installed ${JSON.stringify(installedHistory)}`
        )
        assert.ok(outcome.refreshError)
        const state = h.state(repository).changesState.assistedCommit
        assert.ok(state.kind === 'error')
        assert.strictEqual(state.pushed, true)
        assert.strictEqual(state.retry, null)
        assert.strictEqual(await remote.tip(), outcome.result.head.sha)
        assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
        assert.strictEqual(
          await fixtures.rawGit(source, [
            '--no-replace-objects',
            'rev-list',
            '--count',
            'HEAD',
            '--',
          ]),
          '2'
        )
        assert.strictEqual(pushArguments.length, 1)
        assert.strictEqual(h.propose.mock.callCount(), 1)
        assert.strictEqual(
          await FileSystem.readFile(join(source.path, 'file'), 'utf8'),
          'after\n'
        )
      } finally {
        if (previousBase === undefined) {
          delete process.env.GIT_REPLACE_REF_BASE
        } else {
          process.env.GIT_REPLACE_REF_BASE = previousBase
        }
        if (previousNamespace === undefined) {
          delete process.env.GIT_NAMESPACE
        } else {
          process.env.GIT_NAMESPACE = previousNamespace
        }
      }
    })
  }

  for (const metadata of ['shallow', 'grafts'] as const) {
    for (const route of ['native', 'environment'] as const) {
      for (const replacement of ['symlink', 'hardlink', 'regular'] as const) {
        it(`certifies ${route} ${metadata} metadata before post-ACK History, replacement ${replacement}`, async t => {
          reset()
          t.after(reset)
          const source = await fixtures.seed(t, { file: 'before\n' })
          const remote = await remotes.addBareRemote(t, source)
          const foreign = await fixtures.seed(t, {
            foreign: 'Foreign history\n',
          })
          await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
          const h = await harness.createAssistedCommitRunHarness(t)
          const repository = await h.register(source)
          h.dispatcher.setPushAfterAssistedCommit(repository, true)
          const gitStore = h.appStore['gitStoreCache'].get(repository)
          let installedHistory: ReadonlyArray<string> | null | undefined
          const metadataPath =
            route === 'native'
              ? await fixtures.rawGit(source, [
                  'rev-parse',
                  '--path-format=absolute',
                  '--git-path',
                  metadata === 'grafts' ? 'info/grafts' : metadata,
                ])
              : join(source.path, '.git', `custom-${metadata}`)
          const foreignMetadata = join(foreign.path, '.git', metadata)
          const environmentName =
            metadata === 'shallow' ? 'GIT_SHALLOW_FILE' : 'GIT_GRAFT_FILE'
          const previous = process.env[environmentName]
          if (route === 'environment') {
            if (metadata === 'shallow') {
              await FileSystem.writeFile(metadataPath, '')
            }
            process.env[environmentName] = metadataPath
          }
          let lease:
            | Awaited<
                ReturnType<typeof operations.acquireAssistedCommitGitLease>
              >
            | undefined
          let timer: NodeJS.Timeout | undefined
          let releasedForTimeout = false
          let changed = false
          afterPush = async () => {
            afterPush = undefined
            const sha = await fixtures.tip(source)
            await FileSystem.writeFile(foreignMetadata, `${sha}\n`)
            lease = await operations.acquireAssistedCommitGitLease(foreign.path)
            timer = setTimeout(() => {
              releasedForTimeout = true
              lease?.release()
            }, 60000)
            if (route === 'environment' && metadata === 'shallow') {
              await FileSystem.unlink(metadataPath)
            }
            if (replacement === 'regular') {
              const staged = `${metadataPath}-replacement`
              await FileSystem.writeFile(
                staged,
                metadata === 'shallow' ? '' : `${sha}\n`
              )
              await FileSystem.rename(staged, metadataPath)
            } else if (replacement === 'hardlink') {
              await FileSystem.link(foreignMetadata, metadataPath)
            } else {
              await FileSystem.symlink(foreignMetadata, metadataPath, 'file')
            }
            changed = true
          }
          afterFollowUpFetch = async () => {
            afterFollowUpFetch = undefined
            installedHistory = await gitStore.loadCommitBatch('HEAD', 0)
          }
          capturePushes = true
          try {
            const outcome = await h.dispatcher.createCopilotAssistedCommits(
              repository,
              h.request(repository)
            )
            assert.ok(outcome.kind === 'pushed')
            assert.strictEqual(changed, true)
            assert.ok(
              installedHistory === undefined ||
                installedHistory?.includes(remote.originalTip),
              `Foreign ${metadata} metadata installed History ${JSON.stringify(
                installedHistory
              )}`
            )
            const installed = gitStore.commitLookup.get(
              outcome.result.head.sha ?? ''
            )
            assert.ok(
              installed === undefined ||
                installed.parentSHAs.includes(remote.originalTip),
              `Foreign ${metadata} metadata installed parents ${JSON.stringify(
                installed?.parentSHAs
              )}`
            )
            if (replacement === 'regular' && metadata === 'shallow') {
              assert.strictEqual(outcome.refreshError, undefined)
            } else {
              assert.ok(outcome.refreshError)
              const state = h.state(repository).changesState.assistedCommit
              assert.ok(state.kind === 'error')
              assert.strictEqual(state.pushed, true)
              assert.strictEqual(state.retry, null)
            }
            assert.strictEqual(releasedForTimeout, false)
            assert.strictEqual(await remote.tip(), outcome.result.head.sha)
            assert.strictEqual(
              await fixtures.tip(source),
              outcome.result.head.sha
            )
            assert.strictEqual(
              await fixtures
                .rawGit(source, [
                  'cat-file',
                  '-p',
                  outcome.result.head.sha ?? '',
                ])
                .then(value =>
                  value.includes(`parent ${remote.originalTip}\n`)
                ),
              true
            )
            assert.strictEqual(pushArguments.length, 1)
            assert.strictEqual(h.propose.mock.callCount(), 1)
            assert.strictEqual(
              await FileSystem.readFile(join(source.path, 'file'), 'utf8'),
              'after\n'
            )
          } finally {
            clearTimeout(timer)
            lease?.release()
            if (previous === undefined) {
              delete process.env[environmentName]
            } else {
              process.env[environmentName] = previous
            }
          }
        })
      }
    }
  }

  for (const failureCode of ['ENOTDIR', 'ELOOP'] as const) {
    for (const empty of [false, true]) {
      it(`keeps valid local ${
        empty ? 'Empty' : 'selected'
      } commits when an inactive configuration path has ${failureCode}`, async t => {
        reset()
        t.after(reset)
        const source = await fixtures.seed(t, { file: 'before\n' })
        const remote = await remotes.addBareRemote(t, source)
        const parent = join(
          await temporary.createTempDirectory(t),
          'inactive-layout'
        )
        const target = join(parent, 'ignored.conf')
        if (failureCode === 'ENOTDIR') {
          await FileSystem.writeFile(parent, 'Regular-file ancestor\n')
        } else {
          await FileSystem.mkdir(parent)
        }
        await fixtures.rawGit(source, [
          'config',
          '--local',
          '--',
          'includeIf.onbranch:another-layer5-branch.path',
          target,
        ])
        if (!empty) {
          await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
        }
        const h = await harness.createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        await h.dispatcher.setCommitMessage(repository, {
          summary: 'Preserved manual draft',
          description: 'Preserved manual description',
          timestamp: 1,
        })
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        h.dispatcher.updateCommitOptions(repository, {
          allowEmptyCommit: empty,
        })
        const failure = Object.assign(
          new Error('Synthetic inactive configuration symlink loop'),
          { code: 'ELOOP', syscall: 'lstat' }
        )
        if (failureCode === 'ELOOP') {
          configurationReadFailure = { path: target, error: failure }
        }
        capturePushes = true
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(
          outcome.kind === 'push-error',
          outcome.kind === 'error'
            ? errors
                .assistedCommitErrorCauses(outcome.error)
                .map(cause =>
                  cause instanceof Error ? cause.stack : String(cause)
                )
                .join('\n')
            : outcome.kind
        )
        assert.strictEqual(outcome.attempted, false)
        assert.ok(
          errors
            .assistedCommitErrorCauses(outcome.error)
            .some(
              cause =>
                cause instanceof Error &&
                'code' in cause &&
                cause.code === failureCode
            )
        )
        assert.strictEqual(await fixtures.count(source), 2)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(pushArguments.length, 0)
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        if (empty) {
          assert.strictEqual(
            await fixtures.rawGit(source, [
              'show',
              '-s',
              '--format=%s',
              'HEAD',
            ]),
            'Empty commit'
          )
        }
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.summary,
          'Preserved manual draft'
        )
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.description,
          'Preserved manual description'
        )
      })
    }
  }

  for (const cleanupFault of [false, true]) {
    it(`expires a non-directory configuration ancestor only after owned cleanup, fault ${cleanupFault}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      const parent = join(
        await temporary.createTempDirectory(t),
        'inactive-layout'
      )
      const target = join(parent, 'ignored.conf')
      await FileSystem.mkdir(parent)
      await FileSystem.writeFile(target, '')
      await fixtures.rawGit(source, [
        'config',
        '--local',
        '--',
        'includeIf.onbranch:another-layer5-branch.path',
        target,
      ])
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const lock = join(source.path, '.git', 'config.lock')
      duringConfigWrite = async () => {
        duringConfigWrite = undefined
        await FileSystem.rename(parent, `${parent}-original`)
        await FileSystem.writeFile(parent, 'Replacement regular ancestor\n')
      }
      if (cleanupFault) {
        denyUnlink = await fixtures.createPathMatcher(lock)
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      let state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, cleanupFault ? 'refresh' : null)
      if (cleanupFault) {
        assert.strictEqual((await FileSystem.lstat(lock)).isFile(), true)
        denyUnlink = undefined
        await h.dispatcher.retryCopilotAssistedCommitRecovery(
          repository,
          state.runId
        )
        state = h.state(repository).changesState.assistedCommit
        assert.ok(state.kind === 'error')
        assert.strictEqual(state.retry, null)
      }
      await assert.rejects(FileSystem.lstat(lock), { code: 'ENOENT' })
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('fences an explicit GIT_DIR alias independently of linked commondir and configuration paths', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const foreign = await fixtures.seed(t, { unrelated: 'Foreign checkout\n' })
    await fixtures.rawGit(foreign, [
      'remote',
      'add',
      '--',
      'origin',
      remote.path,
    ])
    const linked = join(await temporary.createTempDirectory(t), 'linked')
    await fixtures.rawGit(source, [
      'worktree',
      'add',
      '-b',
      'linked-source',
      '--',
      linked,
      'HEAD',
    ])
    const linkedRepository = new repositories.Repository(
      linked,
      source.id,
      null,
      false
    )
    const directory = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--absolute-git-dir',
    ])
    const common = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
    await FileSystem.writeFile(join(directory, 'commondir'), `${common}\n`)
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'branch.linked-source.remote',
      'origin',
    ])
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'branch.linked-source.merge',
      'refs/heads/linked-source',
    ])
    await remote.read([
      'update-ref',
      'refs/heads/linked-source',
      remote.originalTip,
    ])
    const route = join(await temporary.createTempDirectory(t), 'git-dir')
    await FileSystem.symlink(directory, route, 'junction')
    const foreignFetchHead = await fixtures.optionalBytes(
      join(foreign.path, '.git', 'FETCH_HEAD')
    )
    const previous = process.env.GIT_DIR
    process.env.GIT_DIR = route
    try {
      await FileSystem.writeFile(join(linked, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(linkedRepository)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      afterPush = async () => {
        afterPush = undefined
        await FileSystem.unlink(route)
        await FileSystem.symlink(join(foreign.path, '.git'), route, 'junction')
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.deepStrictEqual(
        await fixtures.optionalBytes(join(foreign.path, '.git', 'FETCH_HEAD')),
        foreignFetchHead
      )
      assert.ok(outcome.refreshError)
      assert.strictEqual(
        await remote.read([
          'rev-parse',
          '--verify',
          'refs/heads/linked-source',
        ]),
        outcome.result.head.sha
      )
      assert.strictEqual(pushArguments.length, 1)
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_DIR
      } else {
        process.env.GIT_DIR = previous
      }
    }
    assert.strictEqual(await fixtures.count(linkedRepository), 2)
    assert.strictEqual(await fixtures.count(foreign), 1)
  })

  it('cleans original publication locks before expiring an execution alias held by a foreign lease', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const foreign = await fixtures.seed(t, { unrelated: 'Foreign checkout\n' })
    const alias = join(
      await temporary.createTempDirectory(t),
      'execution-alias'
    )
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(
      new repositories.Repository(alias, source.id, null, false)
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const branch = remote.branchRef.slice('refs/heads/'.length)
    const lock = join(source.path, '.git', 'config.lock')
    denyConfigKey = `branch.${branch}.merge`
    denyUnlink = await fixtures.createPathMatcher(lock)
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].get(repository.id)?.lease,
      undefined
    )
    assert.strictEqual((await FileSystem.lstat(lock)).isFile(), true)
    denyConfigKey = undefined
    denyUnlink = undefined
    await FileSystem.unlink(alias)
    await FileSystem.symlink(foreign.path, alias, 'junction')
    const lease = await operations.acquireAssistedCommitGitLease(foreign.path)
    let timer: NodeJS.Timeout | undefined
    const retry = h.dispatcher.retryCopilotAssistedCommitRecovery(
      new repositories.Repository(source.path, repository.id, null, false),
      state.runId
    )
    try {
      const completed = await Promise.race([
        retry.then(() => true),
        new Promise<boolean>(resolve => {
          timer = setTimeout(() => resolve(false), 1000)
        }),
      ])
      assert.strictEqual(completed, true)
      await assert.rejects(FileSystem.lstat(lock), { code: 'ENOENT' })
      const settled = h.state(repository).changesState.assistedCommit
      assert.ok(settled.kind === 'error')
      assert.strictEqual(settled.retry, null)
      assert.strictEqual(settled.settling, false)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(pushArguments.length, 1)
      assert.strictEqual(await fixtures.count(source), 2)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      clearTimeout(timer)
      lease.release()
      await retry
    }
    assert.strictEqual(await fixtures.count(foreign), 1)
  })

  it('never recursively fetches into an unadmitted submodule repository after acknowledged push', async t => {
    reset()
    t.after(reset)
    const child = await fixtures.seed(t, { child: 'before\n' })
    const childRemote = await remotes.addBareRemote(t, child)
    await childRemote.read(['symbolic-ref', 'HEAD', childRemote.branchRef])
    const source = await fixtures.seed(t, { file: 'before\n' })
    await fixtures.rawGit(source, [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      '--',
      childRemote.path,
      'module',
    ])
    await fixtures.rawGit(source, ['commit', '-m', 'Add clean submodule'])
    const remote = await remotes.addBareRemote(t, source)
    const foreignPath = join(
      await temporary.createTempDirectory(t),
      'foreign-child'
    )
    await fixtures.rawGit(child, ['clone', '--', childRemote.path, foreignPath])
    const foreign = new repositories.Repository(foreignPath, -1, null, false)
    await fixtures.rawGit(foreign, [
      'config',
      '--local',
      '--',
      'protocol.file.allow',
      'always',
    ])
    const foreignRef = `refs/remotes/origin/${childRemote.branchRef.slice(
      'refs/heads/'.length
    )}`
    const foreignTip = await fixtures.rawGit(foreign, [
      'rev-parse',
      '--verify',
      foreignRef,
    ])
    const foreignFetchHead = await fixtures.optionalBytes(
      join(foreign.path, '.git', 'FETCH_HEAD')
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let receiverTip: string | undefined
    afterPush = async () => {
      afterPush = undefined
      capturePushes = false
      try {
        await FileSystem.writeFile(
          join(child.path, 'child'),
          'Receiver child\n'
        )
        await fixtures.rawGit(child, ['add', '--', 'child'])
        await fixtures.rawGit(child, ['commit', '-m', 'Receiver child update'])
        await fixtures.rawGit(child, [
          'push',
          '--',
          'origin',
          childRemote.branchRef,
        ])
        const childTip = await fixtures.tip(child)
        const parentTip = await remote.tip()
        const entries = await remote.read(['ls-tree', `${parentTip}^{tree}`])
        const updated = entries.replace(
          /160000 commit [0-9a-f]+\tmodule(?=\n|$)/,
          `160000 commit ${childTip}\tmodule`
        )
        assert.notStrictEqual(updated, entries)
        const tree = await fixtures.rawGit(
          source,
          ['--git-dir', remote.path, 'mktree'],
          { stdin: `${updated}\n` }
        )
        receiverTip = await remote.read([
          'commit-tree',
          tree,
          '-p',
          parentTip,
          '-m',
          'Receiver submodule update',
        ])
        await remote.read([
          'update-ref',
          remote.branchRef,
          receiverTip,
          parentTip,
        ])
        const modulePath = join(source.path, '.git', 'modules', 'module')
        await FileSystem.rename(modulePath, `${modulePath}-original`)
        await FileSystem.symlink(
          join(foreign.path, '.git'),
          modulePath,
          'junction'
        )
      } finally {
        capturePushes = true
      }
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(
      await fixtures.rawGit(foreign, ['rev-parse', '--verify', foreignRef]),
      foreignTip
    )
    assert.deepStrictEqual(
      await fixtures.optionalBytes(join(foreign.path, '.git', 'FETCH_HEAD')),
      foreignFetchHead
    )
    assert.strictEqual(await remote.tip(), receiverTip)
    assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 3)
    assert.strictEqual(await fixtures.count(foreign), 1)
    assert.strictEqual(pushArguments.length, 1)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  for (const variable of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'] as const) {
    it(`preserves literal newline-bearing ${variable} paths during certification`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const target = join(
        await temporary.createTempDirectory(t),
        'missing\nconfiguration'
      )
      const failure = Object.assign(
        new Error('Literal configuration input EIO'),
        {
          code: 'EIO',
        }
      )
      const previous = process.env[variable]
      const previousNoSystem = process.env.GIT_CONFIG_NOSYSTEM
      process.env[variable] = target
      process.env.GIT_CONFIG_NOSYSTEM = '0'
      configurationReadFailure = { path: target, error: failure }
      try {
        await assert.rejects(
          h.dispatcher.prepareCopilotAssistedCommitRequest(
            repository,
            h.request(repository)
          ),
          error => errors.assistedCommitErrorCauses(error).includes(failure)
        )
        assert.strictEqual(h.propose.mock.callCount(), 0)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(await fixtures.count(source), 1)
      } finally {
        if (previous === undefined) {
          delete process.env[variable]
        } else {
          process.env[variable] = previous
        }
        if (previousNoSystem === undefined) {
          delete process.env.GIT_CONFIG_NOSYSTEM
        } else {
          process.env.GIT_CONFIG_NOSYSTEM = previousNoSystem
        }
      }
    })
  }

  it('refuses follow-up fetch through a substituted object-pack directory without writing foreign packs', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Unrelated checkout\n',
    })
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'fetch.unpackLimit',
      '1',
    ])
    const foreign = join(replacement.path, '.git', 'objects', 'pack')
    const route = join(source.path, '.git', 'objects', 'pack')
    await FileSystem.mkdir(foreign, { recursive: true })
    await FileSystem.mkdir(route, { recursive: true })
    const original = await FileSystem.readdir(foreign)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let replaced = false
    afterPush = async () => {
      afterPush = undefined
      const tree = await remote.read([
        'rev-parse',
        '--verify',
        `${remote.originalTip}^{tree}`,
      ])
      const extra = await remote.read([
        'commit-tree',
        tree,
        '-p',
        remote.originalTip,
        '-m',
        'Receiver-only packed commit',
      ])
      await remote.read(['update-ref', 'refs/heads/unfetched', extra])
      await FileSystem.rename(route, `${route}-original`)
      await FileSystem.symlink(foreign, route, 'junction')
      replaced = true
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(replaced, true)
    assert.deepStrictEqual(await FileSystem.readdir(foreign), original)
    assert.ok(outcome.refreshError)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('refuses retargeted effective GIT_WORK_TREE routing after acknowledged push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    await FileSystem.writeFile(
      join(replacement.path, 'foreign'),
      'Foreign changes\n'
    )
    const route = join(await temporary.createTempDirectory(t), 'worktree')
    await FileSystem.symlink(source.path, route, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const previous = process.env.GIT_WORK_TREE
    process.env.GIT_WORK_TREE = route
    try {
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      afterPush = async () => {
        afterPush = undefined
        await FileSystem.unlink(route)
        await FileSystem.symlink(replacement.path, route, 'junction')
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(
        h
          .state(repository)
          .changesState.workingDirectory.files.some(
            file => file.path === 'foreign'
          ),
        false
      )
      assert.ok(outcome.refreshError)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_WORK_TREE
      } else {
        process.env.GIT_WORK_TREE = previous
      }
    }
  })

  it('refuses follow-up fetch through a substituted reflog directory without appending foreign bytes', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'core.logAllRefUpdates',
      'true',
    ])
    const foreign = await temporary.createTempDirectory(t)
    const sentinel = join(foreign, 'unfetched')
    const bytes = Buffer.from('Never append a foreign reflog\n')
    await FileSystem.writeFile(sentinel, bytes)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let replaced = false
    afterPush = async () => {
      afterPush = undefined
      const tree = await remote.read([
        'rev-parse',
        '--verify',
        `${remote.originalTip}^{tree}`,
      ])
      const extra = await remote.read([
        'commit-tree',
        tree,
        '-p',
        remote.originalTip,
        '-m',
        'Receiver-only reflog branch',
      ])
      await remote.read(['update-ref', 'refs/heads/unfetched', extra])
      const path = join(
        source.path,
        '.git',
        'logs',
        'refs',
        'remotes',
        'origin'
      )
      await FileSystem.rename(path, `${path}-original`)
      await FileSystem.symlink(foreign, path, 'junction')
      replaced = true
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(replaced, true)
    assert.deepStrictEqual(await FileSystem.readFile(sentinel), bytes)
    assert.ok(outcome.refreshError)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const route of ['FETCH_HEAD', 'index']) {
    it(`refuses post-ACK ${route} symlink routing without foreign writes or Changes`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const replacement = await fixtures.seed(t, {
        file: 'before\n',
        foreign: 'Foreign index entry\n',
      })
      const sentinel = join(await temporary.createTempDirectory(t), 'sentinel')
      const sentinelBytes = Buffer.from('Never overwrite foreign metadata\n')
      await FileSystem.writeFile(sentinel, sentinelBytes)
      const target =
        route === 'index' ? join(replacement.path, '.git', 'index') : sentinel
      const originalTarget = await FileSystem.readFile(target)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      afterPush = async () => {
        afterPush = undefined
        const path = join(source.path, '.git', route)
        await FileSystem.rm(path, { force: true })
        await FileSystem.symlink(target, path, 'file')
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.deepStrictEqual(await FileSystem.readFile(target), originalTarget)
      assert.strictEqual(
        h
          .state(repository)
          .changesState.workingDirectory.files.some(
            file => file.path === 'foreign'
          ),
        false
      )
      assert.ok(outcome.refreshError)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
    })
  }

  it('rejects an alias changed after canonical lookup but before capture', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    const requested = new repositories.Repository(
      alias,
      repository.id,
      null,
      false
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    statusFailure = new Error('Synthetic first refresh failure')
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    let replaced = false
    aliasResolutionPath = alias
    beforeAliasFenceCapture = async () => {
      beforeAliasFenceCapture = undefined
      await FileSystem.unlink(alias)
      await FileSystem.symlink(replacement.path, alias, 'junction')
      replaced = true
    }
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      requested,
      state.runId
    )
    assert.strictEqual(replaced, true)
    const refused = h.state(repository).changesState.assistedCommit
    assert.ok(refused.kind === 'error')
    assert.strictEqual(refused.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('never installs a foreign untracked image during accepted reader settlement', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    const originalImage = await FileSystem.readFile(
      join(
        'app',
        'test',
        'fixtures',
        'repo-with-image-changes',
        'new-image.png'
      )
    )
    const foreignImage = await FileSystem.readFile(
      join(
        'app',
        'test',
        'fixtures',
        'detect-conflict-in-binary-file',
        'my-cool-image.png'
      )
    )
    assert.ok(!originalImage.equals(foreignImage))
    await FileSystem.writeFile(join(source.path, 'image.png'), originalImage)
    await FileSystem.writeFile(
      join(replacement.path, 'image.png'),
      foreignImage
    )
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(
      new repositories.Repository(alias, source.id, null, false)
    )
    const image = h
      .state(repository)
      .changesState.workingDirectory.files.find(
        file => file.path === 'image.png'
      )
    assert.ok(image !== undefined)
    await h.dispatcher.changeFileIncluded(repository, image, false)
    await h.dispatcher.selectWorkingDirectoryFiles(repository, [image])
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let retargeted = false
    let readerError: unknown
    let injected = false
    let foreignFrames = 0
    const emit = h.appStore['emitUpdate'].bind(h.appStore)
    h.appStore['emitUpdate'] = () => {
      const selection = h.state(repository).changesState.selection
      if (
        selection.kind ===
          selectionStates.ChangesSelectionKind.WorkingDirectory &&
        selection.diff?.kind === diffs.DiffType.Image &&
        selection.diff.current?.contents === foreignImage.toString('base64')
      ) {
        foreignFrames++
      }
      emit()
    }
    const finish = h.appStore['finishAssistedCommitSelectionReads'].bind(
      h.appStore
    )
    h.appStore['finishAssistedCommitSelectionReads'] = async run => {
      if (run.pushSucceeded && !injected) {
        injected = true
        beforeImageRead = async () => {
          beforeImageRead = undefined
          await FileSystem.unlink(alias)
          await FileSystem.symlink(replacement.path, alias, 'junction')
          retargeted = true
        }
        try {
          await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
        } catch (error) {
          readerError = error
        }
      }
      return finish(run)
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(retargeted, true)
    assert.strictEqual(foreignFrames, 0)
    const selection = h.state(repository).changesState.selection
    assert.ok(
      selection.kind === selectionStates.ChangesSelectionKind.WorkingDirectory
    )
    assert.ok(
      selection.diff?.kind !== diffs.DiffType.Image ||
        selection.diff.current?.contents !== foreignImage.toString('base64')
    )
    assert.ok(outcome.refreshError)
    assert.ok(readerError instanceof Error)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.deepStrictEqual(
      await FileSystem.readFile(join(source.path, 'image.png')),
      originalImage
    )
    assert.strictEqual(pushArguments.length, 1)
  })

  it('never fetches into a substituted object-directory alias after acknowledged push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    const objects = join(source.path, '.git', 'objects')
    const otherObjects = join(replacement.path, '.git', 'objects')
    const pool = join(await temporary.createTempDirectory(t), 'objects')
    await FileSystem.rename(objects, pool)
    await FileSystem.symlink(pool, objects, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let receiverOnly: string | undefined
    let retargeted = false
    afterPush = async () => {
      afterPush = undefined
      await FileSystem.cp(pool, otherObjects, { recursive: true })
      const tree = await remote.read([
        'rev-parse',
        '--verify',
        `${remote.originalTip}^{tree}`,
      ])
      receiverOnly = await remote.read([
        'commit-tree',
        tree,
        '-p',
        remote.originalTip,
        '-m',
        'Receiver-only unfetched commit',
      ])
      await remote.read(['update-ref', 'refs/heads/unfetched', receiverOnly])
      await FileSystem.unlink(objects)
      await FileSystem.symlink(otherObjects, objects, 'junction')
      retargeted = true
    }
    capturePushes = true
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(retargeted, true)
      assert.ok(receiverOnly !== undefined)
      const foreignObject = await actualExec(
        ['cat-file', '-e', receiverOnly],
        replacement.path
      )
      assert.notStrictEqual(foreignObject.exitCode, 0)
      assert.ok(outcome.refreshError)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(await fixtures.count(replacement), 1)
      assert.strictEqual(
        await FileSystem.readFile(join(replacement.path, 'foreign'), 'utf8'),
        'Foreign checkout\n'
      )
      assert.strictEqual(pushArguments.length, 1)
    } finally {
      if (retargeted) {
        await FileSystem.unlink(objects)
        await FileSystem.symlink(pool, objects, 'junction')
      }
    }
  })

  it('never resumes accepted deferred History through a substituted execution alias', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(
      new repositories.Repository(alias, source.id, null, false)
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let retargetedAt = 0
    afterPush = async () => {
      afterPush = undefined
      await FileSystem.cp(
        join(source.path, '.git', 'objects'),
        join(replacement.path, '.git', 'objects'),
        { recursive: true }
      )
      const accepted = await fixtures.tip(source)
      h.dispatcher.changeCommitSelection(repository, [accepted], true)
      h.appStore['deferredAssistedCommitHistorySelections'].set(
        repository.id,
        repository
      )
      await FileSystem.unlink(alias)
      await FileSystem.symlink(replacement.path, alias, 'junction')
      retargetedAt = allExecutions.length
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.ok(retargetedAt > 0)
    assert.strictEqual(
      allExecutions
        .slice(retargetedAt)
        .some(
          call =>
            call.path === alias &&
            (call.args.includes('log') || call.args.includes('diff'))
        ),
      false
    )
    assert.strictEqual(
      h.appStore['deferredAssistedCommitHistorySelections'].has(repository.id),
      false
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(await fixtures.count(replacement), 1)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const phase of ['deferred refresh', 'selection readers'] as const) {
    it(`returns acknowledged push with actual ${phase} settlement error`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const failure = Object.assign(new Error(`Synthetic final ${phase} EIO`), {
        code: 'EIO',
      })
      let injected = false
      if (phase === 'deferred refresh') {
        const update = h.appStore['setAssistedCommitRunState'].bind(h.appStore)
        h.appStore['setAssistedCommitRunState'] = (run, state) => {
          update(run, state)
          if (run.pushSucceeded && state.kind === 'idle' && !injected) {
            injected = true
            h.appStore['deferredAssistedCommitRefreshes'].set(
              repository.id,
              repository
            )
            statusFailure = failure
          }
        }
      } else {
        const finish = h.appStore['finishAssistedCommitSelectionReads'].bind(
          h.appStore
        )
        h.appStore['finishAssistedCommitSelectionReads'] = async run => {
          await finish(run)
          if (run.pushSucceeded && !injected) {
            injected = true
            h.appStore['invalidateAssistedCommitSelection'](
              repository,
              run,
              failure
            )
          }
        }
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(injected, true)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, 'refresh')
      assert.ok(outcome.refreshError)
      assert.ok(
        errors.assistedCommitErrorCauses(outcome.refreshError).includes(failure)
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
    })
  }

  for (const retry of [false, true]) {
    it(`returns actual final deferred History error after acknowledged push, retry ${retry}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      const failed = retry
        ? await (async () => {
            reportPushFailure = new Error('Synthetic initial response lost')
            return h.dispatcher.createCopilotAssistedCommits(
              repository,
              h.request(repository)
            )
          })()
        : undefined
      if (retry) {
        assert.ok(failed?.kind === 'push-error')
      }
      const failure = Object.assign(
        new Error('Synthetic final deferred History EIO'),
        { code: 'EIO' }
      )
      let queued = false
      const update = h.appStore['setAssistedCommitRunState'].bind(h.appStore)
      h.appStore['setAssistedCommitRunState'] = (run, state) => {
        update(run, state)
        if (run.pushSucceeded && state.kind === 'idle' && !queued) {
          queued = true
          const sha = run.result?.head.sha
          assert.ok(sha !== undefined && sha !== null)
          h.dispatcher.changeCommitSelection(repository, [sha], true)
          h.appStore['deferredAssistedCommitHistorySelections'].set(
            repository.id,
            repository
          )
          historyFailure = failure
        }
      }
      const state = h.state(repository).changesState.assistedCommit
      const outcome = retry
        ? await (async () => {
            assert.ok(state.kind === 'push-error')
            return h.dispatcher.retryCopilotAssistedCommitPush(
              repository,
              state.runId
            )
          })()
        : await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
      assert.ok(outcome?.kind === 'pushed')
      assert.strictEqual(queued, true)
      assert.ok(outcome.refreshError)
      assert.ok(
        errors.assistedCommitErrorCauses(outcome.refreshError).includes(failure)
      )
      const error = h.state(repository).changesState.assistedCommit
      assert.ok(error.kind === 'error')
      assert.strictEqual(error.retry, 'refresh')
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, retry ? 2 : 1)
      assert.strictEqual(h.propose.mock.callCount(), 1)
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        error.runId
      )
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, retry ? 2 : 1)
    })
  }

  it('checks accepted History ownership before installing an awaited changeset result', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout\n',
    })
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(
      new repositories.Repository(alias, source.id, null, false)
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let before = h.state(repository).commitSelection.changesetData
    let retargeted = false
    let queued = false
    const update = h.appStore['setAssistedCommitRunState'].bind(h.appStore)
    h.appStore['setAssistedCommitRunState'] = (run, state) => {
      update(run, state)
      if (run.pushSucceeded && state.kind === 'idle' && !queued) {
        queued = true
        const sha = run.result?.head.sha
        assert.ok(sha !== undefined && sha !== null)
        h.dispatcher.changeCommitSelection(repository, [sha], true)
        before = h.state(repository).commitSelection.changesetData
        h.appStore['deferredAssistedCommitHistorySelections'].set(
          repository.id,
          repository
        )
        afterHistoryRead = async () => {
          afterHistoryRead = undefined
          await FileSystem.unlink(alias)
          await FileSystem.symlink(replacement.path, alias, 'junction')
          retargeted = true
        }
      }
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(queued, true)
    assert.strictEqual(retargeted, true)
    assert.ok(outcome.refreshError)
    assert.strictEqual(
      h.state(repository).commitSelection.changesetData,
      before
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(await fixtures.count(replacement), 1)
    assert.strictEqual(pushArguments.length, 1)
  })

  for (const replacement of [false, true]) {
    it(`refuses changed publication lock contents after awaited close, replacement ${replacement}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      const configPath = join(source.path, '.git', 'config')
      const originalConfig = await FileSystem.readFile(configPath)
      const foreign = Buffer.from(
        '[unrelated]\n\tvalue = "Never install this"\n'
      )
      let substituted = false
      let closedPath: string | undefined
      afterPublicationLockClose = async path => {
        afterPublicationLockClose = undefined
        if (replacement) {
          await FileSystem.rename(path, `${path}-original`)
        }
        await FileSystem.writeFile(path, foreign)
        closedPath = path
        substituted = true
      }
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(substituted, true)
      assert.ok(outcome.refreshError)
      assert.deepStrictEqual(
        await FileSystem.readFile(configPath),
        originalConfig
      )
      if (replacement) {
        assert.ok(closedPath !== undefined)
        assert.deepStrictEqual(await FileSystem.readFile(closedPath), foreign)
      }
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(pushArguments.length, 1)
    })
  }

  it('never refreshes a changed deferred alias while settling push-only retry', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, { foreign: 'before\n' })
    await FileSystem.writeFile(
      join(replacement.path, 'foreign'),
      'Foreign edits\n'
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    const requested = new repositories.Repository(
      alias,
      repository.id,
      null,
      false
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    reportPushFailure = new Error('Synthetic first push response lost')
    const failed = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(failed.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    afterPush = async () => {
      afterPush = undefined
      h.appStore['deferredAssistedCommitRefreshes'].set(
        repository.id,
        requested
      )
      await FileSystem.unlink(alias)
      await FileSystem.symlink(replacement.path, alias, 'junction')
    }
    const outcome = await h.dispatcher.retryCopilotAssistedCommitPush(
      requested,
      state.runId
    )
    assert.ok(outcome?.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.strictEqual(
      allExecutions.some(
        call => call.path === requested.path && call.args.includes('status')
      ),
      false
    )
    assert.strictEqual(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(
          file => file.path === 'foreign'
        ),
      false
    )
    const refused = h.state(repository).changesState.assistedCommit
    assert.ok(refused.kind === 'error')
    assert.strictEqual(refused.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(pushArguments.length, 2)
  })

  for (const boundary of ['creation', 'marker-release'] as const) {
    it(`never adopts or deletes unrelated publication files at staging ${boundary}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      let foreignDirectory = join(source.path, '.git', 'unrelated-publication')
      await FileSystem.mkdir(foreignDirectory)
      await FileSystem.writeFile(
        join(foreignDirectory, 'sentinel'),
        'Never delete unrelated publication files\n'
      )
      const substitute = async (directory: string) => {
        afterStagingDirectoryCreation = undefined
        afterMarkerUnlink = undefined
        await FileSystem.rename(directory, `${directory}-original`)
        await FileSystem.rename(foreignDirectory, directory)
        foreignDirectory = directory
      }
      if (boundary === 'creation') {
        afterStagingDirectoryCreation = substitute
      } else {
        afterMarkerUnlink = path => substitute(join(path, '..'))
      }
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(outcome.refreshError, undefined)
      assert.strictEqual(stagingDirectoryCreations, 0)
      assert.strictEqual(
        await FileSystem.readFile(join(foreignDirectory, 'sentinel'), 'utf8'),
        'Never delete unrelated publication files\n'
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(pushArguments.length, 1)
    })
  }

  it('cannot strand publication recovery through a failed staging marker open', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    markerOpenFailure = Object.assign(
      new Error('Synthetic first staging marker open EIO'),
      { code: 'EIO' }
    )
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    const state = h.state(repository).changesState.assistedCommit
    if (state.kind === 'error') {
      assert.strictEqual(state.retry, 'refresh')
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
    }
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(stagingDirectoryCreations, 0)
    assert.ok(markerOpenFailure !== undefined)
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--local',
        '--get',
        'branch.master.remote',
      ]),
      'origin'
    )
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--local',
        '--get',
        'branch.master.merge',
      ]),
      remote.remoteRef
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('rejects a changed requested recovery alias without reading another checkout', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, { foreign: 'before\n' })
    await FileSystem.writeFile(
      join(replacement.path, 'foreign'),
      'Foreign edits\n'
    )
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const requested = new repositories.Repository(
      alias,
      repository.id,
      null,
      false
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    statusFailure = new Error(
      'Synthetic post-ACK status failure before alias retry'
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    await FileSystem.unlink(alias)
    await FileSystem.symlink(replacement.path, alias, 'junction')
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      requested,
      state.runId
    )
    const refused = h.state(repository).changesState.assistedCommit
    assert.ok(refused.kind === 'error')
    assert.strictEqual(
      allExecutions.some(
        call => call.path === requested.path && call.args.includes('status')
      ),
      false
    )
    assert.strictEqual(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(
          file => file.path === 'foreign'
        ),
      false
    )
    assert.strictEqual(
      refused.retry,
      null,
      errors
        .assistedCommitErrorCauses(refused.error)
        .map(cause =>
          cause instanceof Error ? cause.stack ?? cause.message : String(cause)
        )
        .join('\n')
    )
    assert.strictEqual(
      await FileSystem.readFile(join(replacement.path, 'foreign'), 'utf8'),
      'Foreign edits\n'
    )
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('refuses configuration-backed worktree redirection after acknowledged push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, { foreign: 'before\n' })
    await FileSystem.writeFile(
      join(replacement.path, 'foreign'),
      'Foreign edits\n'
    )
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    afterPush = async path => {
      afterPush = undefined
      const result = await actualExec(
        ['config', '--local', '--', 'core.worktree', replacement.path],
        path
      )
      assert.strictEqual(result.exitCode, 0, result.stderr)
    }
    capturePushes = true
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      assert.strictEqual(
        h
          .state(repository)
          .changesState.workingDirectory.files.some(
            file => file.path === 'foreign'
          ),
        false
      )
      assert.strictEqual(
        await FileSystem.readFile(join(replacement.path, 'foreign'), 'utf8'),
        'Foreign edits\n'
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(pushArguments.length, 1)
    } finally {
      const result = await actualExec(
        ['config', '--local', '--unset-all', '--', 'core.worktree'],
        source.path
      )
      assert.strictEqual(result.exitCode, 0, result.stderr)
    }
  })

  it('never installs another checkout into assisted state when Retry refresh owner changed', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    const replacement = await fixtures.seed(t, {
      foreign: 'Foreign checkout stays\n',
    })
    const alias = join(await temporary.createTempDirectory(t), 'alias')
    await FileSystem.symlink(source.path, alias, 'junction')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(
      new repositories.Repository(alias, source.id, null, false)
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    statusFailure = new Error('Synthetic post-ACK status failure')
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    await FileSystem.rename(alias, `${alias}-original`)
    await FileSystem.symlink(replacement.path, alias, 'junction')
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    const refused = h.state(repository).changesState.assistedCommit
    assert.ok(refused.kind === 'error')
    assert.strictEqual(refused.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(source), 2)
    assert.strictEqual(
      await FileSystem.readFile(join(replacement.path, 'foreign'), 'utf8'),
      'Foreign checkout stays\n'
    )
    assert.strictEqual(pushArguments.length, 1)
    assert.strictEqual(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(
          file => file.path === 'foreign'
        ),
      false
    )
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  it('never installs tracking into a configuration target retired after path certification', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const alias = join(source.path, '.git', 'config')
    const bytes = await FileSystem.readFile(alias)
    const first = join(await temporary.createTempDirectory(t), 'config')
    const second = join(await temporary.createTempDirectory(t), 'config')
    await FileSystem.writeFile(first, bytes)
    await FileSystem.writeFile(second, bytes)
    await FileSystem.unlink(alias)
    await FileSystem.symlink(first, alias, 'file')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const matches = await fixtures.createPathMatcher(first)
    let retargeted = false
    afterModeStat = async path => {
      if (pushArguments.length === 0 || !(await matches(path))) {
        return
      }
      afterModeStat = undefined
      await FileSystem.unlink(alias)
      await FileSystem.symlink(second, alias, 'file')
      retargeted = true
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.strictEqual(retargeted, true)
    for (const file of [first, second]) {
      const result = await actualExec(
        [
          'config',
          '--no-includes',
          '--file',
          file,
          '--get',
          'branch.master.merge',
        ],
        source.path
      )
      assert.strictEqual(result.exitCode, 1)
    }
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(pushArguments.length, 1)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  for (const branch of ['master', 'feature/"quoted.branch']) {
    it(`round-trips literal tracking names through native stdin configuration for ${branch}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      if (branch !== 'master') {
        await fixtures.rawGit(source, ['branch', '--move', branch])
      }
      const remote = await remotes.addBareRemote(t, source, {
        name: 'o"rigin',
        publish: false,
      })
      const configPath = join(source.path, '.git', 'config')
      const original = Buffer.concat([
        await FileSystem.readFile(configPath),
        Buffer.from('# Original comment without a final newline'),
      ])
      await FileSystem.writeFile(configPath, original)
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(outcome.refreshError, undefined)
      assert.strictEqual(
        await fixtures.rawGit(repository, [
          'config',
          '--local',
          '--get',
          '--',
          `branch.${branch}.remote`,
        ]),
        remote.name
      )
      assert.strictEqual(
        await fixtures.rawGit(repository, [
          'config',
          '--local',
          '--get',
          '--',
          `branch.${branch}.merge`,
        ]),
        remote.remoteRef
      )
      assert.ok(
        (await FileSystem.readFile(configPath))
          .subarray(0, original.length)
          .equals(original)
      )
      assert.strictEqual(
        allArguments.filter(
          args =>
            args[0] === 'config' &&
            args.includes('--get-all') &&
            args[args.indexOf('--file') + 1] === '-'
        ).length,
        2
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(pushArguments.length, 1)
      assert.strictEqual(h.propose.mock.callCount(), 1)
    })
  }

  for (const after of ['push', 'fetch'] as const) {
    it(`never fetches or fast-forwards a checkout substituted after acknowledged ${after}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const replacement = join(
        await temporary.createTempDirectory(t),
        'replacement'
      )
      await FileSystem.cp(source.path, replacement, { recursive: true })
      const other = new repositories.Repository(replacement, 99, null, false)
      await fixtures.rawGit(other, ['branch', 'secondary', 'HEAD'])
      await fixtures.rawGit(other, [
        'config',
        '--local',
        '--',
        'branch.secondary.remote',
        'origin',
      ])
      await fixtures.rawGit(other, [
        'config',
        '--local',
        '--',
        'branch.secondary.merge',
        remote.remoteRef,
      ])
      const alias = join(await temporary.createTempDirectory(t), 'alias')
      const oldAlias = `${alias}-original`
      await FileSystem.symlink(source.path, alias, 'junction')
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(
        new repositories.Repository(alias, source.id, null, false)
      )
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      let retargeted = false
      const retarget = async () => {
        afterPush = undefined
        afterFollowUpFetch = undefined
        await FileSystem.rename(alias, oldAlias)
        await FileSystem.symlink(replacement, alias, 'junction')
        retargeted = true
      }
      if (after === 'push') {
        afterPush = retarget
      } else {
        afterFollowUpFetch = retarget
      }
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.strictEqual(retargeted, true)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.tip(source), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(await fixtures.tip(other), remote.originalTip)
      assert.strictEqual(
        await fixtures.rawGit(other, [
          'rev-parse',
          '--verify',
          'refs/remotes/origin/master',
        ]),
        remote.originalTip
      )
      assert.strictEqual(
        await fixtures.rawGit(other, [
          'rev-parse',
          '--verify',
          'refs/heads/secondary',
        ]),
        remote.originalTip
      )
      assert.strictEqual(
        await FileSystem.readFile(join(other.path, 'file'), 'utf8'),
        'before\n'
      )
      assert.strictEqual(pushArguments.length, 1)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('publishes and retries native configuration without creating or deleting private staging directories', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const directory = join(source.path, '.git', 'desktop-publication-unrelated')
    await FileSystem.mkdir(directory)
    await FileSystem.writeFile(
      join(directory, 'sentinel'),
      'Unrelated metadata stays\n'
    )
    let attemptedRemove = false
    denyRemove = async path => {
      if (
        typeof path === 'string' &&
        basename(path).startsWith('desktop-publication-')
      ) {
        attemptedRemove = true
        return true
      }
      afterStagingDirectoryCreation = async () => {
        throw new Error(
          'Publication must not create a private staging directory'
        )
      }
      directoryStatFailure = Object.assign(
        new Error('Publication must not stat a private staging directory'),
        { code: 'EIO' }
      )
      retainDirectoryStatFailure = true
      denyConfigKey = 'branch.master.merge'
      return false
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    assert.strictEqual(attemptedRemove, false)
    assert.strictEqual(failedDirectory, undefined)
    assert.strictEqual(stagingDirectoryCreations, 0)
    denyConfigKey = undefined
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(
      await FileSystem.readFile(join(directory, 'sentinel'), 'utf8'),
      'Unrelated metadata stays\n'
    )
    assert.strictEqual(attemptedRemove, false)
    assert.strictEqual(failedDirectory, undefined)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('expires a dangling original configuration target after acknowledgement without restoring it', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const config = join(source.path, '.git', 'config')
    const bytes = await FileSystem.readFile(config)
    const target = join(await temporary.createTempDirectory(t), 'config')
    await FileSystem.writeFile(target, bytes)
    await FileSystem.unlink(config)
    await FileSystem.symlink(target, config, 'file')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    afterPush = async () => {
      afterPush = undefined
      assert.strictEqual(
        (await FileSystem.lstat(config)).isSymbolicLink(),
        true
      )
      await FileSystem.unlink(target)
      assert.strictEqual(
        (await FileSystem.lstat(config)).isSymbolicLink(),
        true
      )
    }
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      await assert.rejects(FileSystem.lstat(target), { code: 'ENOENT' })
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      await FileSystem.writeFile(target, bytes)
    }
  })

  it('expires a dangling worktree configuration target before capture can strand publication', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await fixtures.rawGit(source, [
      'config',
      '--local',
      '--',
      'extensions.worktreeConfig',
      'true',
    ])
    const config = await fixtures.rawGit(source, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'config.worktree',
    ])
    const target = join(await temporary.createTempDirectory(t), 'config')
    await FileSystem.writeFile(target, '')
    await FileSystem.symlink(target, config, 'file')
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    afterPush = async () => {
      afterPush = undefined
      assert.strictEqual(
        (await FileSystem.lstat(config)).isSymbolicLink(),
        true
      )
      await FileSystem.unlink(target)
    }
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      await assert.rejects(FileSystem.lstat(target), { code: 'ENOENT' })
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      await FileSystem.writeFile(target, '')
    }
  })

  for (const scope of ['global', 'system'] as const) {
    it(`expires publication when the acknowledged remote moves to ${scope} scope`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      const config = join(await temporary.createTempDirectory(t), 'config')
      await FileSystem.writeFile(config, '')
      const variable =
        scope === 'global' ? 'GIT_CONFIG_GLOBAL' : 'GIT_CONFIG_SYSTEM'
      const previous = [
        { name: variable, value: process.env[variable] },
        { name: 'GIT_CONFIG_NOSYSTEM', value: process.env.GIT_CONFIG_NOSYSTEM },
      ]
      process.env[variable] = config
      if (scope === 'system') {
        process.env.GIT_CONFIG_NOSYSTEM = '0'
      }
      try {
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
        const h = await harness.createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        capturePushes = true
        afterPush = async path => {
          afterPush = undefined
          const moved = await actualExec(
            [
              'config',
              '--file',
              config,
              '--',
              'remote.origin.url',
              remote.path,
            ],
            path
          )
          assert.strictEqual(moved.exitCode, 0, moved.stderr)
          const removed = await actualExec(
            ['remote', 'remove', '--', 'origin'],
            path
          )
          assert.strictEqual(removed.exitCode, 0, removed.stderr)
        }
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'pushed')
        assert.ok(outcome.refreshError)
        const state = h.state(repository).changesState.assistedCommit
        assert.ok(state.kind === 'error')
        assert.strictEqual(state.retry, null)
        assert.strictEqual(await remote.tip(), outcome.result.head.sha)
        assert.strictEqual(await fixtures.count(repository), 2)
        assert.strictEqual(pushArguments.length, 1)
        h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
        assert.strictEqual(
          h.state(repository).changesState.assistedCommit.kind,
          'idle'
        )
      } finally {
        for (const { name, value } of previous) {
          if (value === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = value
          }
        }
      }
    })
  }

  for (const cleanupFault of [false, true]) {
    it(`expires post-ACK unsupported includes only after owned cleanup, cleanup fault ${cleanupFault}`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      const changeInclude = async (path: string) => {
        if (cleanupFault) {
          assert.ok(
            (await FileSystem.lstat(join(path, '.git', 'config.lock'))).isFile()
          )
          await FileSystem.appendFile(
            join(path, '.git', 'config'),
            '\n[include]\n\tpath = "%(prefix)/desktop-assisted-missing-post-push-config"\n'
          )
          return
        }
        const result = await actualExec(
          [
            'config',
            '--local',
            '--',
            'include.path',
            '%(prefix)/desktop-assisted-missing-post-push-config',
          ],
          path
        )
        assert.strictEqual(result.exitCode, 0, result.stderr)
      }
      if (cleanupFault) {
        duringConfigWrite = async (_args, path) => {
          duringConfigWrite = undefined
          await changeInclude(path)
        }
        denyUnlink = await fixtures.createPathMatcher(
          join(repository.path, '.git', 'config.lock')
        )
      } else {
        afterPush = async path => {
          afterPush = undefined
          await changeInclude(path)
        }
      }
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, cleanupFault ? 'refresh' : null)
      if (cleanupFault) {
        denyUnlink = undefined
        await h.dispatcher.retryCopilotAssistedCommitRecovery(
          repository,
          state.runId
        )
        const settled = h.state(repository).changesState.assistedCommit
        assert.ok(settled.kind === 'error')
        assert.strictEqual(settled.retry, null)
      }
      await assert.rejects(
        FileSystem.lstat(join(repository.path, '.git', 'config.lock')),
        { code: 'ENOENT' }
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  for (const site of [
    'original-owner',
    'closing-owner',
    'closing-config',
  ] as const) {
    it(`retains acknowledged publication for retry after transient ${site} filesystem EIO`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const target = await FileSystem.realpath(
        site === 'closing-config'
          ? join(repository.path, '.git', 'config')
          : repository.path
      )
      syncFailure = Object.assign(
        new Error('Synthetic transient metadata EIO'),
        { code: 'EIO' }
      )
      const inject = () => {
        denySyncStat = path =>
          typeof path === 'string' &&
          FileSystemSync.realpathSync(path) === target
      }
      if (site === 'original-owner') {
        afterPush = async () => {
          afterPush = undefined
          inject()
        }
      } else {
        duringConfigWrite = async () => {
          duringConfigWrite = undefined
          inject()
        }
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.ok(
        errors
          .assistedCommitErrorCauses(outcome.refreshError)
          .includes(syncFailure)
      )
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, 'refresh')
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'error'
      )
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(
        await fixtures.rawGit(repository, [
          'config',
          '--get',
          'branch.master.merge',
        ]),
        remote.remoteRef
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(await fixtures.count(repository), 2)
      assert.strictEqual(pushArguments.length, 1)
      assert.strictEqual(h.propose.mock.callCount(), 1)
    })
  }

  for (const sourceKind of ['global', 'system'] as const) {
    it(`never certifies a stale ${sourceKind} include graph before a late destination rewrite`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      const replacement = await remotes.addBareRemote(t, source, {
        name: 'replacement',
        publish: false,
      })
      await fixtures.rawGit(source, [
        'push',
        '--',
        'replacement',
        remote.branchRef,
      ])
      const root = join(await temporary.createTempDirectory(t), 'root-config')
      const included = join(
        await temporary.createTempDirectory(t),
        'new-include'
      )
      await FileSystem.writeFile(root, '')
      await FileSystem.writeFile(included, '')
      const variable =
        sourceKind === 'global' ? 'GIT_CONFIG_GLOBAL' : 'GIT_CONFIG_SYSTEM'
      const previous = [
        { name: variable, value: process.env[variable] },
        { name: 'GIT_CONFIG_NOSYSTEM', value: process.env.GIT_CONFIG_NOSYSTEM },
      ]
      process.env[variable] = root
      if (sourceKind === 'system') {
        process.env.GIT_CONFIG_NOSYSTEM = '0'
      }
      try {
        await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
        const h = await harness.createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        let added = false
        afterConfigurationRead = async () => {
          if (
            added ||
            h.state(repository).changesState.assistedCommit.kind !==
              'preparing-push'
          ) {
            return
          }
          added = true
          afterConfigurationRead = undefined
          const result = await actualExec(
            ['config', '--file', root, '--', 'include.path', included],
            repository.path
          )
          assert.strictEqual(result.exitCode, 0, result.stderr)
        }
        afterPinnedLookup = async () => {
          afterPinnedLookup = undefined
          const result = await actualExec(
            [
              'config',
              '--file',
              included,
              '--',
              `url.${replacement.path}.insteadOf`,
              remote.path,
            ],
            repository.path
          )
          assert.strictEqual(result.exitCode, 0, result.stderr)
        }
        capturePushes = true
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        assert.ok(outcome.kind === 'push-error')
        assert.strictEqual(outcome.attempted, false)
        assert.strictEqual(added, true)
        assert.strictEqual(pushArguments.length, 0)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(await replacement.tip(), replacement.originalTip)
        assert.strictEqual(await fixtures.count(repository), 2)
      } finally {
        for (const { name, value } of previous) {
          if (value === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = value
          }
        }
      }
    })
  }

  it('rejects a newly discovered nested include before installing stale publication tracking', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const root = join(await temporary.createTempDirectory(t), 'root-config')
    const first = join(await temporary.createTempDirectory(t), 'first-include')
    const nested = join(
      await temporary.createTempDirectory(t),
      'nested-include'
    )
    await FileSystem.writeFile(root, '')
    await FileSystem.writeFile(first, '')
    await FileSystem.writeFile(nested, '')
    const include = await actualExec(
      ['config', '--file', root, '--', 'include.path', first],
      source.path
    )
    assert.strictEqual(include.exitCode, 0, include.stderr)
    const previous = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = root
    try {
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      let added = false
      afterConfigurationRead = async () => {
        if (pushArguments.length === 0) {
          return
        }
        afterConfigurationRead = undefined
        added = true
        const result = await actualExec(
          ['config', '--file', first, '--', 'include.path', nested],
          repository.path
        )
        assert.strictEqual(result.exitCode, 0, result.stderr)
      }
      duringConfigWrite = async () => {
        duringConfigWrite = undefined
        const result = await actualExec(
          [
            'config',
            '--file',
            nested,
            '--',
            'branch.master.merge',
            'refs/heads/external',
          ],
          repository.path
        )
        assert.strictEqual(result.exitCode, 0, result.stderr)
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.strictEqual(added, true)
      const tracking = await actualExec(
        ['config', '--local', '--get', 'branch.master.merge'],
        repository.path
      )
      assert.strictEqual(tracking.exitCode, 1)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL
      } else {
        process.env.GIT_CONFIG_GLOBAL = previous
      }
    }
  })

  it('expires unsupported symbolic post-push branch identity without holding publication forever', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    afterPush = async path => {
      afterPush = undefined
      const result = await actualExec(
        ['update-ref', 'refs/heads/alias-target', 'HEAD'],
        path
      )
      assert.strictEqual(result.exitCode, 0, result.stderr)
      const alias = await actualExec(
        ['symbolic-ref', remote.branchRef, 'refs/heads/alias-target'],
        path
      )
      assert.strictEqual(alias.exitCode, 0, alias.stderr)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.tip(repository), outcome.result.head.sha)
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'symbolic-ref',
        '--no-recurse',
        remote.branchRef,
      ]),
      'refs/heads/alias-target'
    )
    assert.strictEqual(pushArguments.length, 1)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  it('expires an unavailable post-push HEAD after cleanup without restoring deleted metadata', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const head = await fixtures.rawGit(source, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'HEAD',
    ])
    const original = await FileSystem.readFile(head)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    afterPush = async () => {
      afterPush = undefined
      await FileSystem.unlink(head)
    }
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(
        state.retry,
        null,
        errors
          .assistedCommitErrorCauses(state.error)
          .map(error =>
            error instanceof Error
              ? `${error.stack ?? error.message}\n${
                  'args' in error ? JSON.stringify(error.args) : ''
                }`
              : String(error)
          )
          .join('\n')
      )
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      await assert.rejects(FileSystem.lstat(head), { code: 'ENOENT' })
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      await FileSystem.writeFile(head, original)
    }
  })

  it('stages publication into the real owned config despite a shadow introduced after native push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const shadow = join(await temporary.createTempDirectory(t), 'config-shadow')
    await FileSystem.writeFile(shadow, '')
    const config = await actualExec(
      ['config', '--file', shadow, '--', 'remote.origin.url', remote.path],
      source.path
    )
    assert.strictEqual(config.exitCode, 0, config.stderr)
    const previous = process.env.GIT_CONFIG
    capturePushes = true
    afterPush = async () => {
      afterPush = undefined
      process.env.GIT_CONFIG = shadow
    }
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.strictEqual(outcome.refreshError, undefined)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      const actual = await actualExec(
        ['config', '--local', '--get', 'branch.master.merge'],
        repository.path,
        { env: { GIT_CONFIG: undefined } }
      )
      assert.strictEqual(actual.exitCode, 0, actual.stderr)
      assert.strictEqual(actual.stdout.trim(), remote.remoteRef)
      const untouched = await actualExec(
        ['config', '--file', shadow, '--get', 'branch.master.merge'],
        repository.path,
        { env: { GIT_CONFIG: undefined } }
      )
      assert.strictEqual(untouched.exitCode, 1)
      assert.strictEqual(pushArguments.length, 1)
      assert.strictEqual(await fixtures.count(repository), 2)
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG
      } else {
        process.env.GIT_CONFIG = previous
      }
    }
  })

  for (const packed of [false, true]) {
    it(`expires publication intent when an external ref writer changes the ${
      packed ? 'packed' : 'loose'
    } branch during staging`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      const tree = await fixtures.rawGit(source, [
        'rev-parse',
        '--verify',
        'HEAD^{tree}',
      ])
      const external = await fixtures.rawGit(source, [
        'commit-tree',
        tree,
        '-p',
        remote.originalTip,
        '-m',
        'External independent tip',
      ])
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      capturePushes = true
      if (packed) {
        afterPush = async path => {
          afterPush = undefined
          const result = await actualExec(['pack-refs', '--all'], path)
          assert.strictEqual(result.exitCode, 0, result.stderr)
        }
      }
      let changed = false
      duringConfigWrite = async (_args, path) => {
        if (changed) {
          return
        }
        changed = true
        const result = await actualExec(
          ['update-ref', remote.branchRef, external],
          path
        )
        assert.strictEqual(result.exitCode, 0, result.stderr)
        if (packed) {
          const pack = await actualExec(['pack-refs', '--all'], path)
          assert.strictEqual(pack.exitCode, 0, pack.stderr)
        }
      }
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.strictEqual(changed, true)
      assert.strictEqual(await fixtures.tip(repository), external)
      const accepted = outcome.result.head.sha
      assert.ok(accepted !== null)
      assert.strictEqual(await remote.tip(), accepted)
      assert.strictEqual(
        await fixtures.rawGit(repository, ['cat-file', '-t', accepted]),
        'commit'
      )
      assert.strictEqual(
        (
          await actualExec(
            ['config', '--local', '--get', 'branch.master.merge'],
            repository.path
          )
        ).exitCode,
        1
      )
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('cleans retained publication resources under frozen admission before expiring broken linked routing', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const linked = join(await temporary.createTempDirectory(t), 'linked')
    await fixtures.rawGit(source, [
      'worktree',
      'add',
      '-b',
      'waiting-linked',
      '--',
      linked,
      'HEAD',
    ])
    const linkedRepository = new repositories.Repository(
      linked,
      source.id,
      null,
      false
    )
    const directory = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--absolute-git-dir',
    ])
    const common = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
    const missing = join(
      await temporary.createTempDirectory(t),
      'missing-common'
    )
    await FileSystem.writeFile(join(linked, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(linkedRepository)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    denyConfigKey = 'branch.waiting-linked.merge'
    denyUnlink = await fixtures.createPathMatcher(join(common, 'config.lock'))
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    await FileSystem.lstat(join(common, 'config.lock'))
    denyConfigKey = undefined
    denyUnlink = undefined
    await FileSystem.writeFile(join(directory, 'commondir'), `${missing}\n`)
    try {
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
      await assert.rejects(FileSystem.lstat(join(common, 'config.lock')), {
        code: 'ENOENT',
      })
      const settled = h.state(repository).changesState.assistedCommit
      assert.ok(settled.kind === 'error')
      assert.strictEqual(settled.retry, null)
      assert.strictEqual(
        await remote.read([
          'rev-parse',
          '--verify',
          'refs/heads/waiting-linked',
        ]),
        outcome.result.head.sha
      )
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      await FileSystem.writeFile(join(directory, 'commondir'), `${common}\n`)
      const current = h.state(repository).changesState.assistedCommit
      if (current.kind === 'error' && current.retry !== null) {
        await h.dispatcher.retryCopilotAssistedCommitRecovery(
          repository,
          state.runId
        )
      }
    }
  })

  it('expires missing-remote publication setup after acknowledged push without a permanent refresh lock', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    afterPush = async path => {
      afterPush = undefined
      const result = await actualExec(
        ['remote', 'remove', '--', 'origin'],
        path
      )
      assert.strictEqual(result.exitCode, 0, result.stderr)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, null)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(pushArguments.length, 1)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  for (const initial of ['empty', 'missing'] as const) {
    it(`rejects a publication tracking choice concurrently installed in ${initial} worktree configuration`, async t => {
      reset()
      t.after(reset)
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source, { publish: false })
      await fixtures.rawGit(source, [
        'config',
        '--local',
        '--',
        'extensions.worktreeConfig',
        'true',
      ])
      const worktreeConfig = await fixtures.rawGit(source, [
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'config.worktree',
      ])
      if (initial === 'empty') {
        await FileSystem.writeFile(worktreeConfig, '')
      }
      await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
      const h = await harness.createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      let changed = false
      duringConfigWrite = async (_args, path) => {
        if (changed) {
          return
        }
        changed = true
        const result = await actualExec(
          [
            'config',
            '--worktree',
            '--',
            'branch.master.merge',
            'refs/heads/external',
          ],
          path
        )
        assert.strictEqual(result.exitCode, 0, result.stderr)
      }
      capturePushes = true
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.strictEqual(changed, true)
      assert.strictEqual(
        (
          await actualExec(
            ['config', '--local', '--get', 'branch.master.merge'],
            repository.path
          )
        ).exitCode,
        1
      )
      assert.strictEqual(
        await fixtures.rawGit(repository, [
          'config',
          '--get-all',
          'branch.master.merge',
        ]),
        'refs/heads/external'
      )
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      assert.strictEqual(await remote.tip(), outcome.result.head.sha)
      assert.strictEqual(pushArguments.length, 1)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('never installs publication metadata into substituted linked-worktree common resources', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    const linked = join(await temporary.createTempDirectory(t), 'linked')
    await fixtures.rawGit(source, [
      'worktree',
      'add',
      '-b',
      'published-linked',
      '--',
      linked,
      'HEAD',
    ])
    const linkedRepository = new repositories.Repository(
      linked,
      source.id,
      null,
      false
    )
    const directory = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--absolute-git-dir',
    ])
    const common = await fixtures.rawGit(linkedRepository, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
    const replacement = join(
      await temporary.createTempDirectory(t),
      'copied-common'
    )
    await FileSystem.writeFile(join(linked, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(linkedRepository)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    let substituted = false
    beforePublicationConfig = async () => {
      beforePublicationConfig = undefined
      await FileSystem.cp(common, replacement, { recursive: true })
      await FileSystem.writeFile(
        join(directory, 'commondir'),
        `${replacement}\n`
      )
      substituted = true
    }
    try {
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      assert.ok(outcome.refreshError)
      assert.strictEqual(substituted, true)
      const tracking = await actualExec(
        [
          'config',
          '--no-includes',
          '--file',
          join(replacement, 'config'),
          '--get',
          'branch.published-linked.merge',
        ],
        repository.path
      )
      assert.strictEqual(tracking.exitCode, 1)
      assert.strictEqual(
        await remote.read([
          'rev-parse',
          '--verify',
          'refs/heads/published-linked',
        ]),
        outcome.result.head.sha
      )
      assert.strictEqual(await fixtures.count(repository), 2)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error')
      assert.strictEqual(state.retry, null)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    } finally {
      if (substituted) {
        await FileSystem.writeFile(join(directory, 'commondir'), `${common}\n`)
      }
    }
  })

  it('retains publication cleanup before expiring a stale tracking choice', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    duringConfigWrite = async (_args, path) => {
      duringConfigWrite = undefined
      assert.ok(
        (await FileSystem.lstat(join(path, '.git', 'config.lock'))).isFile()
      )
      await FileSystem.appendFile(
        join(path, '.git', 'config'),
        '\n[branch "master"]\n\tmerge = refs/heads/external\n'
      )
    }
    denyUnlink = await fixtures.createPathMatcher(
      join(repository.path, '.git', 'config.lock')
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'error'
    )
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)

    denyUnlink = undefined
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    const settled = h.state(repository).changesState.assistedCommit
    assert.ok(settled.kind === 'error')
    assert.strictEqual(settled.retry, null)
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--get',
        'branch.master.merge',
      ]),
      'refs/heads/external'
    )
    assert.strictEqual(pushArguments.length, 1)
    assert.strictEqual(await fixtures.count(repository), 2)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    await assert.rejects(
      FileSystem.lstat(join(repository.path, '.git', 'config.lock')),
      { code: 'ENOENT' }
    )
  })

  it('publishes upstream as one owned configuration transaction, excluding an external writer between keys', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    let attempted = false
    duringConfigWrite = async (_args, path) => {
      if (attempted) {
        return
      }
      attempted = true
      const change = await actualExec(
        [
          'config',
          '--local',
          '--',
          'branch.master.merge',
          'refs/heads/external',
        ],
        path
      )
      assert.notStrictEqual(change.exitCode, 0)
      assert.match(change.stderr.toString(), /lock|File exists/)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(outcome.refreshError, undefined)
    assert.strictEqual(attempted, true)
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--get',
        'branch.master.remote',
      ]),
      'origin'
    )
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--get',
        'branch.master.merge',
      ]),
      remote.remoteRef
    )
    assert.strictEqual(await remote.tip(), await fixtures.tip(repository))
  })

  it('expires stale publication setup without locking acknowledged history or pushing again', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    beforePush = async path => {
      beforePush = undefined
      const commit = await actualExec(
        ['commit', '--allow-empty', '-m', 'External after entry'],
        path
      )
      assert.strictEqual(commit.exitCode, 0)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, null)
    const fullTip = await fixtures.tip(repository)
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(await fixtures.count(repository), 3)
    assert.strictEqual(await fixtures.tip(repository), fullTip)
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.strictEqual(pushArguments.length, 1)
  })

  it('keeps frozen destination URLs out of every native argument, including offline verification', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(
      allArguments.some(args => args.some(arg => arg === remote.path)),
      false
    )
    assert.strictEqual(await remote.tip(), await fixtures.tip(repository))
  })

  it('retry refresh completes failed staged upstream setup without a partial installation or another native push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source, { publish: false })
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    denyConfigKey = 'branch.master.merge'
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.strictEqual(await remote.tip(), await fixtures.tip(repository))
    assert.strictEqual(
      (
        await actualExec(
          ['config', '--get', 'branch.master.remote'],
          repository.path
        )
      ).exitCode,
      1
    )
    assert.strictEqual(
      (
        await actualExec(
          ['config', '--get', 'branch.master.merge'],
          repository.path
        )
      ).exitCode,
      1
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    denyConfigKey = undefined
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(
      await fixtures.rawGit(repository, [
        'config',
        '--get',
        'branch.master.merge',
      ]),
      remote.remoteRef
    )
    assert.strictEqual(pushArguments.length, 1)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(await fixtures.count(repository), 2)
  })

  it('keeps every local SHA after an unknown remote response and retries only the same certified push', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const transportFailure = new Error(
      'Synthetic response lost after remote acceptance'
    )
    capturePushes = true
    reportPushFailure = transportFailure
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.ok(
      errors.assistedCommitErrorCauses(outcome.error).includes(transportFailure)
    )
    const fullTip = await fixtures.tip(repository)
    assert.strictEqual(await remote.tip(), fullTip)
    assert.strictEqual(await fixtures.count(repository), 2)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    assert.ok(retry?.kind === 'pushed')
    assert.strictEqual(await remote.tip(), fullTip)
    assert.strictEqual(await fixtures.tip(repository), fullTip)
    assert.strictEqual(await fixtures.count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(pushArguments.length, 2)
    for (const args of pushArguments) {
      assert.ok(args.includes('--no-force'))
      assert.ok(args.includes('--no-follow-tags'))
      assert.ok(args.includes('--recurse-submodules=no'))
      assert.strictEqual(args.includes('--force-with-lease'), false)
      assert.strictEqual(args.includes('--no-verify'), false)
      assert.deepStrictEqual(args.slice(args.indexOf('--')), [
        '--',
        'origin',
        `${fullTip}:${remote.remoteRef}`,
      ])
    }
  })

  it('never broadens the source to an external commit made after entry and never rolls it back', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    capturePushes = true
    beforePush = async path => {
      beforePush = undefined
      h.cancel(repository)
      const commit = await actualExec(
        ['commit', '--allow-empty', '-m', 'External after entry'],
        path
      )
      assert.strictEqual(commit.exitCode, 0, commit.stderr.toString())
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(await remote.tip(), outcome.result.head.sha)
    assert.notStrictEqual(
      await fixtures.tip(repository),
      outcome.result.head.sha
    )
    assert.strictEqual(await fixtures.count(repository), 3)
    assert.strictEqual(
      await fixtures.rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      'External after entry'
    )
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('never enters native push while pre-push fence cleanup retains ownership; retry is rollback only', async t => {
    reset()
    t.after(reset)
    const source = await fixtures.seed(t, { file: 'before\n' })
    const remote = await remotes.addBareRemote(t, source)
    await FileSystem.writeFile(join(source.path, 'file'), 'after\n')
    const h = await harness.createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const isHeadLock = await fixtures.createPathMatcher(
      join(repository.path, '.git', 'HEAD.lock')
    )
    let latched = false
    denyUnlink = async path => {
      if (!(await isHeadLock(path))) {
        return false
      }
      latched ||=
        h.state(repository).changesState.assistedCommit.kind ===
        'preparing-push'
      return latched
    }
    capturePushes = true
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'recovery')
    assert.strictEqual(pushArguments.length, 0)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(
      await h.dispatcher.retryCopilotAssistedCommitPush(
        repository,
        state.runId
      ),
      undefined
    )
    denyUnlink = undefined
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(await fixtures.count(repository), 1)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(pushArguments.length, 0)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })
})
