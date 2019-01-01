import * as Path from 'path'
import * as FSE from 'fs-extra'
import { parseMergeResult } from '../../../src/lib/merge-tree-parser'
import {
  IMergeSuccess,
  IMergeError,
  MergeResultKind,
} from '../../../src/models/merge'

import * as glob from 'glob'

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
    const input = await FSE.readFile(filePath, { encoding: 'utf8' })

    const result = parseMergeResult(input)
    expect(result.kind).toBe(MergeResultKind.Clean)

    const mergeResult = result as IMergeSuccess
    expect(mergeResult.entries.length).toBe(21)
    mergeResult.entries.forEach(e => {
      expect(e.diff).not.toBe('')
    })
  })

  it('can report on merge conflicts', async () => {
    const relativePath = Path.join(
      __dirname,
      '../../fixtures/merge-parser/desktop/failed-merge-stale-branch-into-master.txt'
    )
    const filePath = Path.resolve(relativePath)
    const input = await FSE.readFile(filePath, { encoding: 'utf8' })

    const result = parseMergeResult(input)
    expect(result.kind).toBe(MergeResultKind.Conflicts)

    const mergeResult = result as IMergeError
    expect(mergeResult.conflictedFiles).toBe(1)
  })

  describe('desktop/desktop', () => {
    const files = loadMergeTreeOutputs('desktop')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const input = await FSE.readFile(f, { encoding: 'utf8' })

        const result = parseMergeResult(input)
        expect(result.kind).toBe(MergeResultKind.Conflicts)

        const mergeResult = result as IMergeError
        expect(mergeResult.conflictedFiles).toBeGreaterThan(0)
      })
    }
  })

  describe('electron/electron', () => {
    const files = loadMergeTreeOutputs('electron')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const input = await FSE.readFile(f, { encoding: 'utf8' })

        const result = parseMergeResult(input)
        expect(result.kind).toBe(MergeResultKind.Conflicts)

        const mergeResult = result as IMergeError
        expect(mergeResult.conflictedFiles).toBeGreaterThan(0)
      })
    }
  })

  describe('microsoft/vscode', () => {
    const files = loadMergeTreeOutputs('vscode')

    for (const f of files) {
      const { ours, theirs } = extractBranchNames(f)

      it(`can parse conflicts from merging ${theirs} into ${ours}`, async () => {
        const input = await FSE.readFile(f, { encoding: 'utf8' })

        const result = parseMergeResult(input)
        expect(result.kind).toBe(MergeResultKind.Conflicts)

        const mergeResult = result as IMergeError
        expect(mergeResult.conflictedFiles).toBeGreaterThan(0)
      })
    }
  })
})
