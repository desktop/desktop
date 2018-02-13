import { spawn } from './spawn'
import { getLogLines } from './git'
import { convertToChangelogFormat } from './parser'
import { sort as semverSort } from 'semver'

const jsonStringify: (obj: any) => string = require('json-pretty')

export async function run(args: ReadonlyArray<string>): Promise<void> {
  try {
    await spawn('git', ['--version'])
  } catch {
    throw new Error('Unable to find Git on your PATH, aborting...')
  }

  try {
    await spawn('git', ['rev-parse', '--show-cdup'])
  } catch {
    throw new Error(
      `The current directory '${process.cwd()}' is not a Git repository, aborting...`
    )
  }

  if (args.length === 0) {
    // work out the latest tag created in the repository
    const allTags = await spawn('git', ['tag'])
    const releaseTags = allTags
      .split('\n')
      .filter(tag => tag.startsWith('release-'))
      .filter(tag => tag.indexOf('-linux') === -1)
      .filter(tag => tag.indexOf('-test') === -1)
      .map(tag => tag.substr(8))

    const sortedTags = semverSort(releaseTags)
    const latestTag = sortedTags[sortedTags.length - 1]

    throw new Error(
      `No tag specified to use as a starting point.\nThe latest tag specified is 'release-${latestTag}' - did you mean that?`
    )
  }

  const previousVersion = args[0]
  try {
    await spawn('git', ['rev-parse', previousVersion])
  } catch {
    throw new Error(
      `Unable to find ref '${previousVersion}' in your repository, aborting...`
    )
  }

  const lines = await getLogLines(previousVersion)
  const changelogEntries = await convertToChangelogFormat(lines)
  console.log(jsonStringify(changelogEntries))
}
