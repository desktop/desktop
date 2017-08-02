import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { renderImage } from './render-image'

/** The height of the controls. */
const ControlHeight = 30

/** The amount the slider is inset on its X axis. */
const SliderXInset = 129

/** The padding between the slider and the image on the Y axis. */
const SliderYPadding = 10

interface IOnionSkinState {
  readonly crossfade: number
}

export class OnionSkin extends React.Component<
  ICommonImageDiffProperties,
  IOnionSkinState
> {
  public constructor(props: ICommonImageDiffProperties) {
    super(props)

    this.state = { crossfade: 1 }
  }

  public render() {
    const height = this.props.maxSize.height - ControlHeight
    const style = {
      height,
      width: this.props.maxSize.width,
    }
    return (
      <div className="image-diff_inner--fade" style={style}>
        <div className="image-diff__before" style={style}>
          {renderImage(this.props.previous, {
            onLoad: this.onPreviousImageLoad,
            style: {
              maxHeight: height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>

        <div
          className="image-diff__after"
          style={{
            ...style,
            opacity: this.state.crossfade,
          }}
        >
          {renderImage(this.props.current, {
            onLoad: this.onCurrentImageLoad,
            style: {
              maxHeight: height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>

        <input
          style={{
            margin: `${height + SliderYPadding}px 0 0 ${(this.props.maxSize
              .width -
              SliderXInset) /
              2}px`,
          }}
          type="range"
          max={1}
          min={0}
          value={this.state.crossfade}
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
    this.setState({ crossfade: e.currentTarget.valueAsNumber })
  }
}
