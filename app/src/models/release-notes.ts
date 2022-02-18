export type ReleaseMetadata = {
  readonly name: string
  readonly notes: ReadonlyArray<string>
  readonly pub_date: string
  readonly version: string
}

type ItemEntryKind =
  | 'new'
  | 'fixed'
  | 'improved'
  | 'removed'
  | 'added'
  | 'pretext'
  | 'other'

export type ReleaseNote = {
  readonly kind: ItemEntryKind
  readonly message: string
}

export type ReleaseSummary = {
  readonly latestVersion: string
  readonly datePublished: string
  readonly pretext?: string
  readonly enhancements: ReadonlyArray<ReleaseNote>
  readonly bugfixes: ReadonlyArray<ReleaseNote>
  readonly other: ReadonlyArray<ReleaseNote>
  readonly thankYous: ReadonlyArray<ReleaseNote>
}
