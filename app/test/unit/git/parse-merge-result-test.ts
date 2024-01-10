import * as Path from 'path'
import * as glob from 'glob'

import { MergeTreeError } from '../../../src/models/merge'
import { ComputedAction } from '../../../src/models/computed-action'
import { parseMergeTreeResult } from '../../../src/lib/git/merge-tree'
import { createReadStream } from 'fs'

const fixturePath = (...pathComponents: string[]) =>
  Path.join(__dirname, '../../fixtures/merge-parser/', ...pathComponents)

const loadMergeTreeOutputs = (context: string) =>
  glob.sync(fixturePath(context, 'merge-*.txt'))

function extractBranchNames(path: string): { ours: string; theirs: string } {
  const match = /merge\-(.*)\-into\-(.*).txt/.exec(Path.basename(path))

  if (match && match.length === 3) {
    return { ours: match[2], theirs: match[1] }
  }

  throw new Error(`Wrong path for test setup: ${path}`)
}

describe('parseMergeResult', () => {
  it('can process a successful merge result', async () => {
    const path = fixturePath(
      'desktop',
      'valid-merge-master-into-script-upgrade.txt'
    )
    const result = await parseMergeTreeResult(createReadStream(path))
    expect(result.kind).toBe(ComputedAction.Clean)
  })

  it('can report on merge conflicts', async () => {
    const path = fixturePath(
      'desktop',
      'failed-merge-stale-branch-into-master.txt'
    )
    const result = await parseMergeTreeResult(createReadStream(path))
    expect(result.kind).toBe(ComputedAction.Conflicts)
    expect((result as MergeTreeError).conflictedFiles).toBe(1)
  })

  const repos = ['desktop/desktop', 'electron/electron', 'microsoft/vscode']
  for (const repo of repos) {
    describe(repo, () => {
      for (const f of loadMergeTreeOutputs(Path.basename(repo))) {
        const { ours, theirs } = extractBranchNames(f)

        it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
          const result = await parseMergeTreeResult(createReadStream(f))
          expect(result.kind).toBe(ComputedAction.Conflicts)
          expect((result as MergeTreeError).conflictedFiles).toBeGreaterThan(0)
        })
      }
    })
  }
})
