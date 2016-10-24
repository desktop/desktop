import * as React from 'react'
import { IAutocompletionProvider } from './index'
import { IssuesStore } from '../../lib/dispatcher'

export interface IIssueHit {
  readonly title: string
  readonly number: string
}

export class IssuesAutocompletionProvider implements IAutocompletionProvider<IIssueHit> {
  private readonly issuesStore: IssuesStore

  public constructor(issuesStore: IssuesStore) {
    this.issuesStore = issuesStore
  }

  public getRegExp(): RegExp {
    return /(?:^|\n| )(?:#)([a-z0-9\\+\\-][a-z0-9_]*)?/g
  }

  public getAutocompletionItems(text: string): Promise<ReadonlyArray<IIssueHit>> {
    return Promise.resolve([])
  }

  public renderItem(item: IIssueHit): JSX.Element {
    return (
      <div>
        <span>{item.number}</span><span>{item.title}</span>
      </div>
    )
  }

  public getCompletionText(item: IIssueHit): string {
    return item.number
  }
}
