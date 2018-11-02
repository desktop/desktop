import * as Path from 'path'
import * as Fs from 'fs'
import { gt as greaterThan } from 'semver'

import { fetchPR, IAPIPR } from './api'

const PlaceholderChangeType = '???'
const OfficialOwner = 'desktop'

const ChangelogEntryRegex = /^\[(new|fixed|improved|removed|added)\]\s(.*)/i

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

export function findIssueRef(body: string): string {
  let issueRef = ''

  const re = /(close[s]?|fix(e[sd])?|resolve[sd]):?\s*#(\d+)/gi
  let match: RegExpExecArray | null = null
  do {
    match = re.exec(body)
    if (match && match.length === 4) {
      // a match should always have four elements - the matching text
      // as well as the three groups within the match. We're only
      // interested in the last group - the issue reference number
      issueRef += ` #${match[3]}`
    }
  } while (match)

  return issueRef
}

type ReleaseNotes =
  | {
      readonly kind: 'found' | 'default'
      readonly text: string
    }
  | {
      readonly kind: 'omitted'
    }

export function getReleaseNotesDescription(pr: IAPIPR): ReleaseNotes {
  const re = /[Nn]otes: (.*)/gm
  const match = re.exec(pr.body)

  if (match != null && match.length === 2) {
    const text = match[1]

    if (text.toLowerCase() === 'no-notes') {
      return { kind: 'omitted' }
    } else {
      return { kind: 'found', text }
    }
  }

  return { kind: 'default', text: capitalized(pr.title) }
}

function getChangelogEntry(commit: IParsedCommit, pr: IAPIPR): string | null {
  let type = PlaceholderChangeType

  let issueRef = findIssueRef(pr.body)

  if (issueRef.length) {
    type = 'Fixed'
  } else {
    issueRef = ` #${commit.prID}`
  }

  let attribution = ''
  if (commit.owner !== OfficialOwner) {
    attribution = `. Thanks @${commit.owner}!`
  }

  const releaseNotesEntry = getReleaseNotesDescription(pr)
  if (releaseNotesEntry.kind === 'omitted') {
    return null
  }

  const description = releaseNotesEntry.text

  return `[${type}] ${description} -${issueRef}${attribution}`
}

type PullRequestSummary = {
  readonly id: number
  readonly title: string
}

type ChangelogResults = {
  readonly entries: ReadonlyArray<string>
  readonly omitted: ReadonlyArray<PullRequestSummary>
}

export async function convertToChangelogFormat(
  lines: ReadonlyArray<string>
): Promise<ChangelogResults> {
  const entries = new Array<string>()
  const omitted = new Array<PullRequestSummary>()

  for (const line of lines) {
    try {
      const commit = parseCommitTitle(line)
      const pr = await fetchPR(commit.prID)
      if (!pr) {
        throw new Error(`Unable to get PR from API: ${commit.prID}`)
      }

      const entry = getChangelogEntry(commit, pr)
      if (entry != null) {
        entries.push(entry)
      } else {
        omitted.push({ id: commit.prID, title: pr.title })
      }
    } catch (e) {
      console.warn('Unable to parse line, using the full message.', e)

      entries.push(`[${PlaceholderChangeType}] ${line}`)
    }
  }

  return { entries, omitted }
}

export function getChangelogEntriesSince(previousVersion: string): string[] {
  const root = Path.dirname(Path.dirname(__dirname))
  const changelogPath = Path.join(root, 'changelog.json')

  // eslint-disable-next-line no-sync
  const buffer = Fs.readFileSync(changelogPath)
  const changelogText = buffer.toString()

  const changelogAll: { releases: any } = JSON.parse(changelogText)

  const releases = changelogAll.releases

  const existingChangelog = []

  for (const prop of Object.getOwnPropertyNames(releases)) {
    const isAfter = greaterThan(prop, previousVersion)
    if (!isAfter) {
      continue
    }

    if (prop.endsWith('-beta0')) {
      // by convention we push the production updates out to beta
      // to ensure both channels are up to date
      continue
    }

    const entries: string[] = releases[prop]
    if (entries != null) {
      const validEntries = entries.filter(e => {
        const match = ChangelogEntryRegex.exec(e)
        return match != null
      })
      existingChangelog.push(...validEntries)
    }
  }
  return existingChangelog
}
