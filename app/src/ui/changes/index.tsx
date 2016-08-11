import * as React from 'react'
import { ChangesList } from './changes-list'
import FileDiff from '../file-diff'
import { IChangesState } from '../../lib/app-state'
import Repository from '../../models/repository'
import { Dispatcher, GitUserStore, IGitUser } from '../../lib/dispatcher'
import { Resizable } from '../resizable'

interface IChangesProps {
  repository: Repository
  changes: IChangesState
  dispatcher: Dispatcher
  gitUserStore: GitUserStore
  committerEmail: string | null
  branch: string | null
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {
  private onCreateCommit(summary: string, description: string) {
    this.props.dispatcher.commitIncludedChanges(this.props.repository, summary, description)
  }

  private onSelectionChanged(row: number) {
    const file = this.props.changes.workingDirectory.files[row]
    this.props.dispatcher.changeChangesSelection(this.props.repository, file)
  }

  private onIncludeChanged(row: number, include: boolean) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]
    if (!file) {
      console.error('unable to find working directory path to apply included change: ' + row)
      return
    }

    this.props.dispatcher.changeFileIncluded(this.props.repository, file, include)
  }

  private onSelectAll(selectAll: boolean) {
    this.props.dispatcher.changeIncludeAllFiles(this.props.repository, selectAll)
  }

  public render() {
    const selectedPath = this.props.changes.selectedFile ? this.props.changes.selectedFile!.path : null

    const email = this.props.committerEmail
    let user: IGitUser | null = null
    if (email) {
      user = this.props.gitUserStore.getUser(this.props.repository, email)
      if (!user) {
        this.props.dispatcher.loadAndCacheUser(this.props.repository, null, email)
      }
    }

    const avatarURL = user ? user.avatarURL : 'https://github.com/hubot.png'
    return (
      <div className='panel-container'>
        <Resizable configKey='changes-width'>
          <ChangesList repository={this.props.repository}
                       workingDirectory={this.props.changes.workingDirectory}
                       selectedPath={selectedPath}
                       onSelectionChanged={event => this.onSelectionChanged(event)}
                       onCreateCommit={(summary, description) => this.onCreateCommit(summary, description)}
                       onIncludeChanged={(row, include) => this.onIncludeChanged(row, include) }
                       onSelectAll={selectAll => this.onSelectAll(selectAll) }
                       branch={this.props.branch}
                       avatarURL={avatarURL}/>
        </Resizable>

        <FileDiff repository={this.props.repository}
                  file={this.props.changes.selectedFile}
                  readOnly={false}
                  commit={null} />
      </div>
    )
  }
}
