import * as React from 'react'

interface ISidebarProps extends React.Props<Sidebar> {
  defaultWidth?: number
  maximumWidth?: number
  minimumWidth?: number
}

interface ISidebarState {
  /**
   * The width of the sidebar in pixels.
   * Optional, @default 270(px)
   */
  width?: number
}

export class Sidebar extends React.Component<ISidebarProps, ISidebarState> {

  public static defaultProps: ISidebarProps = {
    defaultWidth: 270,
    minimumWidth: 200,
    maximumWidth: 340,
  }

  private startWidth: number
  private startX: number

  private getCurrentWidth() {
    return (this.state && this.state.width)
      ? this.state.width
      : this.props.defaultWidth
  }

  private handleDragStart = (e: React.MouseEvent) => {
    this.startX = e.clientX
    this.startWidth = this.getCurrentWidth()

    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragStop)
  }

  private handleDragMove = (e: MouseEvent) => {
    const deltaX = e.clientX - this.startX

    const newWidth = this.startWidth + deltaX
    const newWidthClamped = Math.max(this.props.minimumWidth, Math.min(this.props.maximumWidth, newWidth))

    this.setState({ width: newWidthClamped })
  }

  private handleDragStop = (e: MouseEvent) => {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragStop)
  }

  private handleDoubleClick = () => {
    this.setState({ width: this.props.defaultWidth })
  }

  public render() {

    const style: React.CSSProperties = {
      width: this.getCurrentWidth()
    }

    return (
      <div id='desktop-app-sidebar' style={style}>
        {this.props.children}
        <div onMouseDown={this.handleDragStart} onDoubleClick={this.handleDoubleClick} className='resize-handle'></div>
      </div>
    )
  }
}
