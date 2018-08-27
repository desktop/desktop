import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ISize } from './sizing'
import { formatBytes, Sign } from '../../lib/bytes'
import * as classNames from 'classnames'

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
    const percentDiff = (previous: number, current: number) => {
      const diff = Math.round((100 * (current - previous)) / previous)
      const sign = diff > 0 ? '+' : ''
      return sign + diff + '%'
    }

    const zeroSize = { width: 0, height: 0 }
    const previousImageSize = this.props.previousImageSize || zeroSize
    const currentImageSize = this.props.currentImageSize || zeroSize
    const diffPercent = percentDiff(
      this.props.previous.bytes,
      this.props.current.bytes
    )
    const diffBytes = this.props.current.bytes - this.props.previous.bytes

    return (
      <div className="image-diff-container" ref={this.props.onContainerRef}>
        <div className="image-diff-two-up">
          <div className="image-diff-previous">
            <div className="image-diff-header">Deleted</div>
            <ImageContainer
              image={this.props.previous}
              onElementLoad={this.props.onPreviousImageLoad}
              style={style}
            />

            <div className="image-diff-footer">
              <span className="strong">W:</span> {previousImageSize.width}
              px | <span className="strong">H:</span> {previousImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(this.props.previous.bytes)}
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
              <span className="strong">W:</span> {currentImageSize.width}
              px | <span className="strong">H:</span> {currentImageSize.height}
              px | <span className="strong">Size:</span>{' '}
              {formatBytes(this.props.current.bytes)}
            </div>
          </div>
        </div>
        <div className="image-diff-summary">
          Diff:{' '}
          <span
            className={classNames({
              added: diffBytes > 0,
              removed: diffBytes < 0,
            })}
          >
            {diffBytes !== 0
              ? `${formatBytes(diffBytes, Sign.Forced)} (${diffPercent})`
              : 'No size difference'}
          </span>
        </div>
      </div>
    )
  }
}
