import byline from 'byline'
import { Branch } from '../../models/branch'
import { ComputedAction } from '../../models/computed-action'
import { MergeTreeResult } from '../../models/merge'
import { Repository } from '../../models/repository'
import { isErrnoException } from '../errno-exception'
import { getMergeBase } from './merge'
import { spawnGit } from './spawn'

// the merge-tree output is a collection of entries like this
//
// changed in both
//  base   100644 f69fbc5c40409a1db7a3f8353bfffe46a21d6054 atom/browser/resources/mac/Info.plist
//  our    100644 9094f0f7335edf833d51f688851e6a105de60433 atom/browser/resources/mac/Info.plist
//  their  100644 2dd8bc646cff3869557549a39477e30022e6cfdd atom/browser/resources/mac/Info.plist
// @@ -17,9 +17,15 @@
// <key>CFBundleIconFile</key>
// <string>electron.icns</string>
// <key>CFBundleVersion</key>
// +<<<<<<< .our
// <string>4.0.0</string>
// <key>CFBundleShortVersionString</key>
// <string>4.0.0</string>
// +=======
// +  <string>1.4.16</string>
// +  <key>CFBundleShortVersionString</key>
// +  <string>1.4.16</string>
// +>>>>>>> .their
// <key>LSApplicationCategoryType</key>
//<string>public.app-category.developer-tools</string>
// <key>LSMinimumSystemVersion</key>

// The first line for each entry is what I'm referring to as the the header
// This regex filters on the known entries that can appear
const contextHeaderRe =
  /^(merged|added in remote|removed in remote|changed in both|removed in local|added in both)$/

const conflictMarkerRe = /^\+[<>=]{7}$/

export async function determineMergeability(
  repository: Repository,
  ours: Branch,
  theirs: Branch
): Promise<MergeTreeResult> {
  const mergeBase = await getMergeBase(repository, ours.tip.sha, theirs.tip.sha)

  if (mergeBase === null) {
    return { kind: ComputedAction.Invalid }
  }

  if (mergeBase === ours.tip.sha || mergeBase === theirs.tip.sha) {
    return { kind: ComputedAction.Clean }
  }

  const process = await spawnGit(
    ['merge-tree', mergeBase, ours.tip.sha, theirs.tip.sha],
    repository.path,
    'mergeTree'
  )

  return await new Promise<MergeTreeResult>((resolve, reject) => {
    let seenConflictMarker = false
    let conflictedFiles = 0

    process.stdout?.pipe(byline()).on('data', (line: string) => {
      if (contextHeaderRe.test(line)) {
        if (seenConflictMarker) {
          conflictedFiles++
          seenConflictMarker = false
        }
      } else if (conflictMarkerRe.test(line)) {
        seenConflictMarker = true
      }
    })

    process.on('error', err => {
      // If this is an exception thrown by Node.js while attempting to
      // spawn let's keep the salient details but include the name of
      // the operation.
      if (isErrnoException(err)) {
        reject(new Error(`Failed to execute merge-tree: ${err.code}`))
      } else {
        // for unhandled errors raised by the process, let's surface this in the
        // promise and make the caller handle it
        reject(err)
      }
    })

    process.on('exit', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`merge-tree exited with code '${code}'`))
        return
      }

      if (seenConflictMarker) {
        conflictedFiles++
      }

      resolve(
        conflictedFiles > 0
          ? { kind: ComputedAction.Conflicts, conflictedFiles }
          : { kind: ComputedAction.Clean }
      )
    })
  })
}
