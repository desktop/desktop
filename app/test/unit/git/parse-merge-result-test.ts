import * as Path from 'path'
import * as glob from 'glob'

import { MergeTreeError } from '../../../src/models/merge'
import { ComputedAction } from '../../../src/models/computed-action'
import { parseMergeTreeResult } from '../../../src/lib/git/merge-tree'
import { createReadStream } from 'fs'

const filenameRegex = /merge\-(.*)\-into\-(.*).txt/

function loadMergeTreeOutputs(context: string) {
  const relativePath = Path.join(
    __dirname,
    `../../fixtures/merge-parser/${context}/merge-*.txt`
  )

  return glob.sync(relativePath)
}

function extractBranchNames(path: string): { ours: string; theirs: string } {
  const fileName = Path.basename(path)
  const match = filenameRegex.exec(fileName)

  if (match == null || match.length !== 3) {
    throw new Error(
      `Unable to convert filename into branches for test setup: ${fileName}. Please review this test.`
    )
  }

  const theirs = match[1]
  const ours = match[2]
  return { ours, theirs }
}

describe('parseMergeResult', () => {
  it('can process a successful merge result', async () => {
    const relativePath = Path.join(
      __dirname,
      '../../fixtures/merge-parser/desktop/valid-merge-master-into-script-upgrade.txt'
    )
    const filePath = Path.resolve(relativePath)

    const result = await parseMergeTreeResult(createReadStream(filePath))
    expect(result.kind).toBe(ComputedAction.Clean)
  })

  it('can report on merge conflicts', async () => {
    const relativePath = Path.join(
      __dirname,
      '../../fixtures/merge-parser/desktop/failed-merge-stale-branch-into-master.txt'
    )
    const result = await parseMergeTreeResult(createReadStream(relativePath))
    expect(result.kind).toBe(ComputedAction.Conflicts)
    expect((result as MergeTreeError).conflictedFiles).toBe(1)
  })

  describe('desktop/desktop', () => {
    const files = loadMergeTreeOutputs('desktop')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const result = await parseMergeTreeResult(createReadStream(f))
        expect(result.kind).toBe(ComputedAction.Conflicts)
        expect((result as MergeTreeError).conflictedFiles).toBeGreaterThan(0)
      })
    }
  })

  describe('electron/electron', () => {
    const files = loadMergeTreeOutputs('electron')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const result = await parseMergeTreeResult(createReadStream(f))
        expect(result.kind).toBe(ComputedAction.Conflicts)
        expect((result as MergeTreeError).conflictedFiles).toBeGreaterThan(0)
      })
    }
  })

  describe('microsoft/vscode', () => {
    const files = loadMergeTreeOutputs('vscode')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const result = await parseMergeTreeResult(createReadStream(f))
        expect(result.kind).toBe(ComputedAction.Conflicts)
        expect((result as MergeTreeError).conflictedFiles).toBeGreaterThan(0)
      })
    }
  })
})
