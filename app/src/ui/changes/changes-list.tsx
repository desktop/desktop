import * as React from 'react'
import { CommitMessage } from './commit-message'
import { ChangedFile } from './changed-file'
import { ClickSource, SelectionSource } from '../list'
import { FilterList, IFilterListGroup, IFilterListItem } from '../lib/filter-list'

import { WorkingDirectoryStatus, WorkingDirectoryFileChange } from '../../models/status'
import { DiffSelectionType } from '../../models/diff'
import { CommitIdentity } from '../../models/commit-identity'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { ICommitMessage } from '../../lib/app-state'
import { IGitHubUser } from '../../lib/dispatcher'
import { IAutocompletionProvider } from '../autocompletion'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { showContextualMenu, IMenuItem } from '../main-process-proxy'

const RowHeight = 29

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const ChangesFilterList: new() => FilterList<IFileListItem> = FilterList as any


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

  /**
   * Called to reveal a file in the native file manager.
   * @param path The path of the file relative to the root of the repository
   */
  readonly onRevealInFileManager: (path: string) => void

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
}

interface IFileListItem extends IFilterListItem {
  readonly text: string
  readonly id: string
  readonly file: WorkingDirectoryFileChange
}

export class ChangesList extends React.Component<IChangesListProps, void> {
  private onItemClick: (item: IFileListItem, source: ClickSource) => void
  private onSelectionChanged: (selectedItem: IFileListItem | null, source: SelectionSource) => void

  public constructor (props: IChangesListProps) {
    super(props)
    this.onItemClick = this.listEventHandler('onRowClick')
    this.onSelectionChanged = this.listEventHandler('onFileSelectionChanged')
  }

  private onIncludeAllChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const include = event.currentTarget.checked
    this.props.onSelectAll(include)
  }

  private renderRow = ({ file }: IFileListItem): JSX.Element => {
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
        onRevealInFileManager={this.props.onRevealInFileManager}
        onOpenItem={this.props.onOpenItem}
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

  private listEventHandler = (key: 'onRowClick' | 'onFileSelectionChanged') => (item: IFileListItem, arg?: any): void => {
    const handler = this.props[key] as (item: number, source: any) => void
    if (handler) {
      handler(this.listGroups[0].items.findIndex(file => file.file === item.file), arg)
    }
  }

  private get listGroups(): ReadonlyArray<IFilterListGroup<IFileListItem>> {
    return [
      {
        identifier: 'files',
        hasHeader: false,
        items: this.props.workingDirectory.files.map(file => ({
          id: file.id,
          text: [ file.oldPath, file.path ].filter(x => x).join(' '),
          file,
        })),
      },
    ]
  }

  public render() {
    const fileList = this.props.workingDirectory.files
    const selectedItem = this.listGroups[0].items.find(item => item.file.id === this.props.selectedFileID) || null
    const fileCount = fileList.length
    const filesPlural = fileCount === 1 ? 'file' : 'files'
    const filesDescription = `${fileCount} changed ${filesPlural}`
    const anyFilesSelected = fileCount > 0 && this.includeAllValue !== CheckboxValue.Off

    return (
      <div className='changes-list-container file-list'>
        <div className='header' onContextMenu={this.onContextMenu}>
          <Checkbox
            label={filesDescription}
            value={this.includeAllValue}
            onChange={this.onIncludeAllChanged}
            disabled={fileCount === 0}
          />
        </div>

        <ChangesFilterList
          autoFocus={false}
          groups={this.listGroups}
          rowHeight={RowHeight}
          className='changes-list'
          selectedItem={selectedItem}
          renderItem={this.renderRow}
          onSelectionChanged={this.onSelectionChanged}
          invalidationProps={this.props.workingDirectory}
          onItemClick={this.onItemClick}
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
          isCommitting={this.props.isCommitting}/>
      </div>
    )
  }
}
