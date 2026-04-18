import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, writeFile } from 'fs/promises'
import * as Path from 'path'

import {
  extractGitHubDesktopRepositoryPathsFromText,
  getGitHubDesktopStorageDirectories,
  readGitHubDesktopRepositoryPaths,
} from '../../src/lib/github-desktop-repository-import'
import { createTempDirectory } from '../helpers/temp'

describe('github-desktop-repository-import', () => {
  it('extracts unique repository paths from indexeddb text', () => {
    const content = [
      'prefix path\u0005C:\\Users\\novab\\Projects\\Repo One\\\u0000suffix',
      'other path\u0006C:\\Users\\novab\\Projects\\Repo One\\\u0000suffix',
      'unix path\u0007/Users/novab/Projects/repo-two/\u0000trailing',
      'noise without a repository path',
    ].join(' ')

    assert.deepStrictEqual(
      extractGitHubDesktopRepositoryPathsFromText(content),
      ['/Users/novab/Projects/repo-two', 'C:\\Users\\novab\\Projects\\Repo One']
    )
  })

  it('extracts repository paths even when they are not prefixed by a path field', () => {
    const content = [
      'random binary C:\\Users\\novab\\Source\\SpireNetwork\\Client\u0000tail',
      'more text C:\\Users\\novab\\Downloads\\youtubedownloaderthingymmajig\u0000tail',
    ].join(' ')

    assert.deepStrictEqual(
      extractGitHubDesktopRepositoryPathsFromText(content),
      [
        'C:\\Users\\novab\\Downloads\\youtubedownloaderthingymmajig',
        'C:\\Users\\novab\\Source\\SpireNetwork\\Client',
      ]
    )
  })

  it('reads repository paths from the official profile storage directories', async t => {
    const appDataPath = await createTempDirectory(t)
    const [indexedDbPath, localStoragePath] =
      getGitHubDesktopStorageDirectories(appDataPath)

    await mkdir(indexedDbPath, { recursive: true })
    await mkdir(localStoragePath, { recursive: true })

    await writeFile(
      Path.join(indexedDbPath, '000003.log'),
      'path\u0005C:\\Users\\novab\\Projects\\Repo One\\\u0000and more data'
    )
    await writeFile(
      Path.join(localStoragePath, '000004.ldb'),
      'path\u0007C:\\Users\\novab\\Projects\\Repo Two\\\u0000and more data'
    )
    await writeFile(Path.join(localStoragePath, 'MANIFEST-000001'), 'ignored')

    assert.deepStrictEqual(
      await readGitHubDesktopRepositoryPaths(appDataPath),
      [
        'C:\\Users\\novab\\Projects\\Repo One',
        'C:\\Users\\novab\\Projects\\Repo Two',
      ]
    )
  })
})
