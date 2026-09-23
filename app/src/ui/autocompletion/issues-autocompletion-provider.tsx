import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { IssuesStore, IIssueHit } from '../../lib/stores/issues-store'
import { Dispatcher } from '../dispatcher'
import { GitHubRepository } from '../../models/github-repository'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { TooltippedContent } from '../lib/tooltipped-content'

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
    dispatcher: Dispatcher
  ) {
    this.issuesStore = issuesStore
    this.repository = repository
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

    return this.issuesStore.getIssuesMatching(this.repository, text)
  }

  public renderItem(item: IIssueHit, selected: boolean): JSX.Element {
    // Keyboard users never focus the list itself, they move the selection with
    // the arrow keys while focus stays in the input, so the selected item is
    // what stands in for focus here. There's no pointer to anchor to in that
    // case, hence positioning the tooltip relative to the title instead.
    return (
      <div className="issue" key={item.number}>
        <span className="number">#{item.number}</span>&nbsp;
        <TooltippedContent
          className="title"
          tagName="span"
          tooltip={item.title}
          onlyWhenOverflowed={true}
          ancestorFocused={selected}
          positionRelativeToTarget={selected}
        >
          {item.title}
        </TooltippedContent>
      </div>
    )
  }

  public getItemAriaLabel(item: IIssueHit): string {
    return `#${item.number} ${item.title}`
  }

  public getCompletionText(item: IIssueHit): string {
    return `#${item.number}`
  }
}
