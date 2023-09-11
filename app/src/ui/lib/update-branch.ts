import { getCommitsBetweenCommits } from '../../lib/git'
import { promiseWithMinimumTimeout } from '../../lib/promise'
import { Branch } from '../../models/branch'
import { ComputedAction } from '../../models/computed-action'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { RebasePreview } from '../../models/rebase'
import { Repository } from '../../models/repository'
import { IDropdownSelectButtonOption } from '../dropdown-select-button'

export function getMergeOptions(): ReadonlyArray<IDropdownSelectButtonOption> {
  return [
    {
      label: 'Create a merge commit',
      description:
        'The commits from the selected branch will be added to the current branch via a merge commit.',
      id: MultiCommitOperationKind.Merge,
    },
    {
      label: 'Squash and merge',
      description:
        'The commits in the selected branch will be combined into one commit in the current branch.',
      id: MultiCommitOperationKind.Squash,
    },
    {
      label: 'Rebase',
      description:
        'The commits from the selected branch will be rebased and added to the current branch.',
      id: MultiCommitOperationKind.Rebase,
    },
  ]
}

export async function updateRebasePreview(
  baseBranch: Branch,
  targetBranch: Branch,
  repository: Repository,
  onUpdate: (rebasePreview: RebasePreview | null) => void
) {
  const computingRebaseForBranch = baseBranch.name

  onUpdate({
    kind: ComputedAction.Loading,
  })

  const commits = await promiseWithMinimumTimeout(
    () =>
      getCommitsBetweenCommits(
        repository,
        baseBranch.tip.sha,
        targetBranch.tip.sha
      ),
    500
  )

  // if the branch being track has changed since we started this work, abandon
  // any further state updates (this function is re-entrant if the user is
  // using the keyboard to quickly switch branches)
  if (computingRebaseForBranch !== baseBranch.name) {
    onUpdate(null)
    return
  }

  // if we are unable to find any commits to rebase, indicate that we're
  // unable to proceed with the rebase
  if (commits === null) {
    onUpdate({
      kind: ComputedAction.Invalid,
    })
    return
  }

  onUpdate({
    kind: ComputedAction.Clean,
    commits,
  })
}
