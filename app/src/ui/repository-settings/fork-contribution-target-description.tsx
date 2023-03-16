import * as React from 'react'
import { ForkContributionTarget } from '../../models/workflow-preferences'
import { RepositoryWithForkedGitHubRepository } from '../../models/repository'

interface IForkSettingsDescription {
  readonly repository: RepositoryWithForkedGitHubRepository
  readonly forkContributionTarget: ForkContributionTarget
}

export function ForkSettingsDescription(props: IForkSettingsDescription) {
  // We can't use the getNonForkGitHubRepository() helper since we need to calculate
  // the value based on the temporary form state.
  const targetRepository =
    props.forkContributionTarget === ForkContributionTarget.Self
      ? props.repository.gitHubRepository
      : props.repository.gitHubRepository.parent

  return (
    <ul className="fork-settings-description">
      <li>
        Pull requests targeting <strong>{targetRepository.fullName}</strong>{' '}
        will be shown in the pull request list.
      </li>
      <li>
        Issues will be created in <strong>{targetRepository.fullName}</strong>.
      </li>
      <li>
        "View on Github" will open <strong>{targetRepository.fullName}</strong>{' '}
        in the browser.
      </li>
      <li>
        New branches will be based on{' '}
        <strong>{targetRepository.fullName}</strong>'s default branch.
      </li>
      <li>
        Autocompletion of user and issues will be based on{' '}
        <strong>{targetRepository.fullName}</strong>.
      </li>
    </ul>
  )
}
