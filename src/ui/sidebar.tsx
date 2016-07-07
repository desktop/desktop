import * as React from 'react'
import {ThrottledScheduler} from '../lib/throttled-scheduler'

interface ISidebarProps extends React.Props<Sidebar> {
  /**
   * The default width of the sidebar.
   *
   * The default width is used until user first resizes the
   * sidebar or when the custom size is explicitly reset by
   * double clicking on the resize handle.
   */
  defaultWidth?: number

  /** The maximum width the sidebar can be resized to. */
  maximumWidth?: number

  /** The minimum width the sidebar can be resized to. */
  minimumWidth?: number
}

interface ISidebarState {
  /**
   * The width of the sidebar in pixels.
   * Optional, @default 270(px)
   */
  width?: number
}

/** String key used when persisting the sidebar width to localStorage */
const sidebarWidthConfigKey = 'app-sidebar-width'

/** Component abstracting the application sidebar.
  *
  * Handles user resizing and persistence of sidebar width.
  */
export class Sidebar extends React.Component<ISidebarProps, ISidebarState> {

  public static defaultProps: ISidebarProps = {
    defaultWidth: 270,
    // Note: Any change to the maximum or minimum width in
    // this file should be accompanied by a corresponding
    // change in sidebar.scss
    minimumWidth: 200,
    maximumWidth: 340,
  }

  private startWidth: number
  private startX: number
  private configWriteScheduler = new ThrottledScheduler(300)

  public constructor(props: ISidebarProps) {
    super(props)
    this.state = { width: this.getPersistedWidth() }
  }

  private getPersistedWidth() {
    return parseInt(localStorage.getItem(sidebarWidthConfigKey), 10)
  }

  private setPersistedWidth(newWidth: number) {
    this.configWriteScheduler.queue(() => {
      localStorage.setItem(sidebarWidthConfigKey, newWidth.toString())
    })
  }

  private clearPersistedWidth() {
    this.configWriteScheduler.queue(() => {
      localStorage.removeItem(sidebarWidthConfigKey)
    })
  }

  private getCurrentWidth() {
    return (this.state && this.state.width)
      ? this.state.width
      : this.props.defaultWidth
  }

  /**
   * Handler for when the user presses the mouse button over the resize
   * handle.
   *
   * Note: This method is intentionally bound using `=>` so that
   * we can avoid creating anonymous functions repeatedly in render()
   */
  private handleDragStart = (e: React.MouseEvent) => {
    this.startX = e.clientX
    this.startWidth = this.getCurrentWidth()

    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragStop)
  }

  /**
   * Handler for when the user moves the mouse while dragging
   *
   * Note: This method is intentionally bound using `=>` so that
   * we can avoid creating anonymous functions repeatedly in render()
   */
  private handleDragMove = (e: MouseEvent) => {
    const deltaX = e.clientX - this.startX

    const newWidth = this.startWidth + deltaX
    const newWidthClamped = Math.max(this.props.minimumWidth, Math.min(this.props.maximumWidth, newWidth))

    this.setState({ width: newWidthClamped })
    this.setPersistedWidth(newWidthClamped)
  }

  /**
   * Handler for when the user lets go of the mouse button during
   * a resize operation.
   *
   * Note: This method is intentionally bound using `=>` so that
   * we can avoid creating anonymous functions repeatedly in render()
   */
  private handleDragStop = (e: MouseEvent) => {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragStop)
  }

  /**
   * Handler for when the resize handle is double clicked.
   *
   * Resets the sidebar width to its default value and clears
   * any persisted value.
   *
   * Note: This method is intentionally bound using `=>` so that
   * we can avoid creating anonymous functions repeatedly in render()
   */
  private handleDoubleClick = () => {
    this.setState({ width: null })
    this.clearPersistedWidth()
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
