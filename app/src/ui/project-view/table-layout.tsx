import * as React from 'react'
import {
  IAPIProjectField,
  IAPIProjectV2ItemWithContent,
  IAPIProjectFieldValue,
} from '../../lib/api'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface ITableLayoutProps {
  readonly items: ReadonlyArray<IAPIProjectV2ItemWithContent>
  readonly fields: ReadonlyArray<IAPIProjectField>
  readonly visibleFields?: ReadonlyArray<{ id: string; name: string }>
  readonly onRowClick?: (item: IAPIProjectV2ItemWithContent) => void
}

export class TableLayout extends React.Component<ITableLayoutProps> {
  private getVisibleColumns(): ReadonlyArray<IAPIProjectField> {
    const { fields, visibleFields } = this.props

    // If visibleFields is specified, use that order
    if (visibleFields && visibleFields.length > 0) {
      const fieldMap = new Map(fields.map(f => [f.id, f]))
      return visibleFields
        .map(vf => fieldMap.get(vf.id))
        .filter((f): f is IAPIProjectField => f !== undefined)
    }

    // Default: show Title and a few common fields
    const defaultFieldNames = ['Title', 'Status', 'Assignees', 'Labels']
    return fields.filter(f => defaultFieldNames.includes(f.name))
  }

  private getFieldValue(
    item: IAPIProjectV2ItemWithContent,
    field: IAPIProjectField
  ): IAPIProjectFieldValue | undefined {
    return item.fieldValues.find(fv => fv.field.name === field.name)
  }

  private onRowClick = (item: IAPIProjectV2ItemWithContent) => {
    this.props.onRowClick?.(item)
  }

  private renderCellValue(
    item: IAPIProjectV2ItemWithContent,
    field: IAPIProjectField
  ): React.ReactNode {
    // Special case for Title field - render the issue/PR info
    if (field.name === 'Title') {
      return this.renderTitleCell(item)
    }

    const fieldValue = this.getFieldValue(item, field)
    if (!fieldValue) {
      return <span className="empty-value">-</span>
    }

    switch (fieldValue.type) {
      case 'singleSelect':
        return this.renderSingleSelectValue(fieldValue.name, fieldValue.optionId, field)

      case 'text':
        return <span className="text-value">{fieldValue.text}</span>

      case 'number':
        return <span className="number-value">{fieldValue.number}</span>

      case 'date':
        return <span className="date-value">{this.formatDate(fieldValue.date)}</span>

      case 'iteration':
        return <span className="iteration-value">{fieldValue.title}</span>

      default:
        return <span className="empty-value">-</span>
    }
  }

  private renderTitleCell(item: IAPIProjectV2ItemWithContent): React.ReactNode {
    const content = item.content
    if (!content) {
      return <span className="empty-value">No content</span>
    }

    return (
      <div className="title-cell">
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
        <span className="title-text">{content.title}</span>
        {content.number && (
          <span className="item-number">#{content.number}</span>
        )}
      </div>
    )
  }

  private renderSingleSelectValue(
    name: string | undefined,
    optionId: string | undefined,
    field: IAPIProjectField
  ): React.ReactNode {
    if (!name) {
      return <span className="empty-value">-</span>
    }

    // Find the option to get its color
    const option = field.options?.find(o => o.id === optionId)
    const color = option?.color

    if (color) {
      const colorClass = this.getColorClass(color)
      return (
        <span className={`select-badge ${colorClass}`}>
          {name}
        </span>
      )
    }

    return <span className="select-value">{name}</span>
  }

  private getColorClass(color: string): string {
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

  private formatDate(dateString: string | undefined): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  private renderHeaderCell(field: IAPIProjectField): React.ReactNode {
    return (
      <th key={field.id} className="table-header-cell">
        <div className="header-content">
          <span className="header-name">{field.name}</span>
        </div>
      </th>
    )
  }

  private renderRow(
    item: IAPIProjectV2ItemWithContent,
    index: number,
    columns: ReadonlyArray<IAPIProjectField>
  ): React.ReactNode {
    return (
      <tr
        key={item.id}
        className="table-row"
        onClick={() => this.onRowClick(item)}
      >
        <td className="row-number-cell">{index + 1}</td>
        {columns.map(field => (
          <td key={field.id} className="table-cell">
            {this.renderCellValue(item, field)}
          </td>
        ))}
      </tr>
    )
  }

  public render() {
    const { items } = this.props
    const columns = this.getVisibleColumns()

    return (
      <div className="table-layout">
        <div className="table-container">
          <table className="project-table">
            <thead>
              <tr className="table-header-row">
                <th className="row-number-header">#</th>
                {columns.map(field => this.renderHeaderCell(field))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => this.renderRow(item, index, columns))}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="table-empty">
              <span>No items to display</span>
            </div>
          )}
        </div>
      </div>
    )
  }
}
