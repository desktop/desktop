import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { List } from '../list'

import { Repository } from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { Checkbox, CheckboxValue } from './checkbox'

const RowHeight = 30

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedPath: string | null
  readonly onFileSelectionChanged: (row: number) => void
  readonly onIncludeChanged: (row: number, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly onDiscardChanges: (row: number) => void
  readonly branch: string | null
  readonly avatarURL: string
  readonly emoji: Map<string, string>

  /**
   * Keyboard handler passed directly to the onRowKeyDown prop of List, see
   * List Props for documentation.
   */
  readonly onRowKeyDown?: (row: number, event: React.KeyboardEvent<any>) => void
}

export class ChangesList extends React.Component<IChangesListProps, void> {
  private onIncludeAllChange(event: React.FormEvent<HTMLInputElement>) {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow(row: number): JSX.Element {
    const file = this.props.workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll = selection === DiffSelectionType.All
      ? true
      : (selection === DiffSelectionType.None ? false : null)

    return (
      <ChangedFile path={file.path}
                   status={file.status}
                   include={includeAll}
                   key={file.id}
                   onIncludeChanged={include => this.props.onIncludeChanged(row, include)}
                   onDiscardChanges={() => this.props.onDiscardChanges(row)}/>
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

  public render() {
    const selectedRow = this.props.workingDirectory.files.findIndex(file => file.path === this.props.selectedPath)

    const fileCount = this.props.workingDirectory.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`

    return (
      <div className='panel changes-panel' id='changes-list'>
        <div id='select-all' className='changes-panel-header'>
          <Checkbox value={this.includeAllValue} onChange={event => this.onIncludeAllChange(event)}/>

          <label className='changes-panel-header-label'>
            {filesDescription}
          </label>
        </div>

        <List id='changes-list-list'
              rowCount={this.props.workingDirectory.files.length}
              rowHeight={RowHeight}
              rowRenderer={row => this.renderRow(row)}
              selectedRow={selectedRow}
              onSelectionChanged={row => this.props.onFileSelectionChanged(row)}
              invalidationProps={this.props.workingDirectory}
              onRowKeyDown={this.props.onRowKeyDown} />

        <CommitMessage onCreateCommit={(summary, description) => this.props.onCreateCommit(summary, description)}
                       branch={this.props.branch}
                       avatarURL={this.props.avatarURL}
                       emoji={this.props.emoji}/>
      </div>
    )
  }
}
