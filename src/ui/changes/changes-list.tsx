import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import List from '../list'

import Repository from '../../models/repository'
import { WorkingDirectoryStatus } from '../../models/status'

const RowHeight = 20

interface ChangesListProps {
  repository: Repository
  workingDirectory: WorkingDirectoryStatus
  readonly selectedRow: number
  readonly onSelectionChanged: (row: number) => void
  readonly onIncludeChanged: (row: number, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (title: string) => void
}

export class ChangesList extends React.Component<ChangesListProps, void> {

  public constructor(props: ChangesListProps) {
    super(props)
  }

  private handleOnChangeEvent(event: React.FormEvent) {
    const include = (event.target as any).checked
    this.props.onSelectAll(include)
  }

  private renderRow(row: number): JSX.Element {
    const file = this.props.workingDirectory.files[row]
    const path = file.path

    return (
      <ChangedFile path={path}
                   status={file.status}
                   include={file.include}
                   key={path}
                   onIncludeChanged={include => this.props.onIncludeChanged(row, include)}/>
    )
  }

  public render() {

    const includeAll = this.props.workingDirectory.includeAll

    return (
      <div id='changes-list'>
        <div id='select-all'>
          <input
            type='checkbox'
            checked={includeAll}
            onChange={event => this.handleOnChangeEvent(event) }
            ref={function(input) {
              if (input != null) {
                input.indeterminate = (includeAll === null)
              }
            }} />
        </div>

        <List id='changes-list-list'
              itemCount={this.props.workingDirectory.files.length}
              itemHeight={RowHeight}
              renderItem={row => this.renderRow(row)}
              selectedRow={this.props.selectedRow}
              onSelectionChanged={row => this.props.onSelectionChanged(row)} />

        <CommitMessage onCreateCommit={title => this.props.onCreateCommit(title)}/>
      </div>
    )
  }
}
