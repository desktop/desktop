import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ISize } from './sizing'

/**
 * The height of the Deleted/Added labels at the top and the image dimension
 * labels.
 */
const ControlsHeight = 60

const XPadding = 20

interface ITwoUpProps extends ICommonImageDiffProperties {
  readonly containerWidth: number

  readonly previousImageSize: ISize | null
  readonly currentImageSize: ISize | null
}

export class TwoUp extends React.Component<ITwoUpProps, {}> {
  public render() {
    const style: React.CSSProperties = {
      maxWidth: Math.min(
        (this.props.containerWidth - XPadding) / 2,
        this.props.maxSize.width
      ),
      maxHeight: this.props.maxSize.height - ControlsHeight,
    }

    const zeroSize = { width: 0, height: 0 }
    const previousImageSize = this.props.previousImageSize || zeroSize
    const currentImageSize = this.props.currentImageSize || zeroSize

    return (
      <div className="image-diff-two-up" ref={this.props.onContainerRef}>
        <div className="image-diff-previous">
          <div className="image-diff-header">Deleted</div>
          <ImageContainer
            image={this.props.previous}
            onElementLoad={this.props.onPreviousImageLoad}
            style={style}
          />

          <div className="image-diff-footer">
            <span className="strong">W:</span> {previousImageSize.width}px |{' '}
            <span className="strong">H:</span> {previousImageSize.height}px
          </div>
        </div>

        <div className="image-diff-current">
          <div className="image-diff-header">Added</div>
          <ImageContainer
            image={this.props.current}
            onElementLoad={this.props.onCurrentImageLoad}
            style={style}
          />

          <div className="image-diff-footer">
            <span className="strong">W:</span> {currentImageSize.width}px |{' '}
            <span className="strong">H:</span> {currentImageSize.height}px
          </div>
        </div>
      </div>
    )
  }
}
