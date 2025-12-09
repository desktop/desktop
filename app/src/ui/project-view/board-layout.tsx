import * as React from 'react'
import {
  IAPIProjectField,
  IAPIProjectV2ItemWithContent,
} from '../../lib/api'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import classNames from 'classnames'

interface IBoardLayoutProps {
  readonly items: ReadonlyArray<IAPIProjectV2ItemWithContent>
  readonly fields: ReadonlyArray<IAPIProjectField>
  readonly statusField: IAPIProjectField | undefined
  readonly groupByField?: { id: string; name: string }
  readonly onCardClick?: (item: IAPIProjectV2ItemWithContent) => void
  readonly onStatusChange?: (
    item: IAPIProjectV2ItemWithContent,
    newStatusOptionId: string,
    newStatusName: string
  ) => void
  readonly onAddIssue?: (statusOptionId: string, statusName: string) => void
}

interface IBoardLayoutState {
  readonly draggedItemId: string | null
  readonly dragOverColumnId: string | null
  readonly dragOverItemId: string | null
  readonly columnItemOrder: Map<string, string[]>
}

interface IColumn {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly items: ReadonlyArray<IAPIProjectV2ItemWithContent>
}

export class BoardLayout extends React.Component<IBoardLayoutProps, IBoardLayoutState> {
  private static readonly STORAGE_KEY = 'board-column-order'

  public constructor(props: IBoardLayoutProps) {
    super(props)
    this.state = {
      draggedItemId: null,
      dragOverColumnId: null,
      dragOverItemId: null,
      columnItemOrder: this.loadColumnOrder(),
    }
  }

  private loadColumnOrder(): Map<string, string[]> {
    try {
      const stored = localStorage.getItem(BoardLayout.STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return new Map(Object.entries(parsed))
      }
    } catch (e) {
      // Ignore parse errors
    }
    return new Map()
  }

  private saveColumnOrder(order: Map<string, string[]>) {
    try {
      const obj: Record<string, string[]> = {}
      order.forEach((value, key) => {
        obj[key] = value
      })
      localStorage.setItem(BoardLayout.STORAGE_KEY, JSON.stringify(obj))
    } catch (e) {
      // Ignore storage errors
    }
  }

  private sortItemsByOrder(
    items: ReadonlyArray<IAPIProjectV2ItemWithContent>,
    columnId: string
  ): ReadonlyArray<IAPIProjectV2ItemWithContent> {
    const order = this.state.columnItemOrder.get(columnId)
    if (!order || order.length === 0) {
      return items
    }

    // Sort items based on saved order, items not in order go to the end
    const sorted = [...items].sort((a, b) => {
      const aIndex = order.indexOf(a.id)
      const bIndex = order.indexOf(b.id)
      if (aIndex === -1 && bIndex === -1) return 0
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })

    return sorted
  }
  private getColumns(): ReadonlyArray<IColumn> {
    const { items, statusField } = this.props

    // If no status field, put all items in one column
    if (!statusField || !statusField.options) {
      return [
        {
          id: 'all',
          name: 'All Items',
          color: 'GRAY',
          items,
        },
      ]
    }

    // Create columns from status field options
    const columns: IColumn[] = statusField.options.map(option => ({
      id: option.id,
      name: option.name,
      color: option.color || 'GRAY',
      items: [],
    }))

    // Add a "No Status" column for items without a status
    const noStatusColumn: IColumn = {
      id: 'no-status',
      name: 'No Status',
      color: 'GRAY',
      items: [],
    }

    // Group items by their status
    const columnMap = new Map<string, IAPIProjectV2ItemWithContent[]>()
    for (const column of columns) {
      columnMap.set(column.id, [])
    }
    columnMap.set('no-status', [])

    for (const item of items) {
      const statusValue = item.fieldValues.find(
        fv => fv.field.name === 'Status'
      )

      if (statusValue && statusValue.type === 'singleSelect') {
        const columnItems = columnMap.get(statusValue.optionId)
        if (columnItems) {
          columnItems.push(item)
        } else {
          // If option not found, add to no status
          columnMap.get('no-status')!.push(item)
        }
      } else {
        columnMap.get('no-status')!.push(item)
      }
    }

    // Build final columns array with items
    const result: IColumn[] = columns.map(col => ({
      ...col,
      items: columnMap.get(col.id) || [],
    }))

    // Add no status column if it has items
    const noStatusItems = columnMap.get('no-status') || []
    if (noStatusItems.length > 0) {
      result.unshift({
        ...noStatusColumn,
        items: noStatusItems,
      })
    }

    return result
  }

  private getColumnColorClass(color: string): string {
    // Map GitHub project colors to CSS classes
    const colorMap: Record<string, string> = {
      GRAY: 'gray',
      RED: 'red',
      PINK: 'pink',
      PURPLE: 'purple',
      BLUE: 'blue',
      GREEN: 'green',
      YELLOW: 'yellow',
      ORANGE: 'orange',
    }
    return colorMap[color.toUpperCase()] || 'gray'
  }

  private onCardClick = (item: IAPIProjectV2ItemWithContent) => {
    this.props.onCardClick?.(item)
  }

  private onDragStart = (e: React.DragEvent<HTMLDivElement>, item: IAPIProjectV2ItemWithContent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
    this.setState({ draggedItemId: item.id })
  }

  private onDragEnd = () => {
    this.setState({ draggedItemId: null, dragOverColumnId: null, dragOverItemId: null })
  }

  private onColumnDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (this.state.dragOverColumnId !== columnId) {
      this.setState({ dragOverColumnId: columnId })
    }
  }

  private onColumnDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!e.currentTarget.contains(relatedTarget)) {
      this.setState({ dragOverColumnId: null })
    }
  }

  private onItemDragOver = (e: React.DragEvent<HTMLDivElement>, itemId: string) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (this.state.dragOverItemId !== itemId && this.state.draggedItemId !== itemId) {
      this.setState({ dragOverItemId: itemId })
    }
  }

  private onItemDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!e.currentTarget.contains(relatedTarget)) {
      this.setState({ dragOverItemId: null })
    }
  }

  private onItemDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetItem: IAPIProjectV2ItemWithContent,
    column: IColumn
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const { draggedItemId } = this.state

    if (!draggedItemId || draggedItemId === targetItem.id) {
      this.setState({ draggedItemId: null, dragOverColumnId: null, dragOverItemId: null })
      return
    }

    // Get current column items in sorted order
    const sortedItems = this.sortItemsByOrder(column.items, column.id)
    const itemIds = sortedItems.map(item => item.id)

    // Remove dragged item from current position
    const draggedIndex = itemIds.indexOf(draggedItemId)
    if (draggedIndex > -1) {
      itemIds.splice(draggedIndex, 1)
    }

    // Insert at target position
    const targetIndex = itemIds.indexOf(targetItem.id)
    if (targetIndex > -1) {
      itemIds.splice(targetIndex, 0, draggedItemId)
    } else {
      itemIds.push(draggedItemId)
    }

    // Update state and persist
    const newOrder = new Map(this.state.columnItemOrder)
    newOrder.set(column.id, itemIds)
    this.saveColumnOrder(newOrder)
    this.setState({
      columnItemOrder: newOrder,
      draggedItemId: null,
      dragOverColumnId: null,
      dragOverItemId: null,
    })
  }

  private onColumnDrop = (e: React.DragEvent<HTMLDivElement>, column: IColumn) => {
    e.preventDefault()
    const { draggedItemId, dragOverItemId } = this.state
    const { items, onStatusChange } = this.props

    // If dropping on an item, that handler takes precedence
    if (dragOverItemId) {
      return
    }

    if (!draggedItemId) {
      this.setState({ draggedItemId: null, dragOverColumnId: null, dragOverItemId: null })
      return
    }

    // Find the dragged item
    const draggedItem = items.find(item => item.id === draggedItemId)
    if (!draggedItem) {
      this.setState({ draggedItemId: null, dragOverColumnId: null, dragOverItemId: null })
      return
    }

    // Get the current status of the dragged item
    const currentStatus = draggedItem.fieldValues.find(
      fv => fv.field.name === 'Status' && fv.type === 'singleSelect'
    )
    const currentStatusId = currentStatus?.type === 'singleSelect' ? currentStatus.optionId : null

    // Only trigger change if moving to a different column
    if (currentStatusId !== column.id && column.id !== 'no-status' && onStatusChange) {
      onStatusChange(draggedItem, column.id, column.name)
    }

    // If same column, add to end of order
    if (currentStatusId === column.id || (currentStatusId === null && column.id === 'no-status')) {
      const sortedItems = this.sortItemsByOrder(column.items, column.id)
      const itemIds = sortedItems.map(item => item.id)
      // Move to end if not already there
      const draggedIndex = itemIds.indexOf(draggedItemId)
      if (draggedIndex > -1 && draggedIndex !== itemIds.length - 1) {
        itemIds.splice(draggedIndex, 1)
        itemIds.push(draggedItemId)
        const newOrder = new Map(this.state.columnItemOrder)
        newOrder.set(column.id, itemIds)
        this.saveColumnOrder(newOrder)
        this.setState({ columnItemOrder: newOrder })
      }
    }

    this.setState({ draggedItemId: null, dragOverColumnId: null, dragOverItemId: null })
  }

  private renderCard(item: IAPIProjectV2ItemWithContent, column: IColumn) {
    const content = item.content
    if (!content) {
      return null
    }

    const repoInfo = content.repository
      ? `${content.repository.owner.login}/${content.repository.name}`
      : null

    const isDragging = this.state.draggedItemId === item.id
    const isDragOver = this.state.dragOverItemId === item.id
    const cardClassName = classNames('board-card', {
      dragging: isDragging,
      'drag-over': isDragOver,
    })

    return (
      <div
        key={item.id}
        className={cardClassName}
        draggable={true}
        onDragStart={e => this.onDragStart(e, item)}
        onDragEnd={this.onDragEnd}
        onDragOver={e => this.onItemDragOver(e, item.id)}
        onDragLeave={this.onItemDragLeave}
        onDrop={e => this.onItemDrop(e, item, column)}
        onClick={() => this.onCardClick(item)}
      >
        <div className="card-header">
          {content.type === 'Issue' && (
            <Octicon
              symbol={content.state === 'OPEN' ? octicons.issueOpened : octicons.issueClosed}
              className={`issue-icon ${content.state === 'OPEN' ? 'open' : 'closed'}`}
            />
          )}
          {content.type === 'PullRequest' && (
            <Octicon
              symbol={octicons.gitPullRequest}
              className={`pr-icon ${content.state === 'OPEN' ? 'open' : 'merged'}`}
            />
          )}
          {content.type === 'DraftIssue' && (
            <Octicon symbol={octicons.issueDraft} className="draft-icon" />
          )}
          <span className="card-title">{content.title}</span>
        </div>
        <div className="card-meta">
          {repoInfo && <span className="card-repo">{repoInfo}</span>}
          {content.number && <span className="card-number">#{content.number}</span>}
        </div>
        {content.labels && content.labels.length > 0 && (
          <div className="card-labels">
            {content.labels.slice(0, 3).map((label, idx) => (
              <span
                key={idx}
                className="card-label"
                style={{ backgroundColor: `#${label.color}` }}
              >
                {label.name}
              </span>
            ))}
            {content.labels.length > 3 && (
              <span className="more-labels">+{content.labels.length - 3}</span>
            )}
          </div>
        )}
        {content.assignees && content.assignees.length > 0 && (
          <div className="card-assignees">
            {content.assignees.slice(0, 3).map((assignee, idx) => (
              <img
                key={idx}
                src={assignee.avatarUrl}
                alt={assignee.login}
                className="assignee-avatar"
                title={assignee.login}
              />
            ))}
            {content.assignees.length > 3 && (
              <span className="more-assignees">+{content.assignees.length - 3}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  private onAddIssueClick = (e: React.MouseEvent, column: IColumn) => {
    e.stopPropagation()
    e.preventDefault()
    console.log('[BoardLayout] Add issue clicked for column:', column.name, column.id)
    if (this.props.onAddIssue && column.id !== 'no-status') {
      this.props.onAddIssue(column.id, column.name)
    }
  }

  private renderColumn(column: IColumn) {
    const colorClass = this.getColumnColorClass(column.color)
    const isDragOver = this.state.dragOverColumnId === column.id
    const columnClassName = classNames('board-column', colorClass, {
      'drag-over': isDragOver,
    })

    // Sort items by saved order
    const sortedItems = this.sortItemsByOrder(column.items, column.id)

    const showAddButton = this.props.onAddIssue && column.id !== 'no-status'

    return (
      <div
        key={column.id}
        className={columnClassName}
        onDragOver={e => this.onColumnDragOver(e, column.id)}
        onDragLeave={this.onColumnDragLeave}
        onDrop={e => this.onColumnDrop(e, column)}
      >
        <div className="column-header">
          <span className={`column-indicator ${colorClass}`} />
          <span className="column-name">{column.name}</span>
          <span className="column-count">{column.items.length}</span>
          {showAddButton && (
            <button
              className="column-add-button"
              onClick={(e) => this.onAddIssueClick(e, column)}
              title={`Add issue to ${column.name}`}
            >
              <Octicon symbol={octicons.plus} />
            </button>
          )}
        </div>
        <div className="column-content">
          {sortedItems.map(item => this.renderCard(item, column))}
          {sortedItems.length === 0 && (
            <div className="column-empty">No items</div>
          )}
        </div>
      </div>
    )
  }

  public render() {
    const columns = this.getColumns()

    return (
      <div className="board-layout">
        <div className="board-columns">
          {columns.map(column => this.renderColumn(column))}
        </div>
      </div>
    )
  }
}
