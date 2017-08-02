import * as React from 'react'
import { renderImage } from './render-image'
import { ICommonImageDiffProperties } from './modified-image-diff'

export class DifferenceBlend extends React.Component<
  ICommonImageDiffProperties,
  {}
> {
  public render() {
    return (
      <div
        className="image-diff_inner--difference"
        style={{
          height: this.props.maxSize.height,
          width: this.props.maxSize.width,
        }}
      >
        <div className="image-diff__before">
          {renderImage(this.props.previous, {
            onLoad: this.onPreviousImageLoad,
            style: {
              maxHeight: this.props.maxSize.height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>

        <div className="image-diff__after">
          {renderImage(this.props.current, {
            onLoad: this.onCurrentImageLoad,
            style: {
              maxHeight: this.props.maxSize.height,
              maxWidth: this.props.maxSize.width,
              mixBlendMode: 'difference',
            },
          })}
        </div>
      </div>
    )
  }

  private onPreviousImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    this.props.onPreviousImageLoad(e.currentTarget)
  }

  private onCurrentImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    this.props.onCurrentImageLoad(e.currentTarget)
  }
}
