import {
  ReleaseMetadata,
  ReleaseNote,
  ReleaseSummary,
} from '../models/release-notes'

const itemEntryRe = /^\[(new|fixed|improved|removed|added|pretext)\]\s(.*)/i

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function getPrefix(day: number) {
  const remainder = day % 10
  if (remainder === 1) {
    return 'st'
  } else if (remainder === 2) {
    return 'nd'
  } else if (remainder === 3) {
    return 'rd'
  } else {
    return 'th'
  }
}

function formatDate(date: Date) {
  const day = date.getDate()
  const prefix = getPrefix(day)
  const monthIndex = date.getMonth()
  const year = date.getFullYear()

  return `${monthNames[monthIndex]} ${day}${prefix} ${year}`
}

export function parseReleaseEntries(
  notes: ReadonlyArray<string>
): ReadonlyArray<ReleaseNote> {
  const entries = new Array<ReleaseNote>()

  for (const note of notes) {
    const text = note.trim()
    const match = itemEntryRe.exec(text)
    if (match !== null) {
      const kind = match[1].toLowerCase()
      const message = match[2]

      if (kind === 'new') {
        entries.push({ kind, message })
      } else if (kind === 'fixed') {
        entries.push({ kind, message })
      } else if (kind === 'improved') {
        entries.push({ kind, message })
      } else if (kind === 'removed') {
        entries.push({ kind, message })
      } else if (kind === 'added') {
        entries.push({ kind, message })
      } else if (kind === 'pretext') {
        entries.push({ kind, message })
      }
    }
  }

  return entries
}

export function getReleaseSummary(
  currentVersion: string,
  latestRelease: ReleaseMetadata
): ReleaseSummary {
  const entries = parseReleaseEntries(latestRelease.notes)

  const enhancements = entries.filter(
    e => e.kind === 'new' || e.kind === 'added' || e.kind === 'improved'
  )
  const bugfixes = entries.filter(e => e.kind === 'fixed')
  const other = entries.filter(e => e.kind === 'removed')

  const publishedDate = new Date(latestRelease.pub_date)

  return {
    latestVersion: latestRelease.version,
    datePublished: formatDate(publishedDate),
    // TODO: find pretext entry
    pretext: undefined,
    enhancements,
    bugfixes,
    other,
  }
}

async function getChangeLog(): Promise<ReadonlyArray<ReleaseMetadata>> {
  const changelog =
    'https://central.github.com/deployments/desktop/desktop/changelog.json'
  const query = __RELEASE_CHANNEL__ === 'beta' ? '?env=beta' : ''

  const response = await fetch(`${changelog}${query}`)
  if (response.ok) {
    const releases: ReadonlyArray<ReleaseMetadata> = await response.json()
    return releases
  } else {
    return []
  }
}

export async function generateReleaseSummary(
  currentVersion: string
): Promise<ReleaseSummary> {
  const releases = await getChangeLog()
  const latestRelease = releases[0]
  return getReleaseSummary(currentVersion, latestRelease)
}
