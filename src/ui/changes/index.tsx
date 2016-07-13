import * as React from 'react'
import ChangesList from './changes-list'
import FileDiff from '../file-diff'

import Repository from '../../models/repository'

interface ChangesProps {
  selectedRepo: Repository
}

/** TODO: handle "repository not found" scenario */

export default class Changes extends React.Component<ChangesProps, void> {

  public constructor(props: ChangesProps) {
    super(props)
  }

  private renderNoSelection() {
    return (
      <div id='changes'>
        <div>No repo selected!</div>
      </div>
    )
  }

  public render() {

    const repo = this.props.selectedRepo
    if (!repo) {
      return this.renderNoSelection()
    }

    return (
      <div id='changes'>
        <ChangesList repository={this.props.selectedRepo} />
        <FileDiff/>
      </div>
    )
  }
}
