import * as React from 'react'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

interface IResizableProps extends React.Props<Resizable> {
  /** String key used when persisting the panel width to localStorage */
  configKey: string

  /**
   * The default width of the panel.
   *
   * The default width is used until user first resizes the
   * panel or when the custom size is explicitly reset by
   * double clicking on the resize handle.
   *
   * @default 250
   */
  defaultWidth?: number

  /** The maximum width the panel can be resized to.
   *
   * @default 400
   */
  maximumWidth?: number

  /**
   * The minimum width the panel can be resized to.
   *
   * @default 150
   */
  minimumWidth?: number

  /** The optional ID for the root element. */
  id?: string
}

interface IResizableState {
  /**
   * The width of the panel in pixels.
   * Optional
   */
  width?: number
}

/**
 * Component abstracting a resizable panel.
 *
 * Handles user resizing and persistence of the width.
 */
export class Resizable extends React.Component<IResizableProps, IResizableState> {

  public static defaultProps: IResizableProps = {
    configKey: 'resizable-width',
    defaultWidth: 250,
    minimumWidth: 150,
    maximumWidth: 350,
  }

  private startWidth: number | null
  private startX: number
  private configWriteScheduler = new ThrottledScheduler(300)

  public constructor(props: IResizableProps) {
    super(props)
    this.state = { width: this.getPersistedWidth() }
  }

  private getPersistedWidth() {
    const storedWidth = parseInt(localStorage.getItem(this.props.configKey) || '', 10)
    if (!storedWidth || isNaN(storedWidth)) {
      return this.props.defaultWidth
    }

    return storedWidth
  }

  private setPersistedWidth(newWidth: number) {
    this.configWriteScheduler.queue(() => {
      localStorage.setItem(this.props.configKey, newWidth.toString())
    })
  }

  private clearPersistedWidth() {
    this.configWriteScheduler.queue(() => {
      localStorage.removeItem(this.props.configKey)
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
  private handleDragStart = (e: React.MouseEvent<any>) => {
    this.startX = e.clientX
    this.startWidth = this.getCurrentWidth() || null

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
    const newWidthClamped = Math.max(this.props.minimumWidth!, Math.min(this.props.maximumWidth!, newWidth))

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
   * Resets the panel width to its default value and clears
   * any persisted value.
   *
   * Note: This method is intentionally bound using `=>` so that
   * we can avoid creating anonymous functions repeatedly in render()
   */
  private handleDoubleClick = () => {
    this.setState({ width: undefined })
    this.clearPersistedWidth()
  }

  public render() {

    const style: React.CSSProperties = {
      width: this.getCurrentWidth(),
      maximumWidth: this.props.maximumWidth,
      minimumWidth: this.props.minimumWidth,
    }

    return (
      <div id={this.props.id} className='resizable-component' style={style}>
        {this.props.children}
        <div onMouseDown={this.handleDragStart} onDoubleClick={this.handleDoubleClick} className='resize-handle'></div>
      </div>
    )
  }
}
