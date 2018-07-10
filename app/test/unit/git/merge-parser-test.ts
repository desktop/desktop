import { expect } from 'chai'
import * as Path from 'path'
import * as FSE from 'fs-extra'
import {
  parseMergeResult,
  IMergeSuccess,
} from '../../../src/lib/git/merge-parser'

describe('merge-parser', () => {
  it('can process a successful merge result', async () => {
    const relativePath = Path.join(
      __dirname,
      '../../fixtures/merge-parser/valid-merge-master-into-script-upgrade.txt'
    )
    const filePath = Path.resolve(relativePath)
    const input = await FSE.readFile(filePath, { encoding: 'utf8' })

    const result = parseMergeResult(input)
    expect(result.kind).equals('Success')

    const mergeResult = result as IMergeSuccess
    expect(mergeResult.entries.length).equals(21)
    mergeResult.entries.forEach(e => {
      expect(e.diff).not.equal('')
    })
  })
})
