export type ReleaseMetadata = {
  readonly name: string
  readonly notes: ReadonlyArray<string>
  readonly pub_date: string
  readonly version: string
}

export type ReleaseNote = {
  readonly kind: 'new' | 'added' | 'removed' | 'fixed' | 'improved' | 'pretext'
  readonly message: string
}

export type ReleaseSummary = {
  readonly latestVersion: string
  readonly datePublished: string
  readonly pretext?: string
  readonly enhancements: ReadonlyArray<ReleaseNote>
  readonly bugfixes: ReadonlyArray<ReleaseNote>
  readonly other: ReadonlyArray<ReleaseNote>
}

export const externalContributionRe = /^(.*?)((\s?\#\d+\s?)+)(.*)(@[a-zA-Z0-9\-]+)!(.*)$/
export const otherContributionRe = /^(.*?)((\s?\#\d+\s?)*)(.*)$/
