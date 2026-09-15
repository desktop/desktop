import {
  getNonForkGitHubRepository,
  isRepositoryWithGitHubRepository,
  Repository,
} from '../../models/repository'
import {
  CoAuthorAutocompletionProvider,
  EmojiAutocompletionProvider,
  IAutocompletionProvider,
  IssuesAutocompletionProvider,
  UserAutocompletionProvider,
} from '.'
import { Dispatcher } from '../dispatcher'
import { GitHubUserStore, IssuesStore } from '../../lib/stores'
import { Account } from '../../models/account'
import { Emoji } from '../../lib/emoji'

export function buildAutocompletionProviders(
  repository: Repository,
  dispatcher: Dispatcher,
  emoji: Map<string, Emoji>,
  issuesStore: IssuesStore,
  gitHubUserStore: GitHubUserStore,
  accounts: ReadonlyArray<Account>
): IAutocompletionProvider<any>[] {
  const autocompletionProviders: IAutocompletionProvider<any>[] = [
    new EmojiAutocompletionProvider(emoji),
  ]

  // Issues autocompletion is only available for GitHub repositories.
  const gitHubRepository = isRepositoryWithGitHubRepository(repository)
    ? getNonForkGitHubRepository(repository)
    : null

  if (gitHubRepository !== null) {
    autocompletionProviders.push(
      new IssuesAutocompletionProvider(
        issuesStore,
        gitHubRepository,
        dispatcher
      )
    )

    const account = accounts.find(a => a.endpoint === gitHubRepository.endpoint)

    autocompletionProviders.push(
      new UserAutocompletionProvider(
        gitHubUserStore,
        gitHubRepository,
        account
      ),
      new CoAuthorAutocompletionProvider(
        gitHubUserStore,
        gitHubRepository,
        account
      )
    )
  }

  return autocompletionProviders
}
