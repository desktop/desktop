import * as React from 'react'
import * as Path from 'path'

import { ICommitMessage } from '../../lib/app-state'
import { IGitHubUser } from '../../lib/databases'
import { Dispatcher } from '../../lib/dispatcher'
import { ITrailer } from '../../lib/git/interpret-trailers'
import { IMenuItem } from '../../lib/menu-item'
import { revealInFileManager } from '../../lib/app-shell'

import {
  WorkingDirectoryStatus,
  WorkingDirectoryFileChange,
  AppFileStatus,
} from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { Repository } from '../../models/repository'
import { IAuthor } from '../../models/author'

import { List, ClickSource } from '../lib/list'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import {
  isSafeFileExtension,
  DefaultEditorLabel,
  RevealInFileManagerLabel,
} from '../lib/context-menu'

import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'

import { IAutocompletionProvider } from '../autocompletion'
import { showContextualMenu } from '../main-process-proxy'

const RowHeight = 29
const GitIgnoreFileName = '.gitignore'

interface IChangesListProps {
  readonly repository: Repository
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFileID: string | null
  readonly onFileSelectionChanged: (row: number) => void
  readonly onIncludeChanged: (path: string, include: boolean) => void
  readonly onSelectAll: (selectAll: boolean) => void
  readonly onCreateCommit: (
    summary: string,
    description: string | null,
    trailers?: ReadonlyArray<ITrailer>
  ) => Promise<boolean>
  readonly onDiscardChanges: (file: WorkingDirectoryFileChange) => void
  readonly onDiscardAllChanges: (
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) => void

  /**
   * Called to open a file it its default application
   * @param path The path of the file relative to the root of the repository
   */
  readonly onOpenItem: (path: string) => void
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

  /**
   * Whether or not to show a field for adding co-authors to
   * a commit (currently only supported for GH/GHE repositories)
   */
  readonly showCoAuthoredBy: boolean

  /**
   * A list of authors (name, email pairs) which have been
   * entered into the co-authors input box in the commit form
   * and which _may_ be used in the subsequent commit to add
   * Co-Authored-By commit message trailers depending on whether
   * the user has chosen to do so.
   */
  readonly coAuthors: ReadonlyArray<IAuthor>

  /** The name of the currently selected external editor */
  readonly externalEditorLabel?: string

  /**
   * Callback to open a selected file using the configured external editor
   *
   * @param fullPath The full path to the file on disk
   */
  readonly onOpenInExternalEditor: (fullPath: string) => void
}

export class ChangesList extends React.Component<IChangesListProps, {}> {
  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = (row: number): JSX.Element => {
    const file = this.props.workingDirectory.files[row]
    const selection = file.selection.getSelectionType()

    const includeAll =
      selection === DiffSelectionType.All
        ? true
        : selection === DiffSelectionType.None ? false : null

    return (
      <ChangedFile
        path={file.path}
        status={file.status}
        oldPath={file.oldPath}
        include={includeAll}
        key={file.id}
        onIncludeChanged={this.props.onIncludeChanged}
        availableWidth={this.props.availableWidth}
        onContextMenu={this.onItemContextMenu}
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
    if (!file) {
      return
    }

    this.props.onDiscardChanges(file)
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()

    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: this.onDiscardAllChanges,
        enabled: this.props.workingDirectory.files.length > 0,
      },
    ]

    showContextualMenu(items)
  }

  private onItemContextMenu = (
    path: string,
    status: AppFileStatus,
    event: React.MouseEvent<any>
  ) => {
    event.preventDefault()

    const extension = Path.extname(path)
    const fileName = Path.basename(path)
    const isSafeExtension = isSafeFileExtension(extension)
    const openInExternalEditor = this.props.externalEditorLabel
      ? `Open in ${this.props.externalEditorLabel}`
      : DefaultEditorLabel
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Discard Changes…' : 'Discard changes…',
        action: () => this.onDiscardChanges(path),
      },
      {
        label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
        action: () => this.onDiscardAllChanges(),
      },
      { type: 'separator' },
      {
        label: 'Ignore',
        action: () => this.props.onIgnore(path),
        enabled: fileName !== GitIgnoreFileName,
      },
    ]

    if (extension.length) {
      items.push({
        label: __DARWIN__
          ? `Ignore All ${extension} Files`
          : `Ignore all ${extension} files`,
        action: () => this.props.onIgnore(`*${extension}`),
        enabled: fileName !== GitIgnoreFileName,
      })
    }

    items.push(
      { type: 'separator' },
      {
        label: RevealInFileManagerLabel,
        action: () => revealInFileManager(this.props.repository, path),
        enabled: status !== AppFileStatus.Deleted,
      },
      {
        label: openInExternalEditor,
        action: () => {
          const fullPath = Path.join(this.props.repository.path, path)
          this.props.onOpenInExternalEditor(fullPath)
        },
        enabled: isSafeExtension && status !== AppFileStatus.Deleted,
      },
      {
        label: __DARWIN__
          ? 'Open with Default Program'
          : 'Open with default program',
        action: () => this.props.onOpenItem(path),
        enabled: isSafeExtension && status !== AppFileStatus.Deleted,
      }
    )

    showContextualMenu(items)
  }

  public render() {
    const fileList = this.props.workingDirectory.files
    const selectedRow = fileList.findIndex(
      file => file.id === this.props.selectedFileID
    )
    const fileCount = fileList.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const anyFilesSelected =
      fileCount > 0 && this.includeAllValue !== CheckboxValue.Off

    return (
      <div className="changes-list-container file-list">
        <div className="header" onContextMenu={this.onContextMenu}>
          <Checkbox
            label={filesDescription}
            value={this.includeAllValue}
            onChange={this.onIncludeAllChanged}
            disabled={fileCount === 0}
          />
        </div>

        <List
          id="changes-list"
          rowCount={this.props.workingDirectory.files.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow}
          selectedRow={selectedRow}
          onSelectionChanged={this.props.onFileSelectionChanged}
          invalidationProps={this.props.workingDirectory}
          onRowClick={this.props.onRowClick}
        />

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
          isCommitting={this.props.isCommitting}
          showCoAuthoredBy={this.props.showCoAuthoredBy}
          coAuthors={this.props.coAuthors}
        />
      </div>
    )
  }
}
