import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'

import Repository from '../../models/repository'

interface ChangesProps {
  selectedRepo: Repository
}

interface ChangesState {
  selectedRow: number
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<ChangesProps, ChangesState> {

  public constructor(props: ChangesProps) {
    super(props)

    this.state = {
      selectedRow: -1
    }
  }

  private handleSelectionChanged(row: number) {
    // TODO: show file diff for selected item
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
        <ChangesList repository={this.props.selectedRepo}
                     selectedRow={this.state.selectedRow}
                     onSelectionChanged={event => this.handleSelectionChanged(event)}/>
        <FileDiff/>
      </div>
    )
  }
}
