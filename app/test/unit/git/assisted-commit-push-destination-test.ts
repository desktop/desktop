import assert from 'node:assert'
import { describe, it } from 'node:test'
import { cp, mkdir, symlink, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { Repository } from '../../../src/models/repository'
import {
  prepareAssistedCommitPushDestination,
  readAssistedCommitPushDestination,
  verifyAssistedCommitPushOwner,
  captureAssistedCommitPushEnvironment,
} from '../../../src/lib/git/assisted-commit-push'
import { addBareRemote } from '../../helpers/assisted-commit-push'
import { rawGit, seed, tip } from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'
import { acquireAssistedCommitGitLease } from '../../../src/lib/git/repository-operation'

describe('frozen assisted push destination inputs', () => {
  it('retains Dugite installation authority in entry and follow-up environment certificates', async () => {
    const before = captureAssistedCommitPushEnvironment({
      LOCAL_GIT_DIRECTORY: 'Original native installation',
    })
    const after = captureAssistedCommitPushEnvironment({
      LOCAL_GIT_DIRECTORY: 'Different native installation',
    })
    assert.notStrictEqual(before.full, after.full)
    assert.notStrictEqual(before.routing, after.routing)
  })
  it('certifies lowercase indexed native configuration on Windows without changing POSIX semantics', async () => {
    const original = {
      GIT_CONFIG_COUNT: '1',
      git_config_key_0: 'remote.origin.fetch',
      git_config_value_0: '+refs/heads/master:refs/remotes/origin/master',
    }
    const changed = {
      ...original,
      git_config_value_0: '+refs/heads/master:refs/heads/unrelated',
    }
    const before = captureAssistedCommitPushEnvironment(original, 'win32')
    const after = captureAssistedCommitPushEnvironment(changed, 'win32')
    assert.notStrictEqual(before.full, after.full)
    assert.notStrictEqual(before.routing, after.routing)
    assert.deepStrictEqual(
      captureAssistedCommitPushEnvironment(original, 'darwin'),
      captureAssistedCommitPushEnvironment(changed, 'darwin')
    )
  })

  it('treats Windows environment spelling changes as the same native authority', async () => {
    assert.deepStrictEqual(
      captureAssistedCommitPushEnvironment(
        {
          Git_Config_Count: '1',
          git_config_key_0: 'remote.origin.fetch',
          git_config_value_0: 'Safe',
          Home: 'Synthetic home',
        },
        'win32'
      ),
      captureAssistedCommitPushEnvironment(
        {
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'remote.origin.fetch',
          GIT_CONFIG_VALUE_0: 'Safe',
          HOME: 'Synthetic home',
        },
        'win32'
      )
    )
  })

  it('refuses an existing symbolic branch alias without weakening local transaction restrictions', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await rawGit(source, ['branch', '--', 'other', remote.originalTip])
    await rawGit(source, ['symbolic-ref', remote.branchRef, 'refs/heads/other'])
    const destination = await readAssistedCommitPushDestination(
      source,
      remote.branchRef
    )
    assert.ok(destination.kind === 'unavailable')
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(
      await rawGit(source, ['symbolic-ref', '--no-recurse', remote.branchRef]),
      'refs/heads/other'
    )
  })

  it('fences an existing alternate-routing file after destination preparation', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const original = await seed(t, { original: 'Original alternate\n' })
    const foreign = await seed(t, { foreign: 'Foreign alternate\n' })
    const info = join(source.path, '.git', 'objects', 'info')
    await mkdir(info, { recursive: true })
    const path = join(info, 'alternates')
    await writeFile(path, `${join(original.path, '.git', 'objects')}\n`)
    const destination = await readAssistedCommitPushDestination(
      source,
      remote.branchRef
    )
    const enter = await prepareAssistedCommitPushDestination(
      source,
      destination,
      { ref: remote.branchRef, sha: await tip(source) }
    )
    await writeFile(path, `${join(foreign.path, '.git', 'objects')}\n`)
    assert.throws(enter, /changed/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  it('retains the explicit common-directory route independently of native canonical discovery', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const foreign = await seed(t, { unrelated: 'Foreign checkout\n' })
    const route = join(await createTempDirectory(t), 'common-dir')
    await symlink(join(source.path, '.git'), route, 'junction')
    const previous = process.env.GIT_COMMON_DIR
    process.env.GIT_COMMON_DIR = route
    try {
      const destination = await readAssistedCommitPushDestination(
        source,
        remote.branchRef
      )
      assert.ok(destination.kind === 'configured')
      assert.ok(destination.routingPaths.includes(route))
      verifyAssistedCommitPushOwner(destination)
      await unlink(route)
      await symlink(join(foreign.path, '.git'), route, 'junction')
      assert.throws(() => verifyAssistedCommitPushOwner(destination), /changed/)
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_COMMON_DIR
      } else {
        process.env.GIT_COMMON_DIR = previous
      }
    }
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  it('retains a valid requested alias certificate through native entry', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const foreign = await seed(t, { unrelated: 'Foreign checkout\n' })
    const destination = await readAssistedCommitPushDestination(
      source,
      remote.branchRef
    )
    const route = join(await createTempDirectory(t), 'requested-alias')
    await symlink(source.path, route, 'junction')
    const requested = new Repository(route, source.id, null, false)
    const enter = await prepareAssistedCommitPushDestination(
      requested,
      destination,
      { ref: remote.branchRef, sha: await tip(source) }
    )
    enter()
    await unlink(route)
    await symlink(foreign.path, route, 'junction')
    assert.throws(enter, /changed|alias/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  it('refuses a requested alias before waiting on another repository owner', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const foreign = await seed(t, { unrelated: 'Foreign checkout\n' })
    const destination = await readAssistedCommitPushDestination(
      source,
      remote.branchRef
    )
    const head = { ref: remote.branchRef, sha: await tip(source) }
    const route = join(await createTempDirectory(t), 'requested-alias')
    await symlink(foreign.path, route, 'junction')
    const requested = new Repository(route, source.id, null, false)
    const sourceLease = await acquireAssistedCommitGitLease(source.path)
    const foreignLease = await acquireAssistedCommitGitLease(foreign.path)
    let timer: NodeJS.Timeout | undefined
    const prepared = sourceLease
      .run(() =>
        prepareAssistedCommitPushDestination(requested, destination, head)
      )
      .then(
        () => ({ kind: 'accepted' } as const),
        error => ({ kind: 'refused', error } as const)
      )
    try {
      const outcome = await Promise.race([
        prepared,
        new Promise<{ readonly kind: 'blocked' }>(resolve => {
          timer = setTimeout(() => resolve({ kind: 'blocked' }), 1000)
        }),
      ])
      assert.ok(outcome.kind === 'refused', outcome.kind)
      assert.match(
        outcome.error instanceof Error ? outcome.error.message : '',
        /alias|original/
      )
    } finally {
      clearTimeout(timer)
      foreignLease.release()
      await prepared
      sourceLease.release()
    }
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  for (const initial of ['empty', 'missing'] as const) {
    it(`fences ${initial} enabled system configuration independently of emitted entries`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const target = join(await createTempDirectory(t), 'system-config')
      if (initial === 'empty') {
        await writeFile(target, '')
      }
      const previous = [
        { name: 'GIT_CONFIG_SYSTEM', value: process.env.GIT_CONFIG_SYSTEM },
        { name: 'GIT_CONFIG_NOSYSTEM', value: process.env.GIT_CONFIG_NOSYSTEM },
      ]
      t.after(() => {
        for (const { name, value } of previous) {
          if (value === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = value
          }
        }
      })
      process.env.GIT_CONFIG_SYSTEM = target
      process.env.GIT_CONFIG_NOSYSTEM = '0'
      const destination = await readAssistedCommitPushDestination(
        source,
        remote.branchRef
      )
      const enter = await prepareAssistedCommitPushDestination(
        source,
        destination,
        { ref: remote.branchRef, sha: await tip(source) }
      )
      await writeFile(
        target,
        `[url "replacement"]\n\tinsteadOf = ${remote.path}\n`
      )
      assert.throws(enter, /changed/)
      assert.strictEqual(await remote.tip(), remote.originalTip)
    })
  }

  for (const initial of ['empty', 'missing'] as const) {
    it(`fences an ${initial} enabled include before it can rewrite the destination`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const target = join(await createTempDirectory(t), 'included-config')
      if (initial === 'empty') {
        await writeFile(target, '')
      }
      await rawGit(source, ['config', '--local', 'include.path', target])
      const destination = await readAssistedCommitPushDestination(
        source,
        remote.branchRef
      )
      const enter = await prepareAssistedCommitPushDestination(
        source,
        destination,
        { ref: remote.branchRef, sha: await tip(source) }
      )
      await writeFile(
        target,
        `[url "replacement"]\n\tinsteadOf = ${remote.path}\n`
      )
      assert.throws(enter, /changed/)
    })
  }

  it('fences linked-worktree commondir routing independently of unchanged HEAD and root paths', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const linked = join(await createTempDirectory(t), 'linked')
    await rawGit(source, [
      'worktree',
      'add',
      '-b',
      'linked-branch',
      '--',
      linked,
      'HEAD',
    ])
    const repository = new Repository(linked, source.id, null, false)
    const ref = 'refs/heads/linked-branch'
    const destination = await readAssistedCommitPushDestination(repository, ref)
    const enter = await prepareAssistedCommitPushDestination(
      repository,
      destination,
      { ref, sha: await tip(repository) }
    )
    const directory = await rawGit(repository, [
      'rev-parse',
      '--absolute-git-dir',
    ])
    const originalCommon = await rawGit(repository, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
    const replacement = join(await createTempDirectory(t), 'copied-common')
    await cp(originalCommon, replacement, { recursive: true })
    await writeFile(join(directory, 'commondir'), `${replacement}\n`)
    assert.throws(enter, /changed/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })
})
