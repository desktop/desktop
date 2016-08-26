import * as React from 'react'

import IRepository from '../models/repository'
import { FileChange, WorkingDirectoryFileChange } from '../models/status'
import { DiffSelectionType, DiffLine, DiffLineType, Diff } from '../models/diff'

import { LocalGitOperations, Commit } from '../lib/local-git-operations'

import { find } from '../lib/find'

const { Grid, AutoSizer } = require('react-virtualized')

const RowHeight = 22

interface IFileDiffProps {
  readonly repository: IRepository
  readonly readOnly: boolean
  readonly file: FileChange | null
  readonly commit: Commit | null
  readonly onIncludeChanged?: (diffSelection: Map<number, boolean>) => void
}

interface IFileDiffState {
  readonly diff: Diff
}

export default class FileDiff extends React.Component<IFileDiffProps, IFileDiffState> {

  private defaultSidebarWidth = 100

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
      this.setState({ diff: new Diff([]) })
      return
    }

    const diff = await LocalGitOperations.getDiff(repository, file, this.props.commit)

    const change = file as WorkingDirectoryFileChange

    if (change) {
      const diffSelection = change.selection
      const selectionType = diffSelection.getSelectionType()

      if (selectionType === DiffSelectionType.Partial) {
        diffSelection.selectedLines.forEach((value, index) => {
          const section = find(diff.sections, s => {
            return index >= s.unifiedDiffStart && index < s.unifiedDiffEnd
          })

          if (section) {
            const relativeIndex = index - section.unifiedDiffStart
            const diffLine = section.lines[relativeIndex]
            if (diffLine) {
              diffLine.selected = value
            }
          }
        })
      } else {
        const includeAll = selectionType === DiffSelectionType.All ? true : false
        diff.setAllLines(includeAll)
      }
    }

    this.setState(Object.assign({}, this.state, { diff }))
  }

  private getClassName(type: DiffLineType): string {
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
        // TODO: how is this going to work with wrapping?
        //       or a variable-width sidebar ala #306
        return (availableWidth - this.defaultSidebarWidth)
      default:
        return this.defaultSidebarWidth
    }
  }

  private getDiffLineFromSection(index: number): DiffLine | null {
    const diff = find(this.state.diff.sections, s => index >= s.unifiedDiffStart && index < s.unifiedDiffEnd)

    if (diff) {
      const relativeIndex = index - diff.unifiedDiffStart
      return diff.lines[relativeIndex]
    }

    return null
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
    if (!this.props.onIncludeChanged) {
      return
    }

    const startLine = rowIndex
    const endLine = startLine

    const f = this.props.file as WorkingDirectoryFileChange

    if (!f) {
      console.error('cannot change selected lines when selected file is not a WorkingDirectoryFileChange')
      return
    }

    const newDiffSelection: Map<number, boolean> = new Map<number, boolean>()

    // populate the current state of the diff
    this.state.diff.sections.forEach(s => {
      s.lines.forEach((line, index) => {
        if (line.type === DiffLineType.Add || line.type === DiffLineType.Delete) {
          const absoluteIndex = s.unifiedDiffStart + index
          newDiffSelection.set(absoluteIndex, line.selected)
        }
      })
    })

    const include = !diff.selected

    // apply the requested change
    for (let i = startLine; i <= endLine; i++) {
      newDiffSelection.set(i, include)
    }

    this.props.onIncludeChanged(newDiffSelection)
  }

  private editableSidebar(diff: DiffLine, rowIndex: number) {
    const baseClassName = 'diff-line-column'
    const typeClassName = this.getClassName(diff.type)
    const unselectedClassName = `${baseClassName} ${typeClassName}`
    const selectedClassName = `${unselectedClassName} ${typeClassName}-selected`

    const className = diff.selected ? selectedClassName : unselectedClassName

    // TODO: depending on cursor position, highlight hunk rather than line

    return (
      <div className={className}
           onMouseEnter={event => this.onMouseEnterHandler(event.currentTarget, typeClassName)}
           onMouseLeave={event => this.onMouseLeaveHandler(event.currentTarget, typeClassName)}
           onMouseDown={event => this.onMouseDownHandler(diff, rowIndex)}>
        <div className='diff-line-number before'>{this.formatIfNotSet(diff.oldLineNumber)}</div>
        <div className='diff-line-number after'>{this.formatIfNotSet(diff.newLineNumber)}</div>
      </div>
    )
  }

  private readOnlySidebar(diff: DiffLine) {
    return (
      <div className={this.getClassName(diff.type)}>
        <span className='before'>{this.formatIfNotSet(diff.oldLineNumber)}</span>
        <span className='after'>{this.formatIfNotSet(diff.newLineNumber)}</span>
      </div>
    )
  }

  private renderSidebar = (rowIndex: number) => {
    const diffLine = this.getDiffLineFromSection(rowIndex)

    if (!diffLine) {
      return null
    }

    if (this.props.readOnly) {
      return this.readOnlySidebar(diffLine)
    } else {
      return this.editableSidebar(diffLine, rowIndex)
    }
  }

  private renderBodyCell = (rowIndex: number) => {
    const diffLine = this.getDiffLineFromSection(rowIndex)

    if (!diffLine) {
      return null
    }

    return (
      <div className={this.getClassName(diffLine.type)}>
        <span className='text'>{diffLine.text}</span>
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

      let invalidationProps = { path: this.props.file!.path, selection: DiffSelectionType.None }

      const change = this.props.file as WorkingDirectoryFileChange

      if (change) {
        const selectionType = change.selection.getSelectionType()
        invalidationProps = { path: this.props.file!.path, selection: selectionType }
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
