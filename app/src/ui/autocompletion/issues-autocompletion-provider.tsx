import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { IssuesStore, IIssueHit } from '../../lib/stores/issues-store'
import { Dispatcher } from '../dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import {
  getNonForkGitHubRepository,
  RepositoryWithGitHubRepository,
} from '../../models/repository'
import { GitHubRepository } from '../../models/github-repository'

/** The interval we should use to throttle the issues update. */
const UpdateIssuesThrottleInterval = 1000 * 60

/** The autocompletion provider for issues in a GitHub repository. */
export class IssuesAutocompletionProvider
  implements IAutocompletionProvider<IIssueHit> {
  public readonly kind = 'issue'

  private readonly issuesStore: IssuesStore
  private readonly repository: RepositoryWithGitHubRepository
  private readonly ghRepo: GitHubRepository
  private readonly dispatcher: Dispatcher

  /**
   * The scheduler used to throttle calls to update the issues for
   * autocompletion.
   */
  private readonly updateIssuesScheduler = new ThrottledScheduler(
    UpdateIssuesThrottleInterval
  )

  public constructor(
    issuesStore: IssuesStore,
    repository: RepositoryWithGitHubRepository,
    dispatcher: Dispatcher
  ) {
    this.issuesStore = issuesStore
    this.repository = repository
    this.ghRepo = getNonForkGitHubRepository(repository)
    this.dispatcher = dispatcher
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?:#)([a-z\d\\+-][a-z\d_]*)?/g
  }

  public getAutocompletionItems(
    text: string
  ): Promise<ReadonlyArray<IIssueHit>> {
    this.updateIssuesScheduler.queue(() => {
      this.dispatcher.refreshIssues(this.repository)
    })

    return this.issuesStore.getIssuesMatching(this.ghRepo, text)
  }

  public renderItem(item: IIssueHit): JSX.Element {
    return (
      <div className="issue" key={item.number}>
        <span className="number">#{item.number}</span>
        <span className="title">{item.title}</span>
      </div>
    )
  }

  public getCompletionText(item: IIssueHit): string {
    return `#${item.number}`
  }
}
