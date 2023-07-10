/* eslint-disable no-sync */

const glob = require('glob')
const { basename, dirname, join } = require('path')
const fs = require('fs')

type ChecksumEntry = { filename: string; checksum: string }

type ChecksumGroups = Record<'x64' | 'arm' | 'arm64', Array<ChecksumEntry>>

type ReleaseNotesGroupType = 'new' | 'added' | 'fixed' | 'improved' | 'removed'

type ReleaseNotesGroups = Record<ReleaseNotesGroupType, Array<ReleaseNoteEntry>>

type ReleaseNoteEntry = {
  text: string
  ids: Array<number>
  contributor?: string
}

// 3 architectures * 3 package formats * 2 files (package + checksum file)
const SUCCESSFUL_RELEASE_FILE_COUNT = 3 * 3 * 2

const Glob = glob.GlobSync

const args = process.argv.slice(2)
const artifactsDir = args[0]

if (!artifactsDir) {
  console.error(
    `🔴 First parameter with artifacts directory not found. Aborting...`
  )
  process.exit(1)
}

const releaseTagWithoutPrefix = args[1]
if (!releaseTagWithoutPrefix) {
  console.error(`🔴 Second parameter with release tag not found. Aborting...`)
  process.exit(1)
}

console.log(
  `Preparing release notes for release tag ${releaseTagWithoutPrefix}`
)

const files = new Glob(artifactsDir + '/**/*', { nodir: true })

let countFiles = 0
const shaEntries = new Array<ChecksumEntry>()

for (const file of files.found) {
  if (file.endsWith('.sha256')) {
    shaEntries.push(getShaContents(file))
  }

  countFiles++
}

if (SUCCESSFUL_RELEASE_FILE_COUNT !== countFiles) {
  console.error(
    `🔴 Artifacts folder has ${countFiles} assets, expecting ${SUCCESSFUL_RELEASE_FILE_COUNT}. Please check the GH Actions artifacts to see which are missing.`
  )
  process.exit(1)
}

const shaEntriesByArchitecture: ChecksumGroups = {
  x64: shaEntries.filter(
    e =>
      e.filename.includes('-linux-x86_64-') ||
      e.filename.includes('-linux-amd64-')
  ),
  arm: shaEntries.filter(
    e =>
      e.filename.includes('-linux-armv7l-') ||
      e.filename.includes('-linux-armhf-')
  ),
  arm64: shaEntries.filter(
    e =>
      e.filename.includes('-linux-aarch64-') ||
      e.filename.includes('-linux-arm64-')
  ),
}

console.log(`Found ${countFiles} files in artifacts directory`)
console.log(shaEntriesByArchitecture)

const releaseNotesByGroup = getReleaseGroups(releaseTagWithoutPrefix)

const draftReleaseNotes = generateDraftReleaseNotes(
  releaseNotesByGroup,
  shaEntriesByArchitecture
)
const releaseNotesPath = join(__dirname, 'release_notes.txt')

fs.writeFileSync(releaseNotesPath, draftReleaseNotes, { encoding: 'utf8' })

console.log(
  `✅ All done! The release notes have been written to ${releaseNotesPath}`
)

/**
 * Returns the filename (excluding .sha256) and its contents (a SHA256 checksum).
 */
function getShaContents(filePath: string): {
  filename: string
  checksum: string
} {
  const filename = basename(filePath).slice(0, -7)
  const checksum = fs.readFileSync(filePath, 'utf8')

  return { filename, checksum }
}

function extractIds(str: string): Array<number> {
  const idRegex = /#(\d+)/g

  const idArray = new Array<number>()
  let match

  while ((match = idRegex.exec(str))) {
    const textValue = match[1].trim()
    const numValue = parseInt(textValue, 10)
    if (!isNaN(numValue)) {
      idArray.push(numValue)
    }
  }

  return idArray
}

function parseCategory(str: string): ReleaseNotesGroupType | null {
  const input = str.toLocaleLowerCase()
  switch (input) {
    case 'added':
    case 'fixed':
    case 'improved':
    case 'new':
    case 'removed':
      return input
    default:
      return null
  }
}

function getReleaseGroups(version: string): ReleaseNotesGroups {
  if (!version.endsWith('-linux1')) {
    return {
      new: [],
      added: [],
      fixed: [],
      improved: [],
      removed: [],
    }
  }

  const upstreamVersion = version.replace('-linux1', '')
  const rootDir = dirname(__dirname)
  const changelogFile = fs.readFileSync(join(rootDir, 'changelog.json'))
  const changelogJson = JSON.parse(changelogFile)
  const releases = changelogJson['releases']
  const changelogForVersion: Array<string> | undefined =
    releases[upstreamVersion]

  if (!changelogForVersion) {
    console.error(
      `🔴 Changelog version ${upstreamVersion} not found in changelog.json, which is required for publishing a release based off an upstream releease. Aborting...`
    )
    process.exit(1)
  }

  console.log(`found release notes`, changelogForVersion)

  const releaseNotesByGroup: ReleaseNotesGroups = {
    new: [],
    added: [],
    fixed: [],
    improved: [],
    removed: [],
  }

  const releaseEntryExternalContributor = /\[(.*)\](.*)- (.*)\. Thanks (.*)!/
  const releaseEntryRegex = /\[(.*)\](.*)- (.*)/

  for (const entry of changelogForVersion) {
    const externalMatch = releaseEntryExternalContributor.exec(entry)
    if (externalMatch) {
      const category = parseCategory(externalMatch[1])
      const text = externalMatch[2].trim()
      const ids = extractIds(externalMatch[3])
      const contributor = externalMatch[4]

      if (!category) {
        console.warn(`unable to identify category for '${entry}'`)
      } else {
        releaseNotesByGroup[category].push({
          text,
          ids,
          contributor,
        })
      }
    } else {
      const match = releaseEntryRegex.exec(entry)
      if (match) {
        const category = parseCategory(match[1])
        const text = match[2].trim()
        const ids = extractIds(match[3])
        if (!category) {
          console.warn(`unable to identify category for '${entry}'`)
        } else {
          releaseNotesByGroup[category].push({
            text,
            ids,
          })
        }
      } else {
        console.warn(`release entry does not match any format: '${entry}'`)
      }
    }
  }

  return releaseNotesByGroup
}

function formatReleaseNote(note: ReleaseNoteEntry): string {
  const idsAsUrls = note.ids
    .map(id => `https://github.com/desktop/desktop/issues/${id}`)
    .join(' ')
  const contributorNote = note.contributor
    ? `. Thanks ${note.contributor}!`
    : ''

  const template = ` - ${note.text} - ${idsAsUrls}${contributorNote}`

  return template.trim()
}

function renderSection(
  name: string,
  items: Array<ReleaseNoteEntry>,
  omitIfEmpty: boolean = true
): string {
  if (items.length === 0 && omitIfEmpty) {
    return ''
  }

  const itemsText =
    items.length === 0 ? 'TODO' : items.map(formatReleaseNote).join('\n')

  return `
## ${name}

${itemsText}
  `
}

function formatEntry(e: ChecksumEntry): string {
  return `**${e.filename}**\n${e.checksum}\n`
}

function renderArchitectureIfNotEmpty(
  name: string,
  items: Array<ChecksumEntry>
): string {
  if (items.length === 0) {
    return ''
  }

  const itemsText = items.map(formatEntry).join('\n')

  return `
  
## ${name}

${itemsText}
  `
}

/**
 * Takes the release notes entries and the SHA entries, then merges them into the full draft release notes ✨
 */
function generateDraftReleaseNotes(
  releaseNotesGroups: ReleaseNotesGroups,
  shaEntries: ChecksumGroups
): string {
  const draftReleaseNotes = `
${renderSection('New', releaseNotesGroups.new)}
${renderSection('Added', releaseNotesGroups.added)}
${renderSection('Fixed', releaseNotesGroups.fixed, false)}
${renderSection('Improved', releaseNotesGroups.improved, false)}
${renderSection('Removed', releaseNotesGroups.removed)}

## SHA-256 checksums

${renderArchitectureIfNotEmpty('x64', shaEntries.x64)}
${renderArchitectureIfNotEmpty('ARM64', shaEntries.arm64)}
${renderArchitectureIfNotEmpty('ARM', shaEntries.arm)}`

  return draftReleaseNotes
}
