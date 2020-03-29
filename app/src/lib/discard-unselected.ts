import { Repository } from '../models/repository'
import { WorkingDirectoryFileChange } from '../models/status'
import { DiffLineType, DiffType } from '../models/diff'
import { getWorkingDirectoryDiff } from './git/diff'
import * as FSE from 'fs-extra'

/**
 * Discard unselected differences
 *
 * @param repository The repository containing the branches to merge
 * @param file File to discard
 */
export async function discardUnselectedChanges(
  repository: Repository,
  file: WorkingDirectoryFileChange
): Promise<void> {
  const curData = new Array<string>()
  const fileData = await FSE.readFile(repository.path + '/' + file.path)
  const fileText = fileData.toString()
  // Getting line ending, \r or \r\n or \n
  const lineending = getLineBreakChar(fileText)
  const lines = fileText.split(/\r?\n/)
  lines.forEach(value => {
    curData.push(value)
  })

  const diff = await getWorkingDirectoryDiff(repository, file)
  if (diff.kind !== DiffType.Text) {
    throw new Error(`Unexpected diff result returned: '${diff.kind}'`)
  }
  let curSourceLine = 0
  const newData = Array<string>()

  diff.hunks.forEach((hunk, hunkIndex) => {
    for (let i = 0; i < hunk.lines.length; ++i) {
      const newLineNumber = hunk.lines[i].newLineNumber
      if (newLineNumber != null) {
        proceedCopy(
          curData,
          newData,
          curSourceLine,
          newLineNumber - 1,
          lineending
        )
        curSourceLine = newLineNumber - 1
        break
      }
    }
    hunk.lines.forEach((line, lineIndex) => {
      const absoluteIndex = hunk.unifiedDiffStart + lineIndex
      if (line.type === DiffLineType.Hunk) {
      } else if (!file.selection.isSelected(absoluteIndex)) {
        if (line.type === DiffLineType.Add) {
          curSourceLine++
        }
        if (line.type === DiffLineType.Delete) {
          newData.push(line.content + lineending)
        }
      } else {
        if (line.type !== DiffLineType.Delete) {
          newData.push(line.content + lineending)
          curSourceLine++
        }
      }
    })
  })

  proceedCopy(curData, newData, curSourceLine, curData.length, lineending)
  const lastLine = newData.pop()
  if (lastLine != null) {
    newData.push(lastLine.substr(0, lastLine.length - lineending.length))
  } else {
    throw new Error('last line error')
  }

  let newFileText = ''
  newData.forEach(value => (newFileText += value))
  await FSE.writeFile(repository.path + '/' + file.path, newFileText)
}

function proceedCopy(
  srcData: Array<string>,
  dstData: Array<string>,
  start: number,
  end: number,
  lineending: string
): void {
  for (let i = start; i < end; i++) {
    dstData.push(srcData[i] + lineending)
  }
}

function getLineBreakChar(str: string): string {
  const indexOfLF = str.indexOf('\n', 1)
  if (indexOfLF === -1) {
    if (str.indexOf('\r') !== -1) {
      return '\r'
    }
    return '\n'
  }
  if (str[indexOfLF - 1] === '\r') {
    return '\r\n'
  }
  return '\n'
}
