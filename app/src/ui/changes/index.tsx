import * as React from 'react'
import { ChangesList } from './changes-list'
import { Diff  } from '../diff'
import { DiffSelection, DiffSelectionType } from '../../models/diff'
import { IChangesState, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Dispatcher, IGitHubUser } from '../../lib/dispatcher'
import { Resizable } from '../resizable'
import { CommitIdentity } from '../../models/commit-identity'
import { Commit } from '../../lib/local-git-operations'
import { UndoCommit } from './undo-commit'

interface IChangesProps {
  readonly repository: Repository
  readonly changes: IChangesState
  readonly dispatcher: Dispatcher
  readonly commitAuthor: CommitIdentity | null
  readonly branch: string | null
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly mostRecentLocalCommit: Commit | null
}

/** TODO: handle "repository not found" scenario */

export class Changes extends React.Component<IChangesProps, void> {
  private onCreateCommit(summary: string, description: string) {
    this.props.dispatcher.commitIncludedChanges(this.props.repository, summary, description)
  }

  private onFileSelectionChanged(row: number) {
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

  private onDiffLineIncludeChanged(diffSelection: DiffSelection) {
    const file = this.props.changes.selectedFile
    if (!file) {
      console.error('diff line selection changed despite no file error - what?')
      return
    }

    this.props.dispatcher.changeFileLineSelection(this.props.repository, file, diffSelection)
  }

  private onDiscardChanges(row: number) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: this.props.repository,
      files: [ file ],
    })
  }

  /**
   * Toggles the selection of a given working directory file.
   * If the file is partially selected it the selection is cleared
   * in order to match the behavior of clicking on an indeterminate
   * checkbox.
   */
  private onToggleInclude(row: number) {
    const workingDirectory = this.props.changes.workingDirectory
    const file = workingDirectory.files[row]

    if (!file) {
      console.error('keyboard selection toggle despite no file - what?')
      return
    }

    const currentSelection = file.selection.getSelectionType()

    this.props.dispatcher.changeFileIncluded(this.props.repository, file, currentSelection === DiffSelectionType.None)
  }

  /**
   * Handles keyboard events from the List item container, note that this is
   * Not the same thing as the element returned by the row renderer in ChangesList
   */
  private onChangedItemKeyDown(row: number, event: React.KeyboardEvent<any>) {
    // Toggle selection when user presses the spacebar while focused on a list item
    if (event.key === ' ') {
      event.preventDefault()
      this.onToggleInclude(row)
    }
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

  private renderMostRecentLocalCommit() {
    const commit = this.props.mostRecentLocalCommit
    if (!commit) { return null }

    return <UndoCommit commit={commit} onUndo={() => this.props.dispatcher.undoCommit(this.props.repository, commit)}/>
  }

  public render() {
    const selectedPath = this.props.changes.selectedFile ? this.props.changes.selectedFile!.path : null

    // TODO: I think user will expect the avatar to match that which
    // they have configured in GitHub.com as well as GHE so when we add
    // support for GHE we should revisit this and try to update the logic
    // to look up based on email _and_ host.
    const email = this.props.commitAuthor ? this.props.commitAuthor.email : null
    let user: IGitHubUser | null = null
    if (email) {
      user = this.props.gitHubUsers.get(email.toLowerCase()) || null
    }

    const avatarURL = user ? user.avatarURL : 'https://github.com/hubot.png'
    return (
      <div className='panel-container'>
        <Resizable configKey='changes-width'>
          <ChangesList repository={this.props.repository}
                       workingDirectory={this.props.changes.workingDirectory}
                       selectedPath={selectedPath}
                       onFileSelectionChanged={file => this.onFileSelectionChanged(file) }
                       onCreateCommit={(summary, description) => this.onCreateCommit(summary, description)}
                       onIncludeChanged={(row, include) => this.onIncludeChanged(row, include)}
                       onSelectAll={selectAll => this.onSelectAll(selectAll)}
                       onDiscardChanges={row => this.onDiscardChanges(row)}
                       onRowKeyDown={(row, e) => this.onChangedItemKeyDown(row, e)}
                       commitAuthor={this.props.commitAuthor}
                       branch={this.props.branch}
                       avatarURL={avatarURL}
                       emoji={this.props.emoji}
                       contextualCommitMessage={this.props.changes.contextualCommitMessage}/>
          {this.renderMostRecentLocalCommit()}
        </Resizable>

        {this.renderDiff()}
      </div>
    )
  }
}
