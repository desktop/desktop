type Release = {
  readonly name: string
  readonly notes: ReadonlyArray<string>
  readonly pub_date: string
  readonly version: string
}

type ReleaseEntry = {
  readonly kind: 'new' | 'added' | 'removed' | 'fixed' | 'improved' | 'pretext'
  readonly message: string
}

type ReleaseNotesSummary = {
  readonly pretext: string | null
  readonly enhancements: ReadonlyArray<ReleaseEntry>
  readonly bugfixes: ReadonlyArray<ReleaseEntry>
  readonly other: ReadonlyArray<ReleaseEntry>
}

const itemEntryRe = /^\[(new|fixed|improved|removed|added|pretext)\]\s(.*)/i

export function parseReleaseEntries(
  notes: ReadonlyArray<string>
): ReadonlyArray<ReleaseEntry> {
  const entries = new Array<ReleaseEntry>()

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

export function groupEntries(
  entries: ReadonlyArray<ReleaseEntry>
): ReleaseNotesSummary {
  const enhancements = entries.filter(
    e => e.kind === 'new' || e.kind === 'added' || e.kind === 'improved'
  )
  const bugfixes = entries.filter(e => e.kind === 'fixed')
  const other = entries.filter(e => e.kind === 'removed')

  return {
    pretext: null,
    enhancements,
    bugfixes,
    other,
  }
}

export async function getChangeLog(): Promise<ReadonlyArray<Release>> {
  const changelog =
    'https://central.github.com/deployments/desktop/desktop/changelog.json'
  const query = __RELEASE_CHANNEL__ === 'beta' ? '?env=beta' : ''

  const response = await fetch(`${changelog}${query}`)
  if (response.ok) {
    const releases: ReadonlyArray<Release> = await response.json()
    return releases
  } else {
    return []
  }
}
