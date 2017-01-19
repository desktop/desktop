import { git } from './core'

import { Tip, TipState } from '../../models/tip'
import { getCurrentBranch } from './for-each-ref'
import { Repository } from '../../models/repository'

import { fatalError } from '../../lib/fatal-error'

/** Get the name of the current branch. */
export async function getTip(repository: Repository): Promise<Tip> {

  const revParse = await git([ 'rev-parse', 'HEAD' ], repository.path, 'getTip', { successExitCodes: new Set([ 0, 128 ]) })
  if (revParse.exitCode === 128) {
    // fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
    return {
      kind: TipState.Unborn,
    }
  }

  const currentSha = revParse.stdout.trim()

  const symbolicRef = await git([ 'symbolic-ref', 'HEAD' ], repository.path, 'getTip', { successExitCodes: new Set([ 0, 128 ]) })
  if (symbolicRef.exitCode === 128) {
    // fatal: ref HEAD is not a symbolic ref
    return {
      kind: TipState.Detached,
      currentSha,
    }
  }

  const currentBranch = await getCurrentBranch(repository)
  if (!currentBranch) {
    fatalError(`getTip failed despite all the previous guard checks`)
    return { kind: TipState.Unknown }
  }

  return {
    kind: TipState.Valid,
    branch: currentBranch,
  }
}
