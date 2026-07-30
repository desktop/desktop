import { WorkingDirectoryStatus } from '../models/status'
import { DiffSelectionType } from '../models/diff'
import { Repository } from '../models/repository'
import { stat } from 'fs/promises'
import { join } from 'path'
import { git } from './git/core'

const ReceiveLimit = 100 * 1024 * 1024 // 100 MiB

/**
 * Retrieve paths of working directory files that are larger than a given Megabyte size.
 *
 * @param repository        - The repository from which the base file directory will be retrieved.
 * @param workingDirectory  - The collection of changed files, from which the selected files will
 *                            be determined.
 * @param maximumSizeMB     - The size limit (in Megabytes) at which an exceeding file size will
 *                            result in it's path being retrieved.
 */
export async function getLargeFilePaths(
  repository: Repository,
  workingDirectory: WorkingDirectoryStatus,
  isIncluded: (
    file: WorkingDirectoryStatus['files'][number]
  ) => boolean = file =>
    file.selection.getSelectionType() !== DiffSelectionType.None,
  source: 'working-directory' | 'index' = 'working-directory'
) {
  const fileNames = new Array<string>()
  const workingDirectoryFiles = workingDirectory.files
  const includedFiles = workingDirectoryFiles.filter(isIncluded)
  const indexFileSizes =
    source === 'index'
      ? await getIndexFileSizes(
          repository,
          new Set(includedFiles.map(file => file.path))
        )
      : null

  for (const file of includedFiles) {
    const filePath = join(repository.path, file.path)
    try {
      const fileSizeBytes =
        source === 'index'
          ? indexFileSizes?.get(file.path)
          : (await stat(filePath)).size
      if (fileSizeBytes === undefined) {
        continue
      }
      if (fileSizeBytes > ReceiveLimit) {
        fileNames.push(file.path)
      }
    } catch (error) {
      log.debug(`Unable to get the file size for ${filePath}`, error)
    }
  }

  return fileNames
}

async function getIndexFileSizes(
  repository: Repository,
  includedPaths: ReadonlySet<string>
): Promise<ReadonlyMap<string, number>> {
  const { stdout: indexEntries } = await git(
    ['ls-files', '--stage', '-z'],
    repository.path,
    'getIndexFileSizes'
  )
  const pathsByObjectId = new Map<string, string[]>()

  for (const entry of indexEntries.split('\0')) {
    const separatorIndex = entry.indexOf('\t')
    if (separatorIndex < 0) {
      continue
    }

    const [mode, objectId, stage] = entry
      .substring(0, separatorIndex)
      .split(' ')
    const path = entry.substring(separatorIndex + 1)

    if (
      mode === undefined ||
      objectId === undefined ||
      stage !== '0' ||
      !includedPaths.has(path)
    ) {
      continue
    }

    const paths = pathsByObjectId.get(objectId) ?? []
    paths.push(path)
    pathsByObjectId.set(objectId, paths)
  }

  if (pathsByObjectId.size === 0) {
    return new Map()
  }

  const { stdout: objectSizes } = await git(
    ['cat-file', '--batch-check=%(objectname) %(objectsize)'],
    repository.path,
    'getIndexFileSizes',
    { stdin: Array.from(pathsByObjectId.keys()).join('\n') }
  )
  const sizesByPath = new Map<string, number>()

  for (const line of objectSizes.trim().split('\n')) {
    const [objectId, sizeValue] = line.split(' ')
    const size = Number.parseInt(sizeValue, 10)

    if (!Number.isFinite(size)) {
      continue
    }

    for (const path of pathsByObjectId.get(objectId) ?? []) {
      sizesByPath.set(path, size)
    }
  }

  return sizesByPath
}
