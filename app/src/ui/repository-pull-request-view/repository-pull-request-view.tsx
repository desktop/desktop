import * as React from 'react'
import { UiView } from '../ui-view'
import { PullRequestCompareBar } from './pull-request-compare-bar'

export class RepositoryPullRequestView extends React.Component<{}> {
  public render() {
    return (
      <UiView id="repository-pull-request-view">
        <PullRequestCompareBar />
      </UiView>
    )
  }
}
