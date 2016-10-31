import * as React from 'react'
import { Diff } from '../diff'
import { DiffSelection } from '../../models/diff'
import { IChangesState } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'

// At some point we'll make index.tsx only be exports
// see https://github.com/desktop/desktop/issues/383
export { ChangesSidebar } from './changes-sidebar'

interface IChangesProps {
  readonly repository: Repository
  readonly changes: IChangesState
  readonly dispatcher: Dispatcher
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {
  public componentWillReceiveProps(nextProps: IChangesProps) {
    if (nextProps.changes.contextualCommitMessage) {
      // Once we receive the contextual commit message we can clear it. We don't
      // want to keep receiving it.
      nextProps.dispatcher.clearContextualCommitMessage(this.props.repository)
    }
  }


  private onDiffLineIncludeChanged(diffSelection: DiffSelection) {
    const file = this.props.changes.selectedFile
    if (!file) {
      console.error('diff line selection changed despite no file error - what?')
      return
    }

    this.props.dispatcher.changeFileLineSelection(this.props.repository, file, diffSelection)
  }

  private renderDiff() {
    const diff = this.props.changes.diff
    const file = this.props.changes.selectedFile

    if (!diff || !file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    return (
      <Diff repository={this.props.repository}
        file={file}
        readOnly={false}
        onIncludeChanged={(diffSelection) => this.onDiffLineIncludeChanged(diffSelection)}
        diff={diff}
        dispatcher={this.props.dispatcher} />
    )
  }

  public render() {
    return (
      <div className='panel-container'>
        {this.renderDiff()}
      </div>
    )
  }
}
