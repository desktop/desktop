import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { renderImage } from './render-image'

/** How much bigger the slider should be than the images. */
const SliderOverflow = 14

/** The padding between the slider and the image on the Y axis. */
// const SliderYPadding = 10

interface ISwipeState {
  readonly percentage: number
}

interface ISwipeProps extends ICommonImageDiffProperties {
  readonly onContainerRef: (e: HTMLElement | null) => void
}

export class Swipe extends React.Component<ISwipeProps, ISwipeState> {
  public constructor(props: ISwipeProps) {
    super(props)

    this.state = { percentage: 1 }
  }

  public render() {
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }
    return (
      <div className="image-diff_inner--swipe">
        <div className="swipe-sizing-container" ref={this.props.onContainerRef}>
          <div className="image-container" style={style}>
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
                width: this.props.maxSize.width * (1 - this.state.percentage),
                height: this.props.maxSize.height,
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
          </div>
        </div>
        <input
          style={{
            width: this.props.maxSize.width + SliderOverflow,
          }}
          className="slider"
          type="range"
          max={1}
          min={0}
          value={this.state.percentage}
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
    const percentage = e.currentTarget.valueAsNumber
    this.setState({ percentage })
  }
}
