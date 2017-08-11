import * as React from 'react'
import { DiffImage } from './diff-image'
import { ICommonImageDiffProperties } from './modified-image-diff'

export class DifferenceBlend extends React.Component<
  ICommonImageDiffProperties,
  {}
> {
  public render() {
    const maxSize: React.CSSProperties = {
      maxHeight: this.props.maxSize.height,
      maxWidth: this.props.maxSize.width,
    }

    return (
      <div
        className="image-diff_inner--difference"
        ref={this.props.onContainerRef}
      >
        <div
          className="diff-blend-sizing-container"
          ref={this.props.onContainerRef}
        >
          <div className="image-container" style={maxSize}>
            <div className="image-diff__before">
              <DiffImage
                image={this.props.previous}
                onElementLoad={this.props.onPreviousImageLoad}
                style={{
                  ...maxSize,
                  mixBlendMode: 'difference',
                }}
              />
            </div>

            <div className="image-diff__after">
              <DiffImage
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
