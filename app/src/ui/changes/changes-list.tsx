import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import List from '../list'
import { findIndex } from '../../lib/find'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'

const RowHeight = 30

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedPath: string | null
  readonly onSelectionChanged: (row: number) => void
  readonly onIncludeChanged: (row: number, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (title: string) => void
  readonly branch: string | null
}

export class ChangesList extends React.Component<IChangesListProps, void> {
  private handleOnChangeEvent(event: React.FormEvent) {
    const include = (event.target as any).checked
    this.props.onSelectAll(include)
  }

  private renderRow(row: number): JSX.Element {
    const file = this.props.workingDirectory.files[row]
    return (
      <ChangedFile path={file.path}
                   status={file.status}
                   include={file.include}
                   key={file.id}
                   onIncludeChanged={include => this.props.onIncludeChanged(row, include)}/>
    )
  }

  public render() {

    const includeAll = this.props.workingDirectory.includeAll
    const selectedRow = findIndex(this.props.workingDirectory.files, file => file.path === this.props.selectedPath)
    return (
      <div className='panel changes-panel' id='changes-list'>
        <div id='select-all' className='changes-panel-header'>
          <label>
            <input
              type='checkbox'
              checked={includeAll}
              onChange={event => this.handleOnChangeEvent(event) }
              ref={function(input) {
                if (input != null) {
                  input.indeterminate = (includeAll === null)
                }
              }} />

              Select all changes
          </label>
        </div>

        <List id='changes-list-list'
              rowCount={this.props.workingDirectory.files.length}
              rowHeight={RowHeight}
              rowRenderer={row => this.renderRow(row)}
              selectedRow={selectedRow}
              onSelectionChanged={row => this.props.onSelectionChanged(row)} />

        <CommitMessage onCreateCommit={title => this.props.onCreateCommit(title)} branch={this.props.branch}/>
      </div>
    )
  }
}
