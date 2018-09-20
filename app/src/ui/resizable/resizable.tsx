import * as React from 'react'

/**
 * Component abstracting a resizable panel.
 *
 * Note: this component is pure, consumers must subscribe to the
 * onResize and onReset event and update the width prop accordingly.
 */
export class Resizable extends React.Component<IResizableProps, {}> {
  public static defaultProps: IResizableProps = {
    width: 250,
    maximumWidth: 350,
    minimumWidth: 200,
  }

  private startWidth: number | null = null
  private startX: number | null = null

  /**
   * Returns the current width as determined by props.
   *
   * This value will be constrained by the maximum and minimum
   * with props and might not be identical to that of props.width.
   */
  private getCurrentWidth() {
    return this.clampWidth(this.props.width)
  }

  /**
   * Constrains the provided width to lie within the minimum and
   * maximum widths as determined by props
   */
  private clampWidth(width: number) {
    return Math.max(
      this.props.minimumWidth!,
      Math.min(this.props.maximumWidth!, width)
    )
  }

  /**
   * Handler for when the user presses the mouse button over the resize
   * handle.
   */
  private handleDragStart = (e: React.MouseEvent<any>) => {
    this.startX = e.clientX
    this.startWidth = this.getCurrentWidth() || null

    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragStop)

    e.preventDefault()
  }

  /**
   * Handler for when the user moves the mouse while dragging
   */
  private handleDragMove = (e: MouseEvent) => {
    if (this.startWidth == null || this.startX == null) {
      return
    }

    const deltaX = e.clientX - this.startX
    const newWidth = this.startWidth + deltaX
    const newWidthClamped = this.clampWidth(newWidth)

    if (this.props.onResize) {
      this.props.onResize(newWidthClamped)
    }

    e.preventDefault()
  }

  /**
   * Handler for when the user lets go of the mouse button during
   * a resize operation.
   */
  private handleDragStop = (e: MouseEvent) => {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragStop)

    e.preventDefault()
  }

  /**
   * Handler for when the resize handle is double clicked.
   *
   * Resets the panel width to its default value and clears
   * any persisted value.
   */
  private handleDoubleClick = () => {
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  public render() {
    const style: React.CSSProperties = {
      width: this.getCurrentWidth(),
      maxWidth: this.props.maximumWidth,
      minWidth: this.props.minimumWidth,
    }

    return (
      <div id={this.props.id} className="resizable-component" style={style}>
        {this.props.children}
        <div
          onMouseDown={this.handleDragStart}
          onDoubleClick={this.handleDoubleClick}
          className="resize-handle"
        />
      </div>
    )
  }
}

export interface IResizableProps {
  readonly width: number

  /** The maximum width the panel can be resized to.
   *
   * @default 350
   */
  readonly maximumWidth?: number

  /**
   * The minimum width the panel can be resized to.
   *
   * @default 150
   */
  readonly minimumWidth?: number

  /** The optional ID for the root element. */
  readonly id?: string

  /**
   * Handler called when the width of the component has changed
   * through an explicit resize event (dragging the handle).
   */
  readonly onResize?: (newWidth: number) => void

  /**
   * Handler called when the resizable component has been
   * reset (ie restored to its original width by double clicking
   * on the resize handle).
   */
  readonly onReset?: () => void
}
