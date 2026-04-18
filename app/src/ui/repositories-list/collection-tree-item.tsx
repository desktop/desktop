import * as React from 'react'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ICollectionWithChildren } from '../../models/collection'

export type DropPosition = 'before' | 'into' | 'after'

export interface ICollectionTreeItemProps {
  readonly collection: ICollectionWithChildren
  readonly depth: number
  readonly isRenaming: boolean
  readonly onToggleExpand: (collection: ICollectionWithChildren) => void
  readonly onRename: (
    collection: ICollectionWithChildren,
    newName: string
  ) => void
  readonly onCancelRename: () => void
  readonly onRequestRename: (collection: ICollectionWithChildren) => void
  readonly onContextMenu: (
    collection: ICollectionWithChildren,
    event: React.MouseEvent
  ) => void
  readonly onRepositoryDropped: (
    collection: ICollectionWithChildren,
    repositoryId: number,
    position: DropPosition
  ) => void
  readonly onCollectionDropped: (
    target: ICollectionWithChildren,
    draggedFolderId: number,
    position: DropPosition
  ) => void
}

interface ICollectionTreeItemState {
  readonly draftName: string
  readonly dropPosition: DropPosition | null
}

const FOLDER_MIME = 'application/x-collection-id'
const REPO_MIME = 'application/x-repository-id'

export class CollectionTreeItem extends React.Component<
  ICollectionTreeItemProps,
  ICollectionTreeItemState
> {
  private inputRef = React.createRef<HTMLInputElement>()
  private rowRef = React.createRef<HTMLDivElement>()

  public constructor(props: ICollectionTreeItemProps) {
    super(props)
    this.state = { draftName: props.collection.name, dropPosition: null }
  }

  private dragPayloadKind(e: React.DragEvent): 'collection' | 'repo' | null {
    if (e.dataTransfer.types.includes(FOLDER_MIME)) {
      return 'collection'
    }
    if (e.dataTransfer.types.includes(REPO_MIME)) {
      return 'repo'
    }
    return null
  }

  private computeDropPosition(e: React.DragEvent): DropPosition {
    const el = this.rowRef.current
    if (!el) {
      return 'into'
    }
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top
    if (y < rect.height / 3) {
      return 'before'
    }
    if (y > (rect.height * 2) / 3) {
      return 'after'
    }
    return 'into'
  }

  private onDragStart = (e: React.DragEvent) => {
    if (this.props.isRenaming) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData(FOLDER_MIME, String(this.props.collection.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  private onDragOver = (e: React.DragEvent) => {
    const kind = this.dragPayloadKind(e)
    if (kind === null) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const position = this.computeDropPosition(e)
    if (this.state.dropPosition !== position) {
      this.setState({ dropPosition: position })
    }
  }

  private onDragLeave = () => {
    if (this.state.dropPosition !== null) {
      this.setState({ dropPosition: null })
    }
  }

  private onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const position = this.state.dropPosition ?? this.computeDropPosition(e)
    this.setState({ dropPosition: null })
    const kind = this.dragPayloadKind(e)
    if (kind === 'repo') {
      const repoId = parseInt(e.dataTransfer.getData(REPO_MIME), 10)
      if (!Number.isNaN(repoId)) {
        this.props.onRepositoryDropped(this.props.collection, repoId, position)
      }
    } else if (kind === 'collection') {
      const collectionId = parseInt(e.dataTransfer.getData(FOLDER_MIME), 10)
      if (
        !Number.isNaN(collectionId) &&
        collectionId !== this.props.collection.id
      ) {
        this.props.onCollectionDropped(
          this.props.collection,
          collectionId,
          position
        )
      }
    }
  }

  public componentDidMount() {
    if (this.props.isRenaming) {
      this.inputRef.current?.focus()
      this.inputRef.current?.select()
    }
  }

  public componentDidUpdate(prevProps: ICollectionTreeItemProps) {
    if (!prevProps.isRenaming && this.props.isRenaming) {
      this.setState({ draftName: this.props.collection.name })
      setTimeout(() => {
        this.inputRef.current?.focus()
        this.inputRef.current?.select()
      }, 0)
    }
  }

  private onChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onToggleExpand(this.props.collection)
  }

  private onRowClick = (e: React.MouseEvent) => {
    if (this.props.isRenaming) {
      return
    }
    // Ignore clicks that originated in a button (chevron handles its own toggle)
    const target = e.target as HTMLElement
    if (target.closest('button')) {
      return
    }
    this.props.onToggleExpand(this.props.collection)
  }

  private onRowKeyDown = (e: React.KeyboardEvent) => {
    if (this.props.isRenaming) {
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.props.onToggleExpand(this.props.collection)
    }
  }

  private onRowContextMenu = (e: React.MouseEvent) => {
    this.props.onContextMenu(this.props.collection, e)
  }

  private onDoubleClick = () => {
    this.props.onRequestRename(this.props.collection)
  }

  private onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ draftName: e.target.value })
  }

  private onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      this.commitRename()
    } else if (e.key === 'Escape') {
      this.props.onCancelRename()
    }
  }

  private onInputBlur = () => {
    this.commitRename()
  }

  private commitRename = () => {
    const name = this.state.draftName.trim()
    if (name.length > 0) {
      this.props.onRename(this.props.collection, name)
    } else {
      this.props.onCancelRename()
    }
  }

  public render() {
    const { collection, depth } = this.props
    const indentStyle =
      depth > 0
        ? { paddingLeft: `calc(var(--spacing) + ${depth * 12}px)` }
        : undefined
    const chevron = collection.isExpanded
      ? octicons.chevronDown
      : octicons.chevronRight
    const { dropPosition } = this.state

    return (
      <div
        ref={this.rowRef}
        tabIndex={0}
        className={classNames('collection-tree-item', {
          'drop-before': dropPosition === 'before',
          'drop-into': dropPosition === 'into',
          'drop-after': dropPosition === 'after',
        })}
        style={indentStyle}
        draggable={!this.props.isRenaming}
        onDragStart={this.onDragStart}
        onClick={this.onRowClick}
        onKeyDown={this.onRowKeyDown}
        onDoubleClick={this.onDoubleClick}
        onContextMenu={this.onRowContextMenu}
        onDragOver={this.onDragOver}
        onDragLeave={this.onDragLeave}
        onDrop={this.onDrop}
        role="treeitem"
        aria-expanded={collection.isExpanded}
        aria-selected={false}
      >
        <button
          className="collection-chevron"
          onClick={this.onChevronClick}
          aria-label={
            collection.isExpanded ? 'Collapse collection' : 'Expand collection'
          }
        >
          <Octicon symbol={chevron} />
        </button>
        <Octicon className="collection-icon" symbol={octicons.fileDirectory} />
        {this.props.isRenaming ? (
          <input
            ref={this.inputRef}
            className="collection-name-input"
            value={this.state.draftName}
            onChange={this.onInputChange}
            onKeyDown={this.onInputKeyDown}
            onBlur={this.onInputBlur}
          />
        ) : (
          <span className="collection-name">{collection.name}</span>
        )}
      </div>
    )
  }
}
