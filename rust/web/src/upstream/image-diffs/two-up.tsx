import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ISize } from './sizing'
import { formatBytes, sizeDifference } from './format'

interface ITwoUpProps extends ICommonImageDiffProperties {
  readonly previousImageSize: ISize | null
  readonly currentImageSize: ISize | null
}

export class TwoUp extends React.Component<ITwoUpProps, {}> {
  public render() {
    const zeroSize = { width: 0, height: 0 }
    const previousImageSize = this.props.previousImageSize || zeroSize
    const currentImageSize = this.props.currentImageSize || zeroSize

    const { current, previous } = this.props

    const diffPercent = sizeDifference(previous.bytes, current.bytes)
    const diffBytes = current.bytes - previous.bytes
    const diffBytesSign = diffBytes >= 0 ? '+' : ''

    const style: React.CSSProperties = {
      maxWidth:
        this.props.maxSize.width < 200 ? undefined : this.props.maxSize.width,
    }

    return (
      <div className="image-diff-container" ref={this.props.onContainerRef}>
        <div className="image-diff-two-up">
          <div className="image-diff-previous" style={style}>
            <div className="image-diff-header">Deleted</div>
            <ImageContainer
              image={previous}
              onElementLoad={this.props.onPreviousImageLoad}
            />

            <div className="image-diff-footer">
              <span className="strong">W:</span> {previousImageSize.width}
              px | <span className="strong">H:</span> {previousImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(previous.bytes, 2)}
            </div>
          </div>

          <div className="image-diff-current" style={style}>
            <div className="image-diff-header">Added</div>
            <ImageContainer
              image={current}
              onElementLoad={this.props.onCurrentImageLoad}
            />

            <div className="image-diff-footer">
              <span className="strong">W:</span> {currentImageSize.width}
              px | <span className="strong">H:</span> {currentImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(current.bytes, 2)}
            </div>
          </div>
        </div>
        <div className="image-diff-summary">
          Diff:{' '}
          <span
            className={
              diffBytes > 0 ? 'added' : diffBytes < 0 ? 'removed' : undefined
            }
          >
            {diffBytes !== 0
              ? `${diffBytesSign}${formatBytes(diffBytes, 2)} (${diffPercent})`
              : 'No size difference'}
          </span>
        </div>
      </div>
    )
  }
}
