import * as React from 'react'

import IRepository from '../models/repository'
import { FileChange } from '../models/status'

import { LocalGitOperations, Diff, Commit, DiffLine, DiffLineType } from '../lib/local-git-operations'

const { Grid, AutoSizer } = require('react-virtualized')

const RowHeight = 20

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.file, nextProps.readOnly)
  }

  private async renderDiff(repository: IRepository, file: FileChange | null, readOnly: boolean) {
    if (!file) {
      // TOOD: don't render anything
    } else {

      const diff = await LocalGitOperations.getDiff(repository, file, this.props.commit)

      this.setState(Object.assign({}, this.state, { diff }))
    }
  }

  private map(type: DiffLineType): string {
    if (type === DiffLineType.Add) {
      return 'diff-add'
    } else if (type === DiffLineType.Delete) {
      return 'diff-delete'
    } else if (type === DiffLineType.Hunk) {
      return 'diff-hunk'
    }
    return 'diff-context'
  }

  private getColumnWidth ({ index, availableWidth }: { index: number, availableWidth: number }) {
    switch (index) {
      case 1:
        return 300
      default:
        return 50
    }
  }

  private getDatum(index: number): DiffLine {
      return this.state.diff.lines[index]
    }

  private renderLeftSideCell = ({ rowIndex }: { rowIndex: number }) => {
    const datum = this.getDatum(rowIndex)

    const classNames = this.map(datum.type)

    return (
      <div className={classNames}>
        <span className='before'>{datum.oldLineNumber}</span>
        <span className='after'>{datum.newLineNumber}</span>
      </div>
    )
  }

  private renderBodyCell = ({ rowIndex }: { rowIndex: number }) => {
    const datum = this.getDatum(rowIndex)

    const classNames = this.map(datum.type)

    return (
      <div className={classNames}>
        <span className='text'>{datum.text}</span>
      </div>
    )
  }


  private cellRenderer = ({ columnIndex, rowIndex }: { columnIndex: number, rowIndex: number }) => {
    if (columnIndex === 0) {
      return this.renderLeftSideCell({ rowIndex })
    } else {
      return this.renderBodyCell({ rowIndex })
    }
  }

  public render() {

    if (this.props.file) {
      return (
        <div className='panel' id='file-diff'>
        <AutoSizer>
          {({ width, height }: { width: number, height: number }) => (
            <Grid
              autoContainerWidth
              cellRenderer={this.cellRenderer}
              className='diff-text'
              columnCount={2}
              columnWidth={ (index: number) => this.getColumnWidth( { index, availableWidth: width }) }
              height={height}
              rowHeight={RowHeight}
              rowCount={this.state.diff.lines.length}
              width={width}
            />
          )}
        </AutoSizer>

        </div>
      )
    } else {
      return (
        <div className='panel blankslate' id='file-diff'>
          No file selected
        </div>
      )
    }
  }
}
