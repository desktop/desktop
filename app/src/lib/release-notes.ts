import moment from 'moment'

import {
  ReleaseMetadata,
  ReleaseNote,
  ReleaseSummary,
} from '../models/release-notes'

// expects a release note entry to contain a header and then some text
// example:
//    [New] Fallback to Gravatar for loading avatars - #821
const itemEntryRe = /^\[([a-z]{1,})\]\s(.*)/i

function parseEntry(note: string): ReleaseNote | null {
  const text = note.trim()
  const match = itemEntryRe.exec(text)
  if (match === null) {
    log.debug(`[ReleaseNotes] unable to convert text into entry: ${note}`)
    return null
  }

  const kind = match[1].toLowerCase()
  const message = match[2]
  if (
    kind === 'new' ||
    kind === 'fixed' ||
    kind === 'improved' ||
    kind === 'added' ||
    kind === 'pretext' ||
    kind === 'removed'
  ) {
    return { kind, message }
  }

  log.debug(`[ReleaseNotes] kind ${kind} was found but is not a valid entry`)

  return {
    kind: 'other',
    message,
  }
}

/**
 * A filter function with type predicate to return non-null and non-undefined
 * entries while also satisfying the TS compiler
 *
 * Source: https://stackoverflow.com/a/46700791/1363815
 */
function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined
}

export function parseReleaseEntries(
  notes: ReadonlyArray<string>
): ReadonlyArray<ReleaseNote> {
  return notes.map(n => parseEntry(n)).filter(notEmpty)
}

export function getReleaseSummary(
  latestRelease: ReleaseMetadata
): ReleaseSummary {
  const entries = parseReleaseEntries(latestRelease.notes)

  const enhancements = entries.filter(
    e => e.kind === 'new' || e.kind === 'added' || e.kind === 'improved'
  )
  const bugfixes = entries.filter(e => e.kind === 'fixed')
  const other = entries.filter(e => e.kind === 'removed' || e.kind === 'other')

  const datePublished = moment(latestRelease.pub_date).format('MMMM Do YYYY')

  return {
    latestVersion: latestRelease.version,
    datePublished,
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

export async function generateReleaseSummary(): Promise<ReleaseSummary> {
  const releases = await getChangeLog()
  const latestRelease = releases[0]
  return getReleaseSummary(latestRelease)
}
