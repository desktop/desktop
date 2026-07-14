import * as Fs from 'fs'
import * as Path from 'path'

interface IGitDirectories {
  readonly gitDir: string
  readonly commonGitDir: string
}

function resolveGitDirectories(gitPath: string): IGitDirectories {
  // eslint-disable-next-line no-sync
  const gitPathStat = Fs.statSync(gitPath)

  if (gitPathStat.isDirectory()) {
    return { gitDir: gitPath, commonGitDir: gitPath }
  }

  // eslint-disable-next-line no-sync
  const gitFileContents = Fs.readFileSync(gitPath, 'utf8')
  const gitDirMatch = /^gitdir:\s*(.+)\s*$/m.exec(gitFileContents)

  if (gitDirMatch === null) {
    throw new Error(
      `Invalid .git file contents in ${gitPath}: ${gitFileContents}`
    )
  }

  const gitDir = Path.resolve(Path.dirname(gitPath), gitDirMatch[1])
  const commonDirPath = Path.join(gitDir, 'commondir')

  try {
    // eslint-disable-next-line no-sync
    const commonDir = Fs.readFileSync(commonDirPath, 'utf8').trim()
    return {
      gitDir,
      commonGitDir: Path.resolve(gitDir, commonDir),
    }
  } catch (err) {
    return { gitDir, commonGitDir: gitDir }
  }
}

function readRefFile(gitDir: string, ref: string): string | null {
  const refPath = Path.join(gitDir, ref)

  try {
    // eslint-disable-next-line no-sync
    Fs.statSync(refPath)
  } catch (err) {
    return null
  }

  // eslint-disable-next-line no-sync
  return Fs.readFileSync(refPath, 'utf8')
}

/**
 * Attempt to find a ref in the .git/packed-refs file, which is often
 * created by Git as part of cleaning up loose refs in the repository.
 *
 * Will return null if the packed-refs file is missing.
 * Will throw an error if the entry is not found in the packed-refs file
 *
 * @param gitDir The path to the Git repository's .git directory
 * @param ref    A qualified git ref such as 'refs/heads/main'
 */
function readPackedRefsFile(gitDir: string, ref: string): string | null {
  const packedRefsPath = Path.join(gitDir, 'packed-refs')

  try {
    // eslint-disable-next-line no-sync
    Fs.statSync(packedRefsPath)
  } catch (err) {
    // fail quietly if packed-refs not found
    return null
  }

  // eslint-disable-next-line no-sync
  const packedRefsContents = Fs.readFileSync(packedRefsPath, 'utf8')

  // we need to build up the regex on the fly using the ref
  const refRe = new RegExp('([a-f0-9]{40}) ' + ref)
  const packedRefMatch = refRe.exec(packedRefsContents)

  if (!packedRefMatch) {
    throw new Error(`Could not find ref entry in .git/packed-refs file: ${ref}`)
  }
  return packedRefMatch[1]
}

/**
 * Attempt to dereference the given ref without requiring a Git environment
 * to be present. Note that this method will not be able to dereference packed
 * refs but should suffice for simple refs like 'HEAD'.
 *
 * Will throw an error for unborn HEAD.
 *
 * @param   gitDir The path to the Git repository's .git directory
 * @param   ref    A qualified git ref such as 'HEAD' or 'refs/heads/main'
 * @returns        The ref SHA
 */
function revParse(gitDir: string, commonGitDir: string, ref: string): string {
  const refContents =
    readRefFile(gitDir, ref) ??
    (gitDir !== commonGitDir ? readRefFile(commonGitDir, ref) : null)

  if (refContents === null) {
    const packedRefMatch =
      readPackedRefsFile(gitDir, ref) ??
      (gitDir !== commonGitDir ? readPackedRefsFile(commonGitDir, ref) : null)

    if (packedRefMatch !== null) {
      return packedRefMatch
    }

    throw new Error(
      `Could not de-reference HEAD to SHA, ref does not exist on disk: ${Path.join(
        gitDir,
        ref
      )}`
    )
  }

  const refRe = /^([a-f0-9]{40})|(?:ref: (refs\/.*))$/m
  const refMatch = refRe.exec(refContents)

  if (!refMatch) {
    throw new Error(
      `Could not de-reference HEAD to SHA, invalid ref in ${Path.join(
        gitDir,
        ref
      )}: ${refContents}`
    )
  }

  return refMatch[1] || revParse(gitDir, commonGitDir, refMatch[2])
}

export function getSHA(gitPath = Path.resolve(__dirname, '../.git')) {
  // CircleCI does some funny stuff where HEAD points to an packed ref, but
  // luckily it gives us the SHA we want in the environment.
  const circleSHA = process.env.CIRCLE_SHA1
  if (circleSHA != null) {
    return circleSHA
  }

  const { gitDir, commonGitDir } = resolveGitDirectories(gitPath)

  return revParse(gitDir, commonGitDir, 'HEAD')
}
