import * as React from 'react'
import { IImageSize } from './modified-image-diff'
import { Image } from '../../../models/diff'
import { renderImage } from './render-image'

/** The height of the controls. */
const ControlHeight = 30

/** How much bigger the slider should be than the images. */
const SliderOverflow = 14

/** The padding between the slider and the image on the Y axis. */
const SliderYPadding = 10

interface ISwipeProps {
  readonly maxSize: IImageSize

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
    const height = this.props.maxSize.height - ControlHeight
    const style = {
      height,
      width: this.props.maxSize.width,
    }
    return (
      <div className="image-diff_inner--swipe" style={style}>
        <div className="image-diff__after" style={style}>
          {renderImage(this.props.current, {
            onLoad: this.onCurrentImageLoad,
            style: {
              maxHeight: height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>
        <div
          className="image-diff--swiper"
          style={{
            width: this.props.maxSize.width * (1 - this.state.swipePercentage),
            height: height,
          }}
        >
          <div className="image-diff__before" style={style}>
            {renderImage(this.props.previous, {
              onLoad: this.onPreviousImageLoad,
              style: {
                maxHeight: height,
                maxWidth: this.props.maxSize.width,
              },
            })}
          </div>
        </div>
        <input
          style={{
            margin: `${height + SliderYPadding}px 0 0 -${SliderOverflow / 2}px`,
            width: this.props.maxSize.width + SliderOverflow,
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
