import * as React from 'react'

import IRepository from '../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../models/status'

import { LocalGitOperations, Diff, Commit, DiffLine, DiffLineType } from '../lib/local-git-operations'

const { Grid, AutoSizer } = require('react-virtualized')

const RowHeight = 22

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
  readonly onIncludeChanged: ((diffSelection: Map<number, boolean>) => void) | null
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  private grid: React.Component<any, any> | null

  public constructor(props: IFileDiffProps) {
    super(props)

    this.state = { diff: new Diff([]) }
  }

  public componentWillReceiveProps(nextProps: IFileDiffProps) {
    this.renderDiff(nextProps.repository, nextProps.file, nextProps.readOnly)
  }

  private handleResize() {
    const grid: any = this.grid
    if (grid) {
      grid.recomputeGridSize({ columnIndex: 0, rowIndex: 0 })
    }
  }

  private async renderDiff(repository: IRepository, file: FileChange | null, readOnly: boolean) {
    if (!file) {
      // clear whatever existing state
      this.setState(Object.assign({}, this.state, { diff: new Diff([]) }))
      return
    }

    const diff = await LocalGitOperations.getDiff(repository, file, this.props.commit)

    const change = file as WorkingDirectoryFileChange

    if (change) {
      const diffSelection = change.diffSelection
      const includeAll = diffSelection.isIncludeAll()
      if (includeAll === null) {
        diffSelection.selectedLines.forEach((value, index) => {
          if (value) {
            diff.lines[index].selected = value!
          }
        })
      } else {
        diff.setAllLines(includeAll)
      }
    }

    this.setState(Object.assign({}, this.state, { diff }))
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
        // TODO: how is this going to work with wrapping again?
        return (availableWidth - 100)
      default:
        // TODO: we know the number of lines in the diff, we should adjust this
        //       value so that > 3 character line counts are visible
        return 100
    }
  }

  private getDiffLineFromSection(index: number): DiffLine | null {

    let pointer: number = 0
    let found: DiffLine | null = null

    this.state.diff.sections.forEach(s => {
      const length = s.lines.length
      if (found) {
        return
      }

      const end = pointer + length
      if (index <= end) {
        const relativeIndex = index - pointer // ????
        found = s.lines[relativeIndex]
      } else {
        pointer += length
      }
    })

    return found
  }

  private formatIfNotSet(value: number | null): string {
    // JSX will encode markup as part of rendering, so this
    // value for &nbsp; needs to be done as it's unicode number
    // citation: https://facebook.github.io/react/docs/jsx-gotchas.html#html-entities
    if (value === null) {
      return '\u00A0'
    } else {
      return value.toString()
    }
  }

  private onMouseEnterHandler(target: any, className: string) {
    const hoverClassName = className + '-hover'
    target.classList.add(hoverClassName)
  }

  private onMouseLeaveHandler(target: any, className: string) {
    const hoverClassName = className + '-hover'
    target.classList.remove(hoverClassName)
  }

  private onMouseDownHandler(diff: DiffLine, rowIndex: number) {
    if (this.props.onIncludeChanged) {
      const startLine = rowIndex
      const endLine = startLine

      const f = this.props.file as WorkingDirectoryFileChange

      if (!f) {
        console.error('cannot change selected lines when selection is not a working directory change')
        return
      }

      const newDiff: Map<number, boolean> = new Map<number, boolean>()

      // populate the current state of the diff
      this.state.diff.lines
        .forEach((line, index) => {
          if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
            console.debug(`line [${index}] is type ${line.type} and is selected: ${line.selected}`)
            newDiff.set(index, line.selected)
          }
        })

      const include = !diff.selected
      console.debug(`lines [${startLine},${endLine}] should be set to ${include}`)

      // apply the requested change
      for (let i = startLine; i <= endLine; i++) {
        newDiff.set(i, include)
      }

      this.props.onIncludeChanged!(newDiff)
    }
  }

  private editableSidebar(diff: DiffLine, rowIndex: number) {
    const baseClassName = this.map(diff.type)
    const className = diff.selected ? baseClassName + '-selected' : baseClassName

    // TODO: depending on cursor position, highlight hunk rather than line

    return (
      <div className={className}
           onMouseEnter={event => this.onMouseEnterHandler(event.currentTarget, baseClassName)}
           onMouseLeave={event => this.onMouseLeaveHandler(event.currentTarget, baseClassName)}
           onMouseDown={event => this.onMouseDownHandler(diff, rowIndex)}>
        <div className='before'>{this.formatIfNotSet(diff.oldLineNumber)}</div>
        <div className='after'>{this.formatIfNotSet(diff.newLineNumber)}</div>
      </div>
    )
  }

  private readOnlySidebar(diff: DiffLine) {
    const baseClassName = this.map(diff.type)

    return (
      <div className={baseClassName}>
        <span className='before'>{this.formatIfNotSet(diff.oldLineNumber)}</span>
        <span className='after'>{this.formatIfNotSet(diff.newLineNumber)}</span>
      </div>
    )
  }

  private renderSidebar = (rowIndex: number) => {
    const datum = this.getDiffLineFromSection(rowIndex)!

    if (this.props.readOnly) {
      return this.readOnlySidebar(datum)
    } else {
      return this.editableSidebar(datum, rowIndex)
    }
  }

  private renderBodyCell = (rowIndex: number) => {
    const diff = this.getDiffLineFromSection(rowIndex)!

    const baseClassName = this.map(diff.type)
    const className = diff.selected ? baseClassName + '-selected' : baseClassName

    return (
      <div className={className}>
        <span className='text'>{diff.text}</span>
      </div>
    )
  }

  private cellRenderer = ({ columnIndex, rowIndex }: { columnIndex: number, rowIndex: number }) => {
    if (columnIndex === 0) {
      return this.renderSidebar(rowIndex)
    } else {
      return this.renderBodyCell(rowIndex)
    }
  }

  public render() {

    if (this.props.file) {

      let invalidationProps: { path: string, include: boolean | null } = { path: this.props.file!.path, include: false }

      const workingDirectoryChange = this.props.file as WorkingDirectoryFileChange

      if (workingDirectoryChange) {
        const includeAll = workingDirectoryChange.diffSelection.isIncludeAll()
        invalidationProps = { path: this.props.file!.path, include: includeAll }
      }

      let diffLineCount: number = 0

      this.state.diff.sections
        .map(s => s.lines.length)
        .forEach(c => diffLineCount += c)

      return (
        <div className='panel' id='file-diff'>
          <AutoSizer onResize={ () => this.handleResize() }>
          {({ width, height }: { width: number, height: number }) => (
            <Grid
              autoContainerWidth
              ref={(ref: React.Component<any, any>) => this.grid = ref}
              cellRenderer={ ({ columnIndex, rowIndex }: { columnIndex: number, rowIndex: number }) => this.cellRenderer({ columnIndex, rowIndex }) }
              className='diff-text'
              columnCount={2}
              columnWidth={ ({ index }: { index: number }) => this.getColumnWidth( { index, availableWidth: width }) }
              width={width}
              height={height}
              rowHeight={RowHeight}
              rowCount={diffLineCount}
              invalidationProps={invalidationProps}
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
