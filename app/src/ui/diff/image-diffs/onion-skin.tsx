import * as React from 'react'
import { PADDING, IImageSize } from './modified-image-diff'
import { renderImage } from './render-image'
import { Image } from '../../../models/diff'

interface IOnionSkinProps {
  readonly maxSize: IImageSize
  readonly containerWidth: number

  readonly previous: Image
  readonly current: Image

  readonly onPreviousImageLoad: (img: HTMLImageElement) => void
  readonly onCurrentImageLoad: (img: HTMLImageElement) => void
}

interface IOnionSkinState {
  readonly crossfade: number
}

export class OnionSkin extends React.Component<
  IOnionSkinProps,
  IOnionSkinState
> {
  public constructor(props: IOnionSkinProps) {
    super(props)

    this.state = { crossfade: 1 }
  }

  public render() {
    const style = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }
    return (
      <div
        className="image-diff_inner--fade"
        style={{
          ...style,
          marginBottom: 30,
          left:
            (this.props.containerWidth - PADDING - this.props.maxSize.width) /
              2 +
            PADDING / 2,
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
              maxHeight: this.props.maxSize.height,
              maxWidth: this.props.maxSize.width,
            },
          })}
        </div>
        <input
          style={{
            margin: `${this.props.maxSize.height + 10}px 0 0 ${(this.props
              .maxSize.width -
              129) /
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
