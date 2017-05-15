import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { List, ClickSource } from '../list'

import { WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { ICommitMessage } from '../../lib/app-state'
import { IGitHubUser } from '../../lib/dispatcher'
import { IAutocompletionProvider } from '../autocompletion'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

const RowHeight = 29

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFileID: string | null
  readonly onFileSelectionChanged: (row: number) => void
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (message: ICommitMessage) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly onDiscardAllChanges: (files: ReadonlyArray<WorkingDirectoryFileChange>) => void
  readonly branch: string | null
  readonly commitAuthor: CommitIdentity | null
  readonly gitHubUser: IGitHubUser | null
  readonly dispatcher: Dispatcher
  readonly availableWidth: number
  readonly isCommitting: boolean

  /**
   * Click event handler passed directly to the onRowClick prop of List, see
   * List Props for documentation.
   */
  readonly onRowClick?: (row: number, source: ClickSource) => void

  readonly commitMessage: ICommitMessage | null
  readonly contextualCommitMessage: ICommitMessage | null

  /** The autocompletion providers available to the repository. */
  readonly autocompletionProviders: ReadonlyArray<IAutocompletionProvider<any>>

  /** Called when the given pattern should be ignored. */
  readonly onIgnore: (pattern: string) => void
}

export class ChangesList extends React.Component<IChangesListProps, void> {
  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = (row: number): JSX.Element => {
    const file = this.props.workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll = selection === DiffSelectionType.All
      ? true
      : (selection === DiffSelectionType.None ? false : null)

    return (
      <ChangedFile
        path={file.path}
        status={file.status}
        oldPath={file.oldPath}
        include={includeAll}
        key={file.id}
        onIncludeChanged={this.props.onIncludeChanged}
        onDiscardChanges={this.onDiscardChanges}
        onDiscardAllChanges={this.onDiscardAllChanges}
        availableWidth={this.props.availableWidth}
        onIgnore={this.props.onIgnore}
      />
    )
  }

  private get includeAllValue(): CheckboxValue {
    const includeAll = this.props.workingDirectory.includeAll
    if (includeAll === true) {
      return CheckboxValue.On
    } else if (includeAll === false) {
      return CheckboxValue.Off
    } else {
      return CheckboxValue.Mixed
    }
  }

  private onDiscardAllChanges = () => {
    this.props.onDiscardAllChanges(this.props.workingDirectory.files)
  }

  private onDiscardChanges = (path: string) => {
    const workingDirectory = this.props.workingDirectory
    const file = workingDirectory.files.find(f => f.path === path)
    if (!file) { return }

    this.props.onDiscardChanges(file)
  }

  public render() {
    const fileList = this.props.workingDirectory.files
    const selectedRow = fileList.findIndex(file => file.id === this.props.selectedFileID)
    const fileCount = fileList.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const anyFilesSelected = fileCount > 0 && this.includeAllValue !== CheckboxValue.Off

    return (
      <div className='changes-list-container file-list'>
        <div id='select-all' className='header'>
          <Checkbox value={this.includeAllValue} onChange={this.onIncludeAllChanged}/>

          <label className='changed-files-count'>
            {filesDescription}
          </label>
        </div>

        <List id='changes-list'
              rowCount={this.props.workingDirectory.files.length}
              rowHeight={RowHeight}
              rowRenderer={this.renderRow}
              selectedRow={selectedRow}
              onSelectionChanged={this.props.onFileSelectionChanged}
              invalidationProps={this.props.workingDirectory}
              onRowClick={this.props.onRowClick}/>

        <CommitMessage
          onCreateCommit={this.props.onCreateCommit}
          branch={this.props.branch}
          gitHubUser={this.props.gitHubUser}
          commitAuthor={this.props.commitAuthor}
          anyFilesSelected={anyFilesSelected}
          repository={this.props.repository}
          dispatcher={this.props.dispatcher}
          commitMessage={this.props.commitMessage}
          contextualCommitMessage={this.props.contextualCommitMessage}
          autocompletionProviders={this.props.autocompletionProviders}
          isCommitting={this.props.isCommitting}/>
      </div>
    )
  }
}
