import assert from 'node:assert'
import { describe, it } from 'node:test'
import { exec } from 'dugite'
import {
  readFile,
  writeFile,
  unlink,
  symlink,
  mkdir,
  rename,
} from 'fs/promises'
import { basename, join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { addBareRemote } from '../../helpers/assisted-commit-push'
import {
  commitBytes,
  count,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
  tip,
  writeHook,
} from '../../helpers/assisted-commit'
import { splitResponse } from '../../helpers/copilot-assisted-commit'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import {
  AssistedCommitError,
  rollbackAssistedCommitTransaction,
} from '../../../src/lib/git/assisted-commit'
import { isRepositoryGitPaused } from '../../../src/lib/git/repository-operation'
import { DiffSelectionType } from '../../../src/models/diff'
import { PopupType } from '../../../src/models/popup'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { Repository } from '../../../src/models/repository'
import { getConfigValue } from '../../../src/lib/git/config'
import { createTempDirectory } from '../../helpers/temp'

describe('AppStore assisted push with real local remotes', () => {
  for (const route of [
    'native',
    'environment',
    'replace-base',
    'namespace',
    'shallow-parent',
    'shallow-alias',
  ] as const) {
    for (const empty of [false, true]) {
      const setup =
        route === 'native' || route === 'environment'
          ? `a missing ${route} graft parent`
          : route === 'shallow-parent'
          ? 'a missing optional shallow parent'
          : route === 'shallow-alias'
          ? 'an existing symbolic shallow route'
          : `an unsupported ${route} history namespace`
      it(`keeps valid local commits with ${setup}, empty ${empty}`, async t => {
        const source = await seed(t, { file: 'before\n' })
        const remote = await addBareRemote(t, source)
        const environmentName =
          route === 'replace-base'
            ? 'GIT_REPLACE_REF_BASE'
            : route === 'namespace'
            ? 'GIT_NAMESPACE'
            : route === 'shallow-parent'
            ? 'GIT_SHALLOW_FILE'
            : 'GIT_GRAFT_FILE'
        const previous = process.env[environmentName]
        if (route === 'native') {
          const info = join(source.path, '.git', 'info')
          await rename(info, `${info}-original`)
        } else if (route === 'environment') {
          process.env.GIT_GRAFT_FILE = join(
            source.path,
            '.git',
            'missing-graft-parent',
            'grafts'
          )
        } else if (route === 'shallow-parent') {
          process.env.GIT_SHALLOW_FILE = join(
            source.path,
            '.git',
            'missing-shallow-parent',
            'shallow'
          )
        } else if (route === 'shallow-alias') {
          const target = join(await createTempDirectory(t), 'shallow')
          await writeFile(target, '')
          await symlink(target, join(source.path, '.git', 'shallow'), 'file')
        } else {
          process.env[environmentName] =
            route === 'replace-base' ? 'refs/custom-replacements/' : 'custom'
        }
        try {
          if (!empty) {
            await writeFile(join(source.path, 'file'), 'after\n')
          }
          const h = await createAssistedCommitRunHarness(t)
          const repository = await h.register(source)
          await h.dispatcher.setCommitMessage(repository, {
            summary: 'Preserved manual draft',
            description: 'Preserved manual details',
            timestamp: Date.now(),
          })
          h.dispatcher.setPushAfterAssistedCommit(repository, true)
          h.dispatcher.updateCommitOptions(repository, {
            allowEmptyCommit: empty,
          })
          const request =
            await h.dispatcher.prepareCopilotAssistedCommitRequest(
              repository,
              h.request(repository)
            )
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            request
          )
          assert.ok(outcome.kind === 'push-error', JSON.stringify(outcome))
          assert.strictEqual(outcome.attempted, false)
          assert.strictEqual(await count(source), 2)
          assert.strictEqual(await remote.tip(), remote.originalTip)
          assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
          if (empty) {
            assert.strictEqual(
              await rawGit(source, ['show', '-s', '--format=%s', 'HEAD']),
              'Empty commit'
            )
          }
          assert.strictEqual(
            h.state(repository).changesState.commitMessage.summary,
            'Preserved manual draft'
          )
          assert.strictEqual(
            h.state(repository).changesState.commitMessage.description,
            'Preserved manual details'
          )
        } finally {
          if (previous === undefined) {
            delete process.env[environmentName]
          } else {
            process.env[environmentName] = previous
          }
        }
      })
    }
  }

  for (const route of ['quoted-environment', 'quoted-file']) {
    for (const empty of [false, true]) {
      it(`keeps valid local commits before refusing uncertifiable ${route}, empty ${empty}`, async t => {
        const source = await seed(t, { file: 'before\n' })
        const remote = await addBareRemote(t, source)
        const alternate = await seed(t, { alternate: 'Alternate objects\n' })
        const previous = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
        try {
          if (route === 'quoted-environment') {
            process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = `"${join(
              alternate.path,
              '.git',
              'objects'
            )}"`
          } else {
            const info = join(source.path, '.git', 'objects', 'info')
            await mkdir(info, { recursive: true })
            await writeFile(
              join(info, 'alternates'),
              `"${join(alternate.path, '.git', 'objects')}"\n`
            )
          }
          if (!empty) {
            await writeFile(join(source.path, 'file'), 'after\n')
          }
          const h = await createAssistedCommitRunHarness(t)
          const repository = await h.register(source)
          await h.dispatcher.setCommitMessage(repository, {
            summary: 'Manual draft stays',
            description: 'Manual details stay',
            timestamp: Date.now(),
          })
          h.dispatcher.setPushAfterAssistedCommit(repository, true)
          h.dispatcher.updateCommitOptions(repository, {
            allowEmptyCommit: empty,
          })
          const request =
            await h.dispatcher.prepareCopilotAssistedCommitRequest(
              repository,
              h.request(repository)
            )
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            request
          )
          assert.ok(outcome.kind === 'push-error', JSON.stringify(outcome))
          assert.strictEqual(outcome.attempted, false)
          assert.strictEqual(await count(repository), 2)
          assert.strictEqual(await remote.tip(), remote.originalTip)
          assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
          if (empty) {
            assert.strictEqual(
              await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
              'Empty commit'
            )
          }
          assert.strictEqual(
            h.state(repository).changesState.commitMessage.summary,
            'Manual draft stays'
          )
          assert.strictEqual(
            h.state(repository).changesState.commitMessage.description,
            'Manual details stay'
          )
        } finally {
          if (previous === undefined) {
            delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
          } else {
            process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = previous
          }
        }
      })
    }
  }

  for (const transitive of [false, true]) {
    for (const empty of [false, true]) {
      it(`keeps valid local commits without pushing an ignored missing alternate, transitive ${transitive}, empty ${empty}`, async t => {
        const source = await seed(t, { file: 'before\n' })
        const remote = await addBareRemote(t, source)
        const alternate = await seed(t, { alternate: 'Alternate objects\n' })
        const missing = join(await createTempDirectory(t), 'missing-objects')
        const sourceInfo = join(source.path, '.git', 'objects', 'info')
        const alternateInfo = join(alternate.path, '.git', 'objects', 'info')
        await mkdir(sourceInfo, { recursive: true })
        if (transitive) {
          await mkdir(alternateInfo, { recursive: true })
          await writeFile(join(alternateInfo, 'alternates'), `${missing}\n`)
        }
        await writeFile(
          join(sourceInfo, 'alternates'),
          `${transitive ? join(alternate.path, '.git', 'objects') : missing}\n`
        )
        const discovery = await exec(['count-objects', '-v'], source.path)
        assert.strictEqual(discovery.exitCode, 0)
        assert.match(
          discovery.stderr,
          /does not exist|unable to normalize alternate/
        )
        if (!empty) {
          await writeFile(join(source.path, 'file'), 'after\n')
        }
        const h = await createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        await h.dispatcher.setCommitMessage(repository, {
          summary: 'Manual draft stays',
          description: 'Manual details stay',
          timestamp: Date.now(),
        })
        h.dispatcher.setPushAfterAssistedCommit(repository, true)
        h.dispatcher.updateCommitOptions(repository, {
          allowEmptyCommit: empty,
        })
        const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
          repository,
          h.request(repository)
        )
        const outcome = await h.dispatcher.createCopilotAssistedCommits(
          repository,
          request
        )
        assert.ok(outcome.kind === 'push-error')
        assert.strictEqual(outcome.attempted, false)
        assert.strictEqual(await count(repository), 2)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
        assert.match(
          assistedCommitErrorCauses(outcome.error)
            .map(error =>
              error instanceof Error ? error.message : String(error)
            )
            .join('\n'),
          /does not exist|unable to normalize alternate/
        )
        if (empty) {
          assert.strictEqual(
            await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
            'Empty commit'
          )
        }
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.summary,
          'Manual draft stays'
        )
        assert.strictEqual(
          h.state(repository).changesState.commitMessage.description,
          'Manual details stay'
        )
      })
    }
  }

  for (const empty of [false, true]) {
    it(`finishes valid local commits before refusing an inactive nonregular include, empty ${empty}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const target = join(await createTempDirectory(t), 'config-directory')
      await mkdir(target)
      await rawGit(source, [
        'config',
        '--local',
        '--',
        'includeIf.onbranch:other-branch.path',
        target,
      ])
      if (!empty) {
        await writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.ok(outcome.kind === 'push-error')
      assert.strictEqual(outcome.attempted, false)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
      if (empty) {
        assert.strictEqual(
          await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
          'Empty commit'
        )
      }
    })
  }

  for (const empty of [false, true]) {
    it(`accepts valid local commits before refusing an inactive dangling include, empty ${empty}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const inactive = join(await createTempDirectory(t), 'inactive-config')
      await symlink(`${inactive}-missing`, inactive, 'file')
      await rawGit(source, [
        'config',
        '--local',
        '--',
        'includeIf.onbranch:other-branch.path',
        inactive,
      ])
      if (!empty) {
        await writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Manual draft stays',
        description: 'Manual details stay',
        timestamp: Date.now(),
      })
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.ok(outcome.kind === 'push-error')
      assert.strictEqual(outcome.attempted, false)
      assert.match(outcome.error.message, /configuration|normal Push/)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
      if (empty) {
        assert.strictEqual(
          await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
          'Empty commit'
        )
      }
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.summary,
        'Manual draft stays'
      )
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.description,
        'Manual details stay'
      )
    })
  }

  for (const scope of ['global', 'system'] as const) {
    for (const empty of [false, true]) {
      it(`accepts valid local commits before refusing a ${scope}-only remote with empty selection ${empty}`, async t => {
        const source = await seed(t, { file: 'before\n' })
        const remote = await addBareRemote(t, source, { publish: false })
        await rawGit(source, ['remote', 'remove', '--', 'origin'])
        const config = join(await createTempDirectory(t), 'config')
        const other = join(await createTempDirectory(t), 'empty-config')
        await writeFile(config, '')
        await writeFile(other, '')
        await rawGit(source, [
          'config',
          '--file',
          config,
          '--',
          'remote.origin.url',
          remote.path,
        ])
        const previous = [
          { name: 'GIT_CONFIG_GLOBAL', value: process.env.GIT_CONFIG_GLOBAL },
          { name: 'GIT_CONFIG_SYSTEM', value: process.env.GIT_CONFIG_SYSTEM },
          {
            name: 'GIT_CONFIG_NOSYSTEM',
            value: process.env.GIT_CONFIG_NOSYSTEM,
          },
        ]
        process.env.GIT_CONFIG_GLOBAL = scope === 'global' ? config : other
        process.env.GIT_CONFIG_SYSTEM = scope === 'system' ? config : other
        process.env.GIT_CONFIG_NOSYSTEM = scope === 'system' ? '0' : '1'
        try {
          if (!empty) {
            await writeFile(join(source.path, 'file'), 'after\n')
          }
          const h = await createAssistedCommitRunHarness(t)
          const repository = await h.register(source)
          h.dispatcher.setPushAfterAssistedCommit(repository, true)
          h.dispatcher.updateCommitOptions(repository, {
            allowEmptyCommit: empty,
          })
          const request =
            await h.dispatcher.prepareCopilotAssistedCommitRequest(
              repository,
              h.request(repository)
            )
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            request
          )
          assert.ok(outcome.kind === 'push-error')
          assert.strictEqual(outcome.attempted, false)
          assert.match(outcome.error.message, /remote|normal Push/)
          assert.strictEqual(await count(repository), 2)
          assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
          if (empty) {
            assert.strictEqual(
              await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
              'Empty commit'
            )
          }
          const result = await exec(
            [
              '--git-dir',
              remote.path,
              'show-ref',
              '--verify',
              '--quiet',
              remote.remoteRef,
            ],
            repository.path
          )
          assert.strictEqual(result.exitCode, 1)
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
  }

  it('uses native upstream configuration instead of a GIT_CONFIG-only shadow file', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await remote.read(['update-ref', 'refs/heads/other', remote.originalTip])
    await rawGit(source, ['fetch', '--', 'origin'])
    await rawGit(source, [
      'config',
      '--local',
      '--',
      'branch.master.merge',
      'refs/heads/other',
    ])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const shadow = join(await createTempDirectory(t), 'config-shadow')
    await writeFile(shadow, '')
    await rawGit(source, [
      'config',
      '--file',
      shadow,
      '--',
      'remote.origin.url',
      remote.path,
    ])
    const previous = process.env.GIT_CONFIG
    process.env.GIT_CONFIG = shadow
    try {
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.ok(
        outcome.kind === 'pushed',
        outcome.kind === 'error' || outcome.kind === 'push-error'
          ? assistedCommitErrorCauses(outcome.error)
              .map(error =>
                error instanceof Error
                  ? `${error.stack ?? error.message}\n${
                      'args' in error ? JSON.stringify(error.args) : ''
                    }`
                  : String(error)
              )
              .join('\n')
          : JSON.stringify(outcome)
      )
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(
        await remote.read(['rev-parse', '--verify', 'refs/heads/other']),
        await tip(repository)
      )
      assert.strictEqual(
        await rawGit(
          repository,
          ['config', '--local', '--get', 'branch.master.merge'],
          { env: { GIT_CONFIG: undefined } }
        ),
        'refs/heads/other'
      )
      assert.strictEqual(await count(repository), 2)
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_CONFIG
      } else {
        process.env.GIT_CONFIG = previous
      }
    }
  })

  for (const empty of [false, true]) {
    it(`accepts valid local commits and refuses an invalid upstream with empty selection ${empty}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      if (!empty) {
        await writeFile(join(source.path, 'file'), 'after\n')
      }
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Preserved draft',
        description: 'Preserved description',
        timestamp: Date.now(),
      })
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: empty })
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      await rawGit(repository, [
        'config',
        '--local',
        '--',
        'branch.master.merge',
        'refs/heads/bad..name',
      ])
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.ok(outcome.kind === 'push-error')
      assert.strictEqual(outcome.attempted, false)
      assert.match(outcome.error.message, /invalid.*upstream|upstream.*invalid/)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(h.propose.mock.callCount(), empty ? 0 : 1)
      if (empty) {
        assert.strictEqual(
          await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
          'Empty commit'
        )
      }
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.summary,
        'Preserved draft'
      )
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.description,
        'Preserved description'
      )
    })
  }

  it('refuses unsupported runtime-prefix includes after accepting all valid local commits', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await rawGit(source, [
      'config',
      '--local',
      '--',
      'include.path',
      `%(prefix)/desktop-assisted-${basename(source.path)}-missing-config`,
    ])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
      repository,
      h.request(repository)
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      request
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, false)
    assert.match(outcome.error.message, /prefix|included configuration/)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('defaults off, creates local commits, and does not enter a pre-push hook or update the remote', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    await writeHook(
      source,
      'pre-push',
      'echo attempted > push-attempted\nexit 0'
    )
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    await assert.rejects(readFile(join(source.path, 'push-attempted')), {
      code: 'ENOENT',
    })
    assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
  })

  it('never auto-pushes a manual commit even when this repository opted into assisted push', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    h.dispatcher.setCommitMode(repository, 'manual')
    const refresh = t.mock.method(h.appStore, '_refreshRepository')
    assert.strictEqual(
      await h.dispatcher.commitIncludedChanges(repository, {
        summary: 'Manual commit',
        description: '',
      }),
      true
    )
    await Promise.all(refresh.mock.calls.map(call => call.result))
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(
      h.state(repository).changesState.pushAfterAssistedCommit,
      true
    )
  })

  it('rejects a preference changed after first-click preparation rather than silently adding a push', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
      repository,
      h.request(repository)
    )
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      request
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  for (const phase of [
    'capturing',
    'analyzing',
    'finishing',
    'preparing-push',
  ] as const) {
    it(`cancellation during ${phase} restores every owned local commit and never pushes`, async t => {
      const source = await seed(t, { one: 'one\n', two: 'two\n' })
      const remote = await addBareRemote(t, source)
      await writeFile(join(source.path, 'one'), 'ONE\n')
      await writeFile(join(source.path, 'two'), 'TWO\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const originalIndex = await optionalBytes(await indexPath(repository))
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      h.propose.mock.mockImplementation(async (_account, analysis) =>
        splitResponse(analysis)
      )
      const subscription = h.appStore.onDidUpdate(() => {
        if (h.state(repository).changesState.assistedCommit.kind === phase) {
          h.cancel(repository)
        }
      })
      t.after(() => subscription.dispose())
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(
        outcome.kind,
        'cancelled',
        outcome.kind === 'error'
          ? assistedCommitErrorCauses(outcome.error)
              .map(error =>
                error instanceof Error ? error.stack : String(error)
              )
              .join('\n')
          : undefined
      )
      assert.strictEqual(await count(repository), 1)
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.deepStrictEqual(
        await optionalBytes(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(h.request(repository).files.length, 2)
      assert.strictEqual(h.commits.mock.callCount(), 0)
      assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
      assert.strictEqual(isRepositoryGitPaused(repository.path), false)
      assert.strictEqual(
        await readFile(join(source.path, 'one'), 'utf8'),
        'ONE\n'
      )
      assert.strictEqual(
        await readFile(join(source.path, 'two'), 'utf8'),
        'TWO\n'
      )
    })
  }

  it('never starts a push on model failure or accepts rolled-back commit statistics', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const failure = new Error('Synthetic model failure')
    h.propose.mock.mockImplementation(async () => {
      throw failure
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'error')
    assert.ok(assistedCommitErrorCauses(outcome.error).includes(failure))
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('does not inherit mirror, forced wildcard refspecs, or annotated follow-tags configuration', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const tree = await rawGit(source, ['rev-parse', '--verify', 'HEAD^{tree}'])
    const other = await rawGit(source, [
      'commit-tree',
      tree,
      '-p',
      remote.originalTip,
      '-m',
      'Unrelated branch',
    ])
    await rawGit(source, ['update-ref', 'refs/heads/unrelated', other])
    await rawGit(source, [
      'tag',
      '-a',
      '-m',
      'Unrelated annotated tag',
      '--',
      'unrelated',
      'HEAD',
    ])
    await rawGit(source, ['config', '--local', 'remote.origin.mirror', 'true'])
    await rawGit(source, [
      'config',
      '--local',
      'remote.origin.push',
      '+refs/heads/*:refs/heads/*',
    ])
    await rawGit(source, ['config', '--local', 'push.followTags', 'true'])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(
      outcome.kind === 'pushed',
      outcome.kind === 'push-error'
        ? outcome.error.message
        : JSON.stringify(outcome)
    )
    assert.strictEqual(outcome.refreshError, undefined)
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.strictEqual(
      await remote.read(['for-each-ref', '--format=%(refname)', 'refs/heads']),
      remote.remoteRef
    )
    assert.strictEqual(await remote.read(['tag', '--list']), '')
  })

  it('uses the actual push URL rather than the fetch URL for a configured destination', async t => {
    const source = await seed(t, { file: 'before\n' })
    const fetchRemote = await addBareRemote(t, source)
    const pushRemote = await addBareRemote(t, source, {
      name: 'destination',
      publish: false,
    })
    await rawGit(source, [
      'config',
      '--local',
      'remote.origin.pushurl',
      pushRemote.path,
    ])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(await pushRemote.tip(), await tip(repository))
    assert.strictEqual(await fetchRemote.tip(), fetchRemote.originalTip)
  })

  for (const explicit of [false, true]) {
    it(`preserves pushInsteadOf semantics with explicit push URL ${explicit}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const fetchRemote = await addBareRemote(t, source)
      const pushRemote = await addBareRemote(t, source, {
        name: 'destination',
        publish: false,
      })
      await rawGit(source, [
        'push',
        '--',
        'destination',
        `${fetchRemote.branchRef}:${fetchRemote.remoteRef}`,
      ])
      await rawGit(source, [
        'config',
        '--local',
        '--',
        `url.${pushRemote.path}.pushInsteadOf`,
        fetchRemote.path,
      ])
      if (explicit) {
        await rawGit(source, [
          'config',
          '--local',
          '--',
          'remote.origin.pushurl',
          fetchRemote.path,
        ])
      }
      assert.strictEqual(
        await rawGit(source, ['remote', 'get-url', '--push', '--', 'origin']),
        explicit ? fetchRemote.path : pushRemote.path
      )
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'pushed')
      const accepted = await tip(repository)
      assert.strictEqual(
        await fetchRemote.tip(),
        explicit ? accepted : fetchRemote.originalTip
      )
      assert.strictEqual(
        await pushRemote.tip(),
        explicit ? pushRemote.originalTip : accepted
      )
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(h.propose.mock.callCount(), 1)
    })
  }

  it('refuses multiple configured merge targets instead of selecting a different upstream from normal Push', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await remote.read(['update-ref', 'refs/heads/other', remote.originalTip])
    await rawGit(source, ['fetch', '--', 'origin'])
    await rawGit(source, [
      'config',
      '--local',
      '--add',
      'branch.master.merge',
      'refs/heads/other',
    ])
    assert.strictEqual(
      await rawGit(source, [
        'rev-parse',
        '--symbolic-full-name',
        '@{upstream}',
      ]),
      'refs/remotes/origin/master'
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, false)
    assert.match(outcome.error.message, /multiple.*upstream|one.*upstream/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(
      await remote.read(['rev-parse', '--verify', 'refs/heads/other']),
      remote.originalTip
    )
    assert.strictEqual(await count(repository), 2)
  })

  it('refuses a destination changed during analysis, while accepting every valid local planned commit', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    const original = await addBareRemote(t, source)
    const replacement = await addBareRemote(t, source, {
      name: 'replacement',
      publish: false,
    })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await rawGit(repository, [
        'remote',
        'set-url',
        '--',
        'origin',
        replacement.path,
      ])
      return splitResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, false)
    assert.match(outcome.error.message, /push destination changed/)
    assert.doesNotMatch(outcome.error.message, /were pushed/)
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(await original.tip(), original.originalTip)
    assert.strictEqual(
      await replacement.read(['for-each-ref', '--format=%(refname)']),
      ''
    )
    assert.strictEqual(h.commits.mock.callCount(), 2)
  })

  it('retains all local commits and refuses automatic push to multiple destinations', async t => {
    const source = await seed(t, { file: 'before\n' })
    const first = await addBareRemote(t, source)
    const second = await addBareRemote(t, source, {
      name: 'second',
      publish: false,
    })
    await rawGit(source, [
      'config',
      '--local',
      '--add',
      'remote.origin.pushurl',
      first.path,
    ])
    await rawGit(source, [
      'config',
      '--local',
      '--add',
      'remote.origin.pushurl',
      second.path,
    ])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, false)
    assert.match(outcome.error.message, /one configured push destination/)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await first.tip(), first.originalTip)
    assert.strictEqual(
      await second.read(['for-each-ref', '--format=%(refname)']),
      ''
    )
  })

  it('pushes every complete planned commit, with trailers, but never unselected work, staging or tags', async t => {
    const source = await seed(t, {
      one: 'one\n',
      two: 'two\n',
      other: 'other\n',
    })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    await writeFile(join(source.path, 'other'), 'OTHER\n')
    await rawGit(source, ['add', '--', 'other'])
    await rawGit(source, [
      'tag',
      '-a',
      '-m',
      'Keep this annotated tag local',
      '--',
      'unrelated-tag',
      'HEAD',
    ])
    await rawGit(source, ['config', '--local', 'push.followTags', 'true'])
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const other = h
      .state(repository)
      .changesState.workingDirectory.files.find(file => file.path === 'other')
    assert.ok(other)
    await h.dispatcher.changeFileIncluded(repository, other, false)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository, {
        trailers: [
          {
            token: 'Co-Authored-By',
            value: 'Known Author <known@example.invalid>',
          },
        ],
      })
    )
    assert.ok(outcome.kind === 'pushed', JSON.stringify(outcome))
    assert.strictEqual(outcome.refreshError, undefined)
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.strictEqual(await remote.count(), 3)
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 2)
    assert.deepStrictEqual(
      (
        await remote.read([
          'rev-list',
          '--reverse',
          `${remote.originalTip}..${remote.remoteRef}`,
          '--',
        ])
      ).split('\n'),
      outcome.result.commits
    )
    for (const sha of outcome.result.commits) {
      const message = await remote.read(['show', '-s', '--format=%B', sha])
      assert.match(
        message,
        /Co-Authored-By: Known Author <known@example.invalid>/
      )
      assert.match(message, /Signed-off-by:/)
    }
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'other'),
      Buffer.from('other\n')
    )
    assert.strictEqual(
      await readFile(join(source.path, 'other'), 'utf8'),
      'OTHER\n'
    )
    assert.strictEqual(await remote.read(['tag', '--list']), '')
    assert.strictEqual(
      await rawGit(repository, ['diff', '--cached', '--name-only', '--']),
      ''
    )
    assert.strictEqual(
      h
        .state(repository)
        .changesState.workingDirectory.files.find(file => file.path === 'other')
        ?.selection.getSelectionType(),
      DiffSelectionType.None
    )
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
    await assert.rejects(
      rollbackAssistedCommitTransaction(outcome.result),
      error => error instanceof AssistedCommitError && error.code === 'disposed'
    )
  })

  it('pushes exactly one Empty commit with zero analysis and preserves the complete manual draft', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'unselected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    await h.dispatcher.changeIncludeAllFiles(repository, false)
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const draft = {
      ...DefaultCommitMessage,
      summary: 'Manual title',
      description: 'Manual body',
      timestamp: Date.now(),
    }
    await h.dispatcher.setCommitMessage(repository, draft)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(outcome.refreshError, undefined)
    assert.strictEqual(await remote.count(), 2)
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.strictEqual(
      await remote.read(['show', '-s', '--format=%s', remote.remoteRef]),
      'Empty commit'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.planner.createClient.mock.callCount(), 0)
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      draft
    )
    assert.strictEqual(h.state(repository).allowEmptyCommit, false)
    assert.strictEqual(
      await readFile(join(source.path, 'file'), 'utf8'),
      'unselected\n'
    )
  })

  it('publishes only the new branch to its configured remote and configures normal upstream tracking', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source, { publish: false })
    await rawGit(source, ['checkout', '-b', 'new-assisted-branch'])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.strictEqual(outcome.refreshError, undefined)
    assert.strictEqual(
      await remote.read([
        'rev-parse',
        '--verify',
        'refs/heads/new-assisted-branch',
      ]),
      await tip(repository)
    )
    assert.strictEqual(
      await remote.read(['for-each-ref', '--format=%(refname)', 'refs/heads']),
      'refs/heads/new-assisted-branch'
    )
    assert.strictEqual(
      await rawGit(repository, [
        'config',
        '--get',
        'branch.new-assisted-branch.remote',
      ]),
      'origin'
    )
    assert.strictEqual(
      await rawGit(repository, [
        'config',
        '--get',
        'branch.new-assisted-branch.merge',
      ]),
      'refs/heads/new-assisted-branch'
    )
  })

  it('finishes publication tracking before a failed post-push fetch, without pushing again on refresh retry', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source, { publish: false })
    await rawGit(source, [
      'config',
      '--local',
      'remote.origin.pushurl',
      remote.path,
    ])
    await rawGit(source, [
      'remote',
      'set-url',
      '--',
      'origin',
      join(source.path, 'missing-fetch-repository'),
    ])
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.strictEqual(
      await getConfigValue(repository, 'branch.master.remote'),
      'origin'
    )
    assert.strictEqual(
      await getConfigValue(repository, 'branch.master.merge'),
      remote.remoteRef
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('keeps all local commits after remote rejection and retry pushes the same SHAs with no new model or commits', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "fixture push rejected" >&2\nexit 1\n',
      { mode: 0o755 }
    )
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, true)
    assert.match(outcome.error.message, /fixture push rejected/)
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(
      h.state(repository).changesState.workingDirectory.files.length,
      0
    )
    const fullTip = await tip(repository)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    await unlink(join(remote.path, 'hooks', 'pre-receive'))
    const first = h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    const second = h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    assert.strictEqual(first, second)
    const retry = await first
    assert.ok(retry?.kind === 'pushed', JSON.stringify(retry))
    assert.strictEqual(await tip(repository), fullTip)
    assert.strictEqual(await remote.tip(), fullTip)
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 2)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  it('keeps commits without publishing a repository when there is no remote', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    assert.strictEqual(outcome.attempted, false)
    assert.match(outcome.error.message, /Configure a remote/)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      h.appStore['popupManager'].areTherePopupsOfType(
        PopupType.PublishRepository
      ),
      false
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(h.state(repository).isPushPullFetchInProgress, false)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
  })

  it('reports post-push refresh failure as remote success and offers refresh, never rollback or another push', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    const failure = new Error('Synthetic refresh failed after remote success')
    let fail = true
    t.mock.method(
      h.appStore,
      '_refreshRepository',
      async (repo: Repository) => {
        const state = h.state(repository).changesState.assistedCommit
        if (fail && state.kind === 'pushing' && state.phase === 'refresh') {
          throw failure
        }
        return refresh(repo)
      }
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'pushed')
    assert.ok(outcome.refreshError)
    assert.ok(assistedCommitErrorCauses(outcome.refreshError).includes(failure))
    assert.strictEqual(await remote.tip(), await tip(repository))
    assert.strictEqual(await count(repository), 2)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.strictEqual(state.retry, 'refresh')
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].get(repository.id)?.recoveryCapability,
      undefined
    )
    assert.strictEqual(
      await h.dispatcher.retryCopilotAssistedCommitPush(
        repository,
        state.runId
      ),
      undefined
    )
    fail = false
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })
})
