import * as React from 'react'
import * as classNames from 'classnames'

interface IListRowProps {
  readonly rowCount: number
  readonly rowIndex: number
  readonly ariaMode?: 'list' | 'menu'
  readonly style: React.CSSProperties
  readonly tabIndex?: number
  readonly id?: string
  readonly selected?: boolean
  readonly onRef?: (element: HTMLDivElement | null) => void
  readonly onRowMouseOver: (
    index: number,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onRowMouseDown: (
    index: number,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onRowClick: (
    index: number,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onRowKeyDown: (
    index: number,
    e: React.KeyboardEvent<HTMLDivElement>
  ) => void
}

export class ListRow extends React.Component<IListRowProps, {}> {
  private onRowMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseOver(this.props.rowIndex, e)
  }

  private onRowMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseDown(this.props.rowIndex, e)
  }

  private onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowClick(this.props.rowIndex, e)
  }

  private onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    this.props.onRowKeyDown(this.props.rowIndex, e)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames('list-item', { selected })
    const role = this.props.ariaMode === 'menu' ? 'menuitem' : 'option'

    return (
      <div
        id={this.props.id}
        aria-setsize={this.props.rowCount}
        aria-posinset={this.props.rowIndex + 1}
        aria-selected={this.props.selected}
        role={role}
        className={className}
        tabIndex={this.props.tabIndex}
        ref={this.props.onRef}
        onMouseOver={this.onRowMouseOver}
        onMouseDown={this.onRowMouseDown}
        onClick={this.onRowClick}
        onKeyDown={this.onRowKeyDown}
        style={this.props.style}
      >
        {this.props.children}
      </div>
    )
  }
}
