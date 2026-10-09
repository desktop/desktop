import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository } from '../../helpers/repositories'
import {
  getBranches,
  getBranchesDifferingFromUpstream,
} from '../../../src/lib/git/for-each-ref'
import { Branch } from '../../../src/models/branch'
import { fastForwardBranches } from '../../../src/lib/git'
import * as Path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { fetch } from '../../../src/lib/git/fetch'
import { rawGit, seed, tip } from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'

function branchWithName(branches: ReadonlyArray<Branch>, name: string) {
  return branches.filter(branch => branch.name === name)[0]
}

describe('git/fetch', () => {
  for (const recurseSubmodules of [true, false]) {
    it(`preserves native submodule fetch behavior, recursion ${recurseSubmodules}`, async t => {
      const child = await seed(t, { child: 'before\n' })
      const parent = await seed(t, { file: 'Parent file\n' })
      await rawGit(parent, [
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        '--',
        child.path,
        'module',
      ])
      await rawGit(parent, ['commit', '-m', 'Add clean submodule'])
      const path = await createTempDirectory(t)
      await rawGit(parent, ['clone', '--', parent.path, path])
      const repository = new Repository(path, -1, null, false)
      await rawGit(repository, [
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'update',
        '--init',
      ])
      const module = new Repository(Path.join(path, 'module'), -1, null, false)
      await rawGit(module, [
        'config',
        '--local',
        '--',
        'protocol.file.allow',
        'always',
      ])
      await rawGit(repository, [
        'config',
        '--local',
        '--',
        'fetch.recurseSubmodules',
        'true',
      ])
      const childRef = await rawGit(child, ['symbolic-ref', 'HEAD'])
      const tracking = `refs/remotes/origin/${childRef.slice(
        'refs/heads/'.length
      )}`
      const original = await tip(child)
      const parentRef = await rawGit(parent, ['symbolic-ref', 'HEAD'])
      await rawGit(repository, [
        'branch',
        '--track',
        '--',
        'local-behind',
        `refs/remotes/origin/${parentRef.slice('refs/heads/'.length)}`,
      ])
      await writeFile(Path.join(child.path, 'child'), 'Upstream child\n')
      await rawGit(child, ['add', '--', 'child'])
      await rawGit(child, ['commit', '-m', 'Advance submodule'])
      const latest = await tip(child)
      await rawGit(parent, [
        'update-index',
        '--cacheinfo',
        `160000,${latest},module`,
      ])
      await rawGit(parent, ['commit', '-m', 'Advance submodule link'])
      const remote = { name: 'origin', url: parent.path }
      if (recurseSubmodules) {
        await fetch(repository, remote)
      } else {
        await fetch(repository, remote, undefined, false, false)
      }
      const branches = await getBranchesDifferingFromUpstream(repository)
      if (recurseSubmodules) {
        await fastForwardBranches(repository, branches)
      } else {
        await fastForwardBranches(repository, branches, false)
      }
      assert.strictEqual(
        await rawGit(module, ['rev-parse', '--verify', tracking]),
        recurseSubmodules ? latest : original
      )
      assert.strictEqual(await tip(module), original)
      assert.strictEqual(
        await readFile(Path.join(module.path, 'child'), 'utf8'),
        'before\n'
      )
      assert.strictEqual(
        await rawGit(repository, [
          'rev-parse',
          '--verify',
          'refs/heads/local-behind',
        ]),
        await tip(parent)
      )
    })
  }

  describe('fastForwardBranches', () => {
    it('fast-forwards branches using fetch', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-non-updated-branches'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      await fastForwardBranches(repository, eligibleBranches)

      const resultBranches = await getBranches(repository)

      // Only the branch behind was updated to match its upstream
      const branchBehind = branchWithName(resultBranches, 'branch-behind')
      assert(branchBehind.upstream !== null)

      const branchBehindUpstream = branchWithName(
        resultBranches,
        branchBehind.upstream
      )
      assert.equal(branchBehindUpstream.tip.sha, branchBehind.tip.sha)

      // The branch ahead is still ahead
      const branchAhead = branchWithName(resultBranches, 'branch-ahead')
      assert(branchAhead.upstream !== null)

      const branchAheadUpstream = branchWithName(
        resultBranches,
        branchAhead.upstream
      )

      assert.notEqual(branchAheadUpstream.tip.sha, branchAhead.tip.sha)

      // The branch ahead and behind is still ahead and behind
      const branchAheadAndBehind = branchWithName(
        resultBranches,
        'branch-ahead-and-behind'
      )
      assert(branchAheadAndBehind.upstream !== null)

      const branchAheadAndBehindUpstream = branchWithName(
        resultBranches,
        branchAheadAndBehind.upstream
      )
      assert.notEqual(
        branchAheadAndBehindUpstream.tip.sha,
        branchAheadAndBehind.tip.sha
      )

      // The main branch hasn't been updated, since it's the current branch
      const mainBranch = branchWithName(resultBranches, 'main')
      assert(mainBranch.upstream !== null)

      const mainUpstream = branchWithName(resultBranches, mainBranch.upstream)
      assert.notEqual(mainUpstream.tip.sha, mainBranch.tip.sha)

      // The up-to-date branch is still matching its upstream
      const upToDateBranch = branchWithName(resultBranches, 'branch-up-to-date')
      assert(upToDateBranch.upstream !== null)
      const upToDateBranchUpstream = branchWithName(
        resultBranches,
        upToDateBranch.upstream
      )
      assert.equal(upToDateBranchUpstream.tip.sha, upToDateBranch.tip.sha)
    })

    // We want to avoid messing with the FETCH_HEAD file. Normally, it shouldn't
    // be something users would rely on, but we want to be good gitizens
    // (:badpundog:) when possible.
    it('does not change FETCH_HEAD after fast-forwarding branches with fetch', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-non-updated-branches'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      const fetchHeadPath = Path.join(repository.path, '.git', 'FETCH_HEAD')
      const previousFetchHead = await readFile(fetchHeadPath, 'utf-8')

      await fastForwardBranches(repository, eligibleBranches)

      const currentFetchHead = await readFile(fetchHeadPath, 'utf-8')

      assert.equal(currentFetchHead, previousFetchHead)
    })
  })
})
