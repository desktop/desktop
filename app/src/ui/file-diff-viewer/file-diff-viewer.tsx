/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import * as React from 'react'
import { IConstrainedValue, RepositorySectionTab } from '../../lib/app-state'
import { Resizable } from '../resizable'
import { FileList } from '../history/file-list'
import { CommittedFileChange } from '../../models/status'
import { clamp } from '../../lib/clamp'
import { IMenuItem, showContextualMenu } from '../../lib/menu-item'
import {
  CopyFilePathLabel,
  CopyRelativeFilePathLabel,
  DefaultEditorLabel,
  isSafeFileExtension,
  OpenWithDefaultProgramLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'
import * as Path from 'path'
import { pathExists } from '../lib/path-exists'
import { revealInFileManager } from '../../lib/app-shell'
import { clipboard } from 'electron'
import { IDiff, ImageDiffType } from '../../models/diff'
import { SeamlessDiffSwitcher } from '../diff/seamless-diff-switcher'
import { Repository } from '../../models/repository'
import { IChangesetData } from '../../lib/git'
import { DiffOptions } from '../diff/diff-options'
import { TooltippedContent } from '../lib/tooltipped-content'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { List } from 'react-virtualized'

interface IFileDiffViewerProps {
  // Diff Width properties
  readonly diffWidth: IConstrainedValue
  readonly onDiffResize: (width: number) => void
  readonly onDiffSizeReset: () => void

  // File list props
  readonly changesetData: IChangesetData
  readonly selectedFile: CommittedFileChange | null
  readonly repository: Repository
  readonly externalEditorLabel?: string
  readonly onFileSelected: (file: CommittedFileChange) => void
  readonly onOpenInExternalEditor: (fullPath: string) => void
  readonly onOpenWithDefaultProgram: (fullPath: string) => void

  // Diff props
  readonly diff: IDiff | null
  readonly selectedDiffType: ImageDiffType
  readonly showSideBySideDiff: boolean
  readonly hideWhitespaceInDiff: boolean
  readonly onHideWhitespaceInDiffChanged: (
    hideWhitespaceInDiff: boolean
  ) => Promise<void>
  readonly byFile?: boolean

  // Callbacks
  readonly onShowSideBySideDiffChanged: (checked: boolean) => void
  readonly onDiffOptionsOpened: () => void
  readonly onOpenBinaryFile: (fullPath: string) => void
  readonly onChangeImageDiffType: (type: ImageDiffType) => void
}

interface IFileDiffViewerState {
  readonly filesClosed: Map<string, boolean>
}

/**
 * Display a list of changed files as part of a commit or stash
 */
export class FileDiffViewer extends React.Component<
  IFileDiffViewerProps,
  IFileDiffViewerState
> {
  public constructor(props: IFileDiffViewerProps) {
    super(props)

    this.state = {
      filesClosed: new Map(),
    }
  }

  private onContextMenu = async (
    file: CommittedFileChange,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    const { repository } = this.props

    const fullPath = Path.join(repository.path, file.path)
    const fileExistsOnDisk = await pathExists(fullPath)
    if (!fileExistsOnDisk) {
      showContextualMenu([
        {
          label: __DARWIN__
            ? 'File Does Not Exist on Disk'
            : 'File does not exist on disk',
          enabled: false,
        },
      ])
      return
    }

    const { externalEditorLabel } = this.props

    const extension = Path.extname(file.path)
    const isSafeExtension = isSafeFileExtension(extension)
    const openInExternalEditor = externalEditorLabel
      ? `Open in ${externalEditorLabel}`
      : DefaultEditorLabel

    const items: IMenuItem[] = [
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(repository, file.path),
        enabled: fileExistsOnDisk,
      },
      {
        label: openInExternalEditor,
        action: () => this.props.onOpenInExternalEditor(fullPath),
        enabled: fileExistsOnDisk,
      },
      {
        label: OpenWithDefaultProgramLabel,
        action: () => this.props.onOpenWithDefaultProgram(file.path),
        enabled: isSafeExtension && fileExistsOnDisk,
      },
      { type: 'separator' },
      {
        label: CopyFilePathLabel,
        action: () => clipboard.writeText(fullPath),
      },
      {
        label: CopyRelativeFilePathLabel,
        action: () => clipboard.writeText(Path.normalize(file.path)),
      },
      { type: 'separator' },
    ]

    showContextualMenu(items)
  }

  private renderFileList() {
    const {
      changesetData: { files },
      selectedFile,
      diffWidth,
      onFileSelected,
    } = this.props
    if (files.length === 0) {
      return <div className="fill-window">No files</div>
    }
    // -1 for right hand side border
    const availableWidth = clamp(diffWidth) - 1

    return (
      <FileList
        files={files}
        onSelectedFileChanged={onFileSelected}
        selectedFile={selectedFile}
        availableWidth={availableWidth}
        onContextMenu={this.onContextMenu}
      />
    )
  }

  private renderDiff() {
    const {
      selectedFile,
      diff,
      changesetData: { files },
    } = this.props

    if (selectedFile == null) {
      // don't show both 'empty' messages
      const message = files.length === 0 ? '' : 'No file selected'

      return (
        <div className="panel blankslate" id="diff">
          {message}
        </div>
      )
    }

    const {
      repository,
      selectedDiffType,
      hideWhitespaceInDiff,
      showSideBySideDiff,
      onOpenBinaryFile,
      onChangeImageDiffType,
      onHideWhitespaceInDiffChanged,
    } = this.props

    return (
      <SeamlessDiffSwitcher
        repository={repository}
        imageDiffType={selectedDiffType}
        file={selectedFile}
        diff={diff}
        readOnly={true}
        hideWhitespaceInDiff={hideWhitespaceInDiff}
        showSideBySideDiff={showSideBySideDiff}
        onOpenBinaryFile={onOpenBinaryFile}
        onChangeImageDiffType={onChangeImageDiffType}
        onHideWhitespaceInDiffChanged={onHideWhitespaceInDiffChanged}
      />
    )
  }

  private renderLinesChanged() {
    const { linesAdded, linesDeleted } = this.props.changesetData
    if (linesAdded + linesDeleted === 0) {
      return null
    }

    const linesAddedPlural = linesAdded === 1 ? 'line' : 'lines'
    const linesDeletedPlural = linesDeleted === 1 ? 'line' : 'lines'
    const linesAddedTitle = `${linesAdded} ${linesAddedPlural} added`
    const linesDeletedTitle = `${linesDeleted} ${linesDeletedPlural} deleted`

    return (
      <>
        <TooltippedContent
          tagName="span"
          className="without-truncation lines-added"
          tooltip={linesAddedTitle}
        >
          +{linesAdded}
        </TooltippedContent>
        <TooltippedContent
          tagName="span"
          className="without-truncation lines-deleted"
          tooltip={linesDeletedTitle}
        >
          -{linesDeleted}
        </TooltippedContent>
      </>
    )
  }

  public renderHeader() {
    if (1 === 1) {
      return null
    }

    return (
      <div className="file-diff-header">
        <span> Changes from all commits</span>
        <span className="middle"></span>
        {this.renderLinesChanged()}
        <span>
          <DiffOptions
            sourceTab={RepositorySectionTab.History}
            hideWhitespaceChanges={this.props.hideWhitespaceInDiff}
            onHideWhitespaceChangesChanged={
              this.props.onHideWhitespaceInDiffChanged
            }
            showSideBySideDiff={this.props.showSideBySideDiff}
            onShowSideBySideDiffChanged={this.props.onShowSideBySideDiffChanged}
            onDiffOptionsOpened={this.props.onDiffOptionsOpened}
          />
        </span>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  toggleFileState(fileId: string) {
    const filesClosed = this.state.filesClosed
    return () => {
      filesClosed.set(fileId, !filesClosed.get(fileId))
      this.setState({ filesClosed })
    }
  }

  public renderFileRow = ({ index }: { index: number }) => {
    const {
      changesetData: { files },
    } = this.props

    const f = files[index]

    const isClosed = !!this.state.filesClosed.get(f.id)
    const classes = classNames('file-container', { closed: isClosed })
    return (
      <div className={classes} key={f.id}>
        <div className="file-header">
          <span className="file-toggle" onClick={this.toggleFileState(f.id)}>
            <Octicon
              symbol={
                isClosed
                  ? OcticonSymbol.chevronRight
                  : OcticonSymbol.chevronDown
              }
            />
          </span>
          <span>{f.path}</span>
        </div>
        <div className="file-diff">{this.renderDiff()}</div>
      </div>
    )
  }

  public renderByFile() {
    const {
      changesetData: { files },
    } = this.props

    if (1 === 1) {
      const filesOutput = files.map((f, index) => this.renderFileRow({ index }))
      return <div className="diff-details-by-file">{filesOutput}</div>
    }

    return (
      <div className="diff-details-by-file">
        <List
          width={870}
          height={400}
          rowHeight={200}
          rowRenderer={this.renderFileRow}
          rowCount={files.length}
        ></List>
      </div>
    )
  }

  public renderWithFileList() {
    const { diffWidth } = this.props
    return (
      <div className="diff-details">
        <Resizable
          width={diffWidth.value}
          minimumWidth={diffWidth.min}
          maximumWidth={diffWidth.max}
          onResize={this.props.onDiffResize}
          onReset={this.props.onDiffSizeReset}
        >
          {this.renderFileList()}
        </Resizable>
        {this.renderDiff()}
      </div>
    )
  }

  public render() {
    const { byFile } = this.props

    return (
      <div className="file-diff-viewer">
        {this.renderHeader()}
        {byFile ? this.renderByFile() : this.renderWithFileList()}
      </div>
    )
  }
}
