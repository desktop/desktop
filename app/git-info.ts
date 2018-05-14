import * as Fs from 'fs'
import * as Path from 'path'

/**
 * Attempt to find a ref in the .git/packed-refs file, which is often
 * created by Git as part of cleaning up loose refs in the repository.
 *
 * Will return null if the packed-refs file is missing.
 * Will throw an error if the entry is not found in the packed-refs file
 *
 * @param gitDir The path to the Git repository's .git directory
 * @param ref    A qualified git ref such as 'refs/heads/master'
 */
function readPackedRefsFile(gitDir: string, ref: string) {
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
 * @param   ref    A qualified git ref such as 'HEAD' or 'refs/heads/master'
 * @returns        The ref SHA
 */
function revParse(gitDir: string, ref: string): string {
  const refPath = Path.join(gitDir, ref)

  try {
    // eslint-disable-next-line no-sync
    Fs.statSync(refPath)
  } catch (err) {
    const packedRefMatch = readPackedRefsFile(gitDir, ref)
    if (packedRefMatch) {
      return packedRefMatch
    }

    throw new Error(
      `Could not de-reference HEAD to SHA, ref does not exist on disk: ${refPath}`
    )
  }
  // eslint-disable-next-line no-sync
  const refContents = Fs.readFileSync(refPath, 'utf8')
  const refRe = /^([a-f0-9]{40})|(?:ref: (refs\/.*))$/m
  const refMatch = refRe.exec(refContents)

  if (!refMatch) {
    throw new Error(
      `Could not de-reference HEAD to SHA, invalid ref in ${refPath}: ${refContents}`
    )
  }

  return refMatch[1] || revParse(gitDir, refMatch[2])
}

export function getSHA() {
  // CircleCI does some funny stuff where HEAD points to an packed ref, but
  // luckily it gives us the SHA we want in the environment.
  const circleSHA = process.env.CIRCLE_SHA1
  if (circleSHA != null) {
    return circleSHA
  }

  return revParse(Path.resolve(__dirname, '../.git'), 'HEAD')
}
