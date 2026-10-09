import { join } from 'path'
import {
  IAssistedCommitPlan,
  IAssistedCommitPlanCommit,
  IAssistedCommitSingleCommit,
  IAssistedCommitSnapshot,
  IValidatedAssistedCommitPlan,
} from '../../../models/assisted-commit'
import { isGitError } from '../core'
import { AssistedCommitError, checkAssistedCommitCancellation } from './error'
import {
  fileTreeUpdates,
  hashBlob,
  splitByteLines,
  verifyHead,
  verifyIndex,
  verifySelectedFiles,
  writeTree,
} from './git'
import {
  getSnapshotData,
  IAssistedCommitData,
  IFrozenFile,
  validatedPlans,
} from './state'
import { IAssistedCommitOperationOptions } from './progress'

function invalidPlan(message: string): never {
  throw new AssistedCommitError('invalid-plan', message)
}

function checkedObject(
  value: unknown,
  keys: ReadonlyArray<string>
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return invalidPlan('A commit plan must contain plain data objects')
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value))
  if (
    entries.some(
      ([key, property]) => !keys.includes(key) || !('value' in property)
    )
  ) {
    return invalidPlan(
      'A commit plan contains extra fields or executable properties'
    )
  }
  return Object.fromEntries(
    entries.map(([key, property]) => [key, property.value])
  )
}

function checkedArray(value: unknown): ReadonlyArray<unknown> {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return invalidPlan('Commit groups and change IDs must be arrays')
  }
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.entries(Object.getOwnPropertyDescriptors(value)).some(
      ([key, property]) =>
        !('value' in property) ||
        (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
    )
  ) {
    return invalidPlan('Commit plan arrays must contain plain data only')
  }
  return value
}

function parsePlan(
  data: IAssistedCommitData,
  input: unknown
): IAssistedCommitPlan {
  const raw = checkedObject(input, ['snapshotId', 'commits'])
  if (raw.snapshotId !== data.snapshot.id) {
    return invalidPlan('Commit plan does not belong to this snapshot')
  }
  const groups = checkedArray(raw.commits)
  if (groups.length === 0) {
    return invalidPlan('Commit plan must contain at least one commit')
  }
  const known = new Set(data.snapshot.analysis.changes.map(change => change.id))
  const owned = new Set<string>()
  const commits: IAssistedCommitPlanCommit[] = []
  const emptySelection = known.size === 0 && data.request.allowEmptyCommit
  for (const group of groups) {
    const commit = checkedObject(group, ['title', 'description', 'changeIds'])
    if (
      typeof commit.title !== 'string' ||
      commit.title.trim().length === 0 ||
      /[\r\n\0]/.test(commit.title)
    ) {
      return invalidPlan('Every commit requires a nonblank, single-line title')
    }
    if (
      commit.description !== undefined &&
      (typeof commit.description !== 'string' ||
        commit.description.includes('\0'))
    ) {
      return invalidPlan(
        'Commit descriptions must be strings without NUL bytes'
      )
    }
    const ids = checkedArray(commit.changeIds)
    if (ids.length === 0 && !(emptySelection && groups.length === 1)) {
      return invalidPlan('A commit group cannot be empty')
    }
    const changeIds: string[] = []
    for (const id of ids) {
      if (typeof id !== 'string' || !known.has(id)) {
        return invalidPlan('Commit plan contains an unknown selected change ID')
      }
      if (owned.has(id)) {
        return invalidPlan('A selected change ID occurs more than once')
      }
      owned.add(id)
      changeIds.push(id)
    }
    commits.push(
      Object.freeze({
        title: commit.title,
        ...(typeof commit.description === 'string'
          ? { description: commit.description }
          : {}),
        changeIds: Object.freeze(changeIds),
      })
    )
  }
  if (owned.size !== known.size) {
    return invalidPlan('Commit plan omits selected change IDs')
  }
  return Object.freeze({
    snapshotId: data.snapshot.id,
    commits: Object.freeze(commits),
  })
}

function cumulativeContent(
  file: IFrozenFile,
  selectedIds: ReadonlySet<string>
): Buffer {
  const lines = splitByteLines(file.baseBytes)
  const buffers: Buffer[] = []
  let cursor = 0
  for (const hunk of file.hunks) {
    if (!selectedIds.has(hunk.id)) {
      continue
    }
    if (hunk.start < cursor || hunk.end > lines.length) {
      throw new AssistedCommitError(
        'unsafe-plan',
        'Frozen hunk ranges cannot be composed safely'
      )
    }
    buffers.push(
      Buffer.concat(lines.slice(cursor, hunk.start)),
      hunk.replacement
    )
    cursor = hunk.end
  }
  buffers.push(Buffer.concat(lines.slice(cursor)))
  return Buffer.concat(buffers)
}

async function materializeTree(
  data: IAssistedCommitData,
  selectedIds: ReadonlySet<string>,
  indexPath: string
): Promise<string> {
  const entries = []
  for (const file of data.files) {
    if (file.atomicId !== null) {
      if (selectedIds.has(file.atomicId)) {
        entries.push(...fileTreeUpdates(file))
      }
    } else if (file.hunks.some(h => selectedIds.has(h.id))) {
      if (file.selected === null) {
        throw new AssistedCommitError(
          'unsafe-plan',
          'A text selection has no frozen file entry'
        )
      }
      const sha = await hashBlob(data, cumulativeContent(file, selectedIds))
      entries.push({ path: file.file.path, entry: { ...file.selected, sha } })
    }
  }
  return writeTree(data, data.baseTree, entries, indexPath)
}

/**
 * Build an explicit whole-selection fallback or caller-titled empty commit.
 *
 * This never derives a fallback title from an earlier proposed commit. Validate
 * the result normally; the reason does not bypass ownership or tree checks.
 */
export function createSingleAssistedCommitPlan(
  snapshot: IAssistedCommitSnapshot,
  message: IAssistedCommitSingleCommit
): IAssistedCommitPlan {
  const data = getSnapshotData(snapshot)
  const empty = snapshot.analysis.changes.length === 0
  if (
    !['uncertain-boundaries', 'unsafe-split', 'empty-selection'].includes(
      message.reason
    ) ||
    (message.reason === 'empty-selection') !== empty
  ) {
    return invalidPlan('Single-commit reason does not match this selection')
  }
  return parsePlan(data, {
    snapshotId: snapshot.id,
    commits: [
      {
        title: message.title,
        ...(message.description === undefined
          ? {}
          : { description: message.description }),
        changeIds: snapshot.analysis.changes.map(change => change.id),
      },
    ],
  })
}

/**
 * Validate the whole proposal and materialize every cumulative tree up front.
 *
 * Invalid/malicious data is invalid-plan, never a fallback. A structurally valid
 * but unmaterializable split is unsafe-plan; the caller may supply a new,
 * whole-selection single-commit message and validate that plan instead.
 */
export async function validateAssistedCommitPlan(
  snapshot: IAssistedCommitSnapshot,
  proposal: unknown,
  options: IAssistedCommitOperationOptions = {}
): Promise<IValidatedAssistedCommitPlan> {
  checkAssistedCommitCancellation(options.signal)
  const data = getSnapshotData(snapshot)
  if (data.phase !== 'captured') {
    throw new AssistedCommitError(
      'busy',
      'The assisted commit snapshot is already in use'
    )
  }
  const plan = parsePlan(data, proposal)
  data.phase = 'validating'
  try {
    await options.onProgress?.({ kind: 'validating' })
    await verifyHead(data, snapshot.originalHead.sha)
    await verifyIndex(data)
    await verifySelectedFiles(data)
    const trees: string[] = []
    const selectedIds = new Set<string>()
    let previous = data.baseTree
    for (const [index, commit] of plan.commits.entries()) {
      checkAssistedCommitCancellation(options.signal)
      commit.changeIds.forEach(id => selectedIds.add(id))
      let tree: string
      try {
        tree = await materializeTree(
          data,
          selectedIds,
          join(data.temporaryDirectory, `plan-index-${index}`)
        )
      } catch (error) {
        if (isGitError(error)) {
          throw new AssistedCommitError(
            'unsafe-plan',
            'The proposed boundaries cannot be materialized safely',
            { cause: error }
          )
        }
        throw error
      }
      if (
        tree === previous &&
        !(
          snapshot.analysis.changes.length === 0 &&
          data.request.allowEmptyCommit
        )
      ) {
        throw new AssistedCommitError(
          'unsafe-plan',
          'A proposed commit has no content delta'
        )
      }
      trees.push(tree)
      previous = tree
    }
    if (previous !== snapshot.selectedTree) {
      throw new AssistedCommitError(
        'unsafe-plan',
        'The final plan tree does not exactly match the frozen selection'
      )
    }
    await verifyHead(data, snapshot.originalHead.sha)
    await verifyIndex(data)
    await verifySelectedFiles(data)
    checkAssistedCommitCancellation(options.signal)
    const validated = Object.freeze({ plan, trees: Object.freeze(trees) })
    validatedPlans.set(validated, data)
    return validated
  } finally {
    data.phase = 'captured'
  }
}
