import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ImageContainer } from './image-container'

/** How much bigger the slider should be than the images. */
const SliderOverflow = 14

interface ISwipeState {
  readonly percentage: number
}

export class Swipe extends React.Component<
  ICommonImageDiffProperties,
  ISwipeState
> {
  public constructor(props: ICommonImageDiffProperties) {
    super(props)

    this.state = { percentage: 0 }
  }

  public render() {
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    const swiperWidth =
      this.props.maxSize.width * (1 - this.state.percentage / 100.0)

    const previousStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
      clipPath: `inset(0 ${Math.floor(swiperWidth)}px 0 0)`,
    }

    const currentStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
      clipPath: `inset(0 0 0 ${Math.floor(
        this.props.maxSize.width - swiperWidth
      )}px)`,
    }

    const maxSize: React.CSSProperties = {
      maxHeight: this.props.maxSize.height,
      maxWidth: this.props.maxSize.width,
    }

    return (
      <div className="image-diff-swipe">
        <input
          style={{
            width: this.props.maxSize.width + SliderOverflow,
          }}
          className="slider"
          type="range"
          max={100}
          min={0}
          value={this.state.percentage}
          step={0.1}
          onChange={this.onValueChange}
        />
        <div className="sizing-container" ref={this.props.onContainerRef}>
          <div className="image-container" style={style}>
            <div className="image-diff-previous" style={previousStyle}>
              <ImageContainer
                image={this.props.previous}
                onElementLoad={this.props.onPreviousImageLoad}
                style={maxSize}
              />
            </div>
            <div className="image-diff-current" style={currentStyle}>
              <ImageContainer
                image={this.props.current}
                onElementLoad={this.props.onCurrentImageLoad}
                style={maxSize}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  private onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentage = e.currentTarget.valueAsNumber
    this.setState({ percentage })
  }
}
