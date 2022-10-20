import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { IssuesStore, IIssueHit } from '../../lib/stores/issues-store'
import { Dispatcher } from '../dispatcher'
import { GitHubRepository } from '../../models/github-repository'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { RichText } from '../lib/rich-text'
import { TooltipDirection } from '../lib/tooltip'

/** The interval we should use to throttle the issues update. */
const UpdateIssuesThrottleInterval = 1000 * 60

/** The autocompletion provider for issues in a GitHub repository. */
export class IssuesAutocompletionProvider
  implements IAutocompletionProvider<IIssueHit>
{
  public readonly kind = 'issue'

  private readonly issuesStore: IssuesStore
  private readonly repository: GitHubRepository
  private readonly dispatcher: Dispatcher
  private readonly emoji: Map<string, string>

  /**
   * The scheduler used to throttle calls to update the issues for
   * autocompletion.
   */
  private readonly updateIssuesScheduler = new ThrottledScheduler(
    UpdateIssuesThrottleInterval
  )

  public constructor(
    issuesStore: IssuesStore,
    repository: GitHubRepository,
    dispatcher: Dispatcher,
    emoji: Map<string, string>
  ) {
    this.issuesStore = issuesStore
    this.repository = repository
    this.dispatcher = dispatcher
    this.emoji = emoji
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

    return this.issuesStore.getIssuesMatching(this.repository, text)
  }

  public renderItem(item: IIssueHit): JSX.Element {
    return (
      <div className="issue" key={item.number}>
        <RichText
          emoji={this.emoji}
          text={`#${item.number} ${item.title}`}
          renderUrlsAsLinks={false}
          tooltipDirection={TooltipDirection.EAST}
        />
      </div>
    )
  }

  public getCompletionText(item: IIssueHit): string {
    return `#${item.number}`
  }
}
