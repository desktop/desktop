import { spawn } from './spawn'
import { fetchPR, IAPIPR } from './api'
import { sort as semverSort } from 'semver'

const jsonStringify: (obj: any) => string = require('json-pretty')

const PlaceholderChangeType = '???'
const OfficialOwner = 'desktop'

async function getLogLines(
  previousVersion: string
): Promise<ReadonlyArray<string>> {
  const log = await spawn('git', [
    'log',
    `...${previousVersion}`,
    '--merges',
    '--grep="Merge pull request"',
    '--format=format:%s',
    '-z',
    '--',
  ])

  return log.split('\0')
}

interface IParsedCommit {
  readonly prID: number
  readonly owner: string
}

function parseCommitTitle(line: string): IParsedCommit {
  // E.g.: Merge pull request #2424 from desktop/fix-shrinkwrap-file
  const re = /^Merge pull request #(\d+) from (.+?)\/.*$/
  const matches = line.match(re)
  if (!matches || matches.length !== 3) {
    throw new Error(`Unable to parse '${line}'`)
  }

  const id = parseInt(matches[1], 10)
  if (isNaN(id)) {
    throw new Error(`Unable to parse PR number from '${line}': ${matches[1]}`)
  }

  return {
    prID: id,
    owner: matches[2],
  }
}

function capitalized(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function getChangelogEntry(commit: IParsedCommit, pr: IAPIPR): string {
  let issueRef = ''
  let type = PlaceholderChangeType
  const description = capitalized(pr.title)

  const re = /Fixes #(\d+)/gi
  let match
  do {
    match = re.exec(pr.body)
    if (match && match.length > 1) {
      issueRef += ` #${match[1]}`
    }
  } while (match)

  if (issueRef.length) {
    type = 'Fixed'
  } else {
    issueRef = ` #${commit.prID}`
  }

  let attribution = ''
  if (commit.owner !== OfficialOwner) {
    attribution = `. Thanks @${commit.owner}!`
  }

  return `[${type}] ${description} -${issueRef}${attribution}`
}

async function getChangelogEntries(
  lines: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const entries = []
  for (const line of lines) {
    try {
      const commit = parseCommitTitle(line)
      const pr = await fetchPR(commit.prID)
      if (!pr) {
        throw new Error(`Unable to get PR from API: ${commit.prID}`)
      }

      const entry = getChangelogEntry(commit, pr)
      entries.push(entry)
    } catch (e) {
      console.warn('Unable to parse line, using the full message.', e)

      entries.push(`[${PlaceholderChangeType}] ${line}`)
    }
  }

  return entries
}

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
  const changelogEntries = await getChangelogEntries(lines)
  console.log(jsonStringify(changelogEntries))
}
