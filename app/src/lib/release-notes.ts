import { readFile } from 'fs/promises'
import * as Path from 'path'
import * as semver from 'semver'
import {
  ReleaseMetadata,
  ReleaseNote,
  ReleaseSummary,
} from '../models/release-notes'
import { getVersion } from '../ui/lib/app-proxy'
import { formatDate } from './format-date'
import { offsetFromNow } from './offset-from'
import { encodePathAsUrl } from './path'

// expects a release note entry to contain a header and then some text
// example:
//    [New] Fallback to Gravatar for loading avatars - #821
const itemEntryRe = /^\[([a-z]{1,})\]\s((.|\n)*)/i

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
  const thankYous = entries.filter(e => e.message.includes(' Thanks @'))
  const pretext = entries.filter(e => e.kind === 'pretext')

  return {
    latestVersion: latestRelease.version,
    datePublished: formatDate(new Date(latestRelease.pub_date), {
      dateStyle: 'long',
    }),
    pretext,
    enhancements,
    bugfixes,
    other,
    thankYous,
  }
}

export async function getChangeLog(
  limit?: number
): Promise<ReadonlyArray<ReleaseMetadata>> {
  const changelogURL = new URL(
    'https://central.github.com/deployments/desktop/desktop/changelog.json'
  )

  if (__RELEASE_CHANNEL__ === 'beta' || __RELEASE_CHANNEL__ === 'test') {
    changelogURL.searchParams.set('env', __RELEASE_CHANNEL__)
  }

  if (limit !== undefined) {
    changelogURL.searchParams.set('limit', limit.toString())
  }

  const response = await fetch(changelogURL.toString())
  if (response.ok) {
    const releases: ReadonlyArray<ReleaseMetadata> = await response.json()
    return releases
  } else {
    return []
  }
}

export async function generateReleaseSummary(
  version?: string
): Promise<ReadonlyArray<ReleaseSummary>> {
  const lastTenReleases = await getChangeLog()
  const currentVersion = new semver.SemVer(version ?? getVersion())
  const recentReleases = lastTenReleases.filter(
    r =>
      semver.gt(new semver.SemVer(r.version), currentVersion) &&
      new Date(r.pub_date).getTime() > offsetFromNow(-90, 'days')
  )

  // We should only be pulling release notes when a release just happened, so
  // there should be one within the past 90 days. Thus, this is just precaution
  // to ensure we always show at least the last set of release notes.
  return recentReleases.length > 0
    ? recentReleases.map(getReleaseSummary)
    : [getReleaseSummary(lastTenReleases[0])]
}

/**
 * This method is used in conjunction with the Help > Show Popup > Release notes
 * menu item to test release notes on dev builds.
 **/
export async function generateDevReleaseSummary(): Promise<
  ReadonlyArray<ReleaseSummary>
> {
  // Remove version if want to use latest version in your dev build
  const releases = [...(await generateReleaseSummary('3.0.0'))]

  const pretextDraft = await readFile(
    Path.join(__dirname, 'static', 'pretext-draft.md'),
    'utf8'
  ).catch(_ => null)

  if (pretextDraft === null) {
    return releases
  }

  return [
    {
      ...releases[0],
      pretext: [{ kind: 'pretext', message: pretextDraft }],
    },
    ...releases.slice(1),
  ]
}

export const ReleaseNoteHeaderLeftUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-left.svg'
)
export const ReleaseNoteHeaderRightUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-right.svg'
)
