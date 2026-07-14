import * as React from 'react'
import { ImageContainer } from './image-container'
import { ICommonImageDiffProperties } from './modified-image-diff'

export class DifferenceBlend extends React.Component<
  ICommonImageDiffProperties,
  {}
> {
  public render() {
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    const maxSize: React.CSSProperties = {
      maxHeight: this.props.maxSize.height,
      maxWidth: this.props.maxSize.width,
    }

    return (
      <div className="image-diff-difference" ref={this.props.onContainerRef}>
        <div className="sizing-container">
          <div className="image-container" style={style}>
            <div className="image-diff-previous">
              <ImageContainer
                image={this.props.previous}
                onElementLoad={this.props.onPreviousImageLoad}
                style={maxSize}
              />
            </div>

            <div className="image-diff-current">
              <ImageContainer
                image={this.props.current}
                onElementLoad={this.props.onCurrentImageLoad}
                style={{
                  ...maxSize,
                  mixBlendMode: 'difference',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }
}
