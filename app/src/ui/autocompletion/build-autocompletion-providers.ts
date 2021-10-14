import {
  getNonForkGitHubRepository,
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import {
  EmojiAutocompletionProvider,
  IAutocompletionProvider,
  IssuesAutocompletionProvider,
  UserAutocompletionProvider,
} from '.'
import { Dispatcher } from '../dispatcher'
import { GitHubUserStore, IssuesStore } from '../../lib/stores'
import { Account } from '../../models/account'

export function buildAutocompletionProviders(
  repository: Repository,
  dispatcher: Dispatcher,
  emoji: Map<string, string>,
  issuesStore: IssuesStore,
  gitHubUserStore: GitHubUserStore,
  accounts: ReadonlyArray<Account>
): IAutocompletionProvider<any>[] {
  const autocompletionProviders: IAutocompletionProvider<any>[] = [
    new EmojiAutocompletionProvider(emoji),
  ]

  // Issues autocompletion is only available for GitHub repositories.
  if (isRepositoryWithGitHubRepository(repository)) {
    autocompletionProviders.push(
      new IssuesAutocompletionProvider(issuesStore, repository, dispatcher)
    )
    const ghRepo = getNonForkGitHubRepository(repository)
    const account = accounts.find(a => a.endpoint === ghRepo.endpoint)

    autocompletionProviders.push(
      new UserAutocompletionProvider(gitHubUserStore, ghRepo, account)
    )
  }

  return autocompletionProviders
}
