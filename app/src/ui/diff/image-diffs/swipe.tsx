import * as React from 'react'
import { PADDING, IImageSize } from './modified-image-diff'
import { Image } from '../../../models/diff'
import { renderImage } from './render-image'

interface ISwipeProps {
  readonly maxSize: IImageSize
  readonly containerWidth: number

  readonly previous: Image
  readonly current: Image

  readonly onPreviousImageLoad: (img: HTMLImageElement) => void
  readonly onCurrentImageLoad: (img: HTMLImageElement) => void
}

interface ISwipeState {
  readonly swipePercentage: number
}

export class Swipe extends React.Component<ISwipeProps, ISwipeState> {
  public constructor(props: ISwipeProps) {
    super(props)

    this.state = { swipePercentage: 1 }
  }

  public render() {
    const style = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }
    return (
      <div
        className="image-diff_inner--swipe"
        style={{
          ...style,
          marginBottom: 30,
          left:
            (this.props.containerWidth - PADDING - this.props.maxSize.width) /
              2 +
            PADDING / 2,
        }}
      >
        <div className="image-diff__after" style={style}>
          {renderImage(this.props.current, {
            onLoad: this.onCurrentImageLoad,
            style: {
              maxHeight: this.props.maxSize.height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>
        <div
          className="image-diff--swiper"
          style={{
            width: this.props.maxSize.width * (1 - this.state.swipePercentage),
            height: this.props.maxSize.height + 10,
          }}
        >
          <div className="image-diff__before" style={style}>
            {renderImage(this.props.previous, {
              onLoad: this.onPreviousImageLoad,
              style: {
                maxHeight: this.props.maxSize.height,
                maxWidth: this.props.maxSize.width,
              },
            })}
          </div>
        </div>
        <input
          style={{
            margin: `${this.props.maxSize.height + 10}px 0 0 -7px`,
            width: this.props.maxSize.width + 14,
          }}
          type="range"
          max={1}
          min={0}
          value={this.state.swipePercentage}
          step={0.001}
          onChange={this.onValueChange}
        />
      </div>
    )
  }

  private onPreviousImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    this.props.onPreviousImageLoad(e.currentTarget)
  }

  private onCurrentImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    this.props.onCurrentImageLoad(e.currentTarget)
  }

  private onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ swipePercentage: e.currentTarget.valueAsNumber })
  }
}
