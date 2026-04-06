/**
 * CI helper for the Draft Release workflow (.github/workflows/draft-release.yml).
 *
 * Reuses the same functions as `yarn draft-release` so there is a single source
 * of truth for version computation, tag discovery, and changelog aggregation.
 *
 * Usage (from repo root):
 *   yarn ts-node -P script/tsconfig.json script/draft-release/ci.ts <command> [args]
 *
 * Commands:
 *   version <channel>
 *     Discovers the previous release tag and computes the next version.
 *     Writes GitHub Actions outputs to $GITHUB_OUTPUT when running in Actions
 *     and logs key=value pairs to stdout:
 *       previous, next, latest-beta (production only)
 *
 *   changelog-entries <previous-version>
 *     Aggregates tagged changelog entries from changelog.json for versions
 *     newer than <previous-version>. Used for production releases.
 *     Outputs a JSON array of entry strings.
 *
 *   prepare <next-version> <entries-json>
 *     Bumps app/package.json to <next-version> and prepends entries to
 *     changelog.json. Used in the commit step.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { getLatestRelease } from './tags'
import { getNextVersionNumber } from './version'
import { getChangelogEntriesSince } from '../changelog/parser'
import { Channel } from './channel'

const repoRoot = join(__dirname, '..', '..')

function parseChannel(arg: string): Channel {
  if (arg === 'production' || arg === 'beta') {
    return arg
  }
  throw new Error(`Invalid channel: ${arg}. Must be 'production' or 'beta'.`)
}

/**
 * Writes key=value pairs to $GITHUB_OUTPUT if running in Actions,
 * otherwise prints them to stdout.
 */
function setOutput(pairs: Record<string, string>): void {
  const outputFile = process.env.GITHUB_OUTPUT
  const lines = Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  if (outputFile) {
    appendFileSync(outputFile, lines + '\n')
  }

  // Always print for visibility in logs
  for (const [k, v] of Object.entries(pairs)) {
    console.log(`${k}=${v}`)
  }
}

async function commandVersion(channel: Channel): Promise<void> {
  const previous = await getLatestRelease({
    excludeBetaReleases: channel === 'production',
    excludeTestReleases: true,
  })

  const next = getNextVersionNumber(previous, channel)

  const outputs: Record<string, string> = { previous, next }

  // For production releases, also discover the latest beta tag so the
  // workflow can branch from it (avoids shipping untested code).
  if (channel === 'production') {
    // getLatestRelease can filter OUT betas but not filter TO only betas,
    // so we call it with betas included and check if the result is a beta.
    // If the latest overall tag is a production tag (e.g., 3.5.7 > 3.5.7-beta3),
    // we need to look through all tags manually to find the latest beta.
    const { sort: semverSort } = await import('semver')
    const { sh } = await import('../sh')
    const allTags = (await sh('git', 'tag'))
      .split('\n')
      .filter(
        tag =>
          tag.startsWith('release-') &&
          !tag.includes('-linux') &&
          !tag.includes('-test') &&
          tag.includes('-beta')
      )
      .map(tag => tag.substring(8))

    const sortedBetas = semverSort(allTags.filter(Boolean))
    const latestBeta = sortedBetas.at(-1)

    if (!latestBeta) {
      throw new Error(
        'Unable to determine the latest beta release tag for a production release.'
      )
    }

    outputs['latest-beta'] = String(latestBeta)
  }

  console.log(`📦 Previous: ${previous} → Next: ${next}`)
  if (outputs['latest-beta']) {
    console.log(`📌 Latest beta: ${outputs['latest-beta']} (branch base)`)
  }

  setOutput(outputs)
}

function commandChangelogEntries(previousVersion: string): void {
  const entries = getChangelogEntriesSince(previousVersion)
  console.log(JSON.stringify(entries))
}

function commandPrepare(nextVersion: string, entriesJson: string): void {
  // Bump app/package.json
  const pkgPath = join(repoRoot, 'app', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = nextVersion
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`✅ Set app/package.json version to ${nextVersion}`)

  // Prepend to changelog.json
  const changelogPath = join(repoRoot, 'changelog.json')
  const changelog = JSON.parse(readFileSync(changelogPath, 'utf8'))
  const entries: ReadonlyArray<string> = JSON.parse(entriesJson)
  changelog.releases = { [nextVersion]: entries, ...changelog.releases }
  writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + '\n')
  console.log(
    `✅ Added ${entries.length} entries to changelog.json under ${nextVersion}`
  )
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case 'version': {
      const channel = parseChannel(args[0])
      await commandVersion(channel)
      break
    }
    case 'changelog-entries': {
      const previousVersion = args[0]
      if (!previousVersion) {
        throw new Error('Usage: ci.ts changelog-entries <previous-version>')
      }
      commandChangelogEntries(previousVersion)
      break
    }
    case 'prepare': {
      const nextVersion = args[0]
      const entriesJson = args[1]
      if (!nextVersion || !entriesJson) {
        throw new Error('Usage: ci.ts prepare <next-version> <entries-json>')
      }
      commandPrepare(nextVersion, entriesJson)
      break
    }
    default:
      throw new Error(
        `Unknown command: ${command}. Use 'version', 'changelog-entries', or 'prepare'.`
      )
  }
}

main().catch(e => {
  console.error(`::error::${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
