import * as React from 'react'

interface IListRowProps {
  readonly className: string
  readonly tabIndex?: number
  readonly id?: string
  readonly rowCount: number
  readonly rowIndex: number
  readonly selected?: boolean
  readonly role: string
  readonly style: React.CSSProperties
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
    return (
      <div
        id={this.props.id}
        aria-setsize={this.props.rowCount}
        aria-posinset={this.props.rowIndex + 1}
        aria-selected={this.props.selected}
        role={this.props.role}
        className={this.props.className}
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
