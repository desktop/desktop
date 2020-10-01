import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ISize } from './sizing'
import { formatBytes } from '../../lib/bytes'
import classNames from 'classnames'

interface ITwoUpProps extends ICommonImageDiffProperties {
  readonly previousImageSize: ISize | null
  readonly currentImageSize: ISize | null
}

export class TwoUp extends React.Component<ITwoUpProps, {}> {
  public render() {
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
    const diffBytesSign = diffBytes >= 0 ? '+' : '-'

    return (
      <div className="image-diff-container" ref={this.props.onContainerRef}>
        <div className="image-diff-two-up">
          <div className="image-diff-previous">
            <div className="image-diff-header">Deleted</div>
            <ImageContainer
              image={this.props.previous}
              onElementLoad={this.props.onPreviousImageLoad}
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
              ? `${diffBytesSign}${formatBytes(diffBytes)} (${diffPercent})`
              : 'No size difference'}
          </span>
        </div>
      </div>
    )
  }
}
