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
  readonly onCreateCommit: (summary: string, description: string) => void
  readonly branch: string | null
  readonly avatarURL: string
}

export class ChangesList extends React.Component<IChangesListProps, void> {
  private handleOnChangeEvent(event: React.FormEvent<any>) {
    const include = (event.target as any).checked
    this.props.onSelectAll(include)
  }

  private renderRow(row: number): JSX.Element {
    const file = this.props.workingDirectory.files[row]

    let includeAll: boolean | null = file.diffSelection.includeAll

    if (file.diffSelection.selectedLines.size > 0) {

      const toArray = Array.from(file.diffSelection.selectedLines.values())
      const allSelected = toArray.every(k => k === true)
      const noneSelected = toArray.every(k => k === false)

      if (allSelected) {
        includeAll = true
      } else if (noneSelected) {
        includeAll = false
      }
    }

    return (
      <ChangedFile path={file.path}
                   status={file.status}
                   include={includeAll}
                   key={file.id}
                   onIncludeChanged={include => this.props.onIncludeChanged(row, include)}/>
    )
  }

  public render() {
    const includeAll = this.props.workingDirectory.includeAll
    const selectedRow = findIndex(this.props.workingDirectory.files, file => file.path === this.props.selectedPath)

    const fileCount = this.props.workingDirectory.files.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`

    return (
      <div className='panel changes-panel' id='changes-list'>
        <div id='select-all' className='changes-panel-header'>
          <input
            type='checkbox'
            checked={includeAll == null ? undefined : includeAll}
            onChange={event => this.handleOnChangeEvent(event) }
            ref={function(input) {
              if (input != null) {
                input.indeterminate = (includeAll === null)
              }
            }} />

          <label className='changes-panel-header-label'>
            {filesDescription}
          </label>
        </div>

        <List id='changes-list-list'
              rowCount={this.props.workingDirectory.files.length}
              rowHeight={RowHeight}
              rowRenderer={row => this.renderRow(row)}
              selectedRow={selectedRow}
              onSelectionChanged={row => this.props.onSelectionChanged(row)}
              invalidationProps={this.props.workingDirectory}/>

        <CommitMessage onCreateCommit={(summary, description) => this.props.onCreateCommit(summary, description)}
                       branch={this.props.branch}
                       avatarURL={this.props.avatarURL}/>
      </div>
    )
  }
}
