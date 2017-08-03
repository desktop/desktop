import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { renderImage } from './render-image'

interface IOnionSkinState {
  readonly crossfade: number
}

interface IOnionSkinProps extends ICommonImageDiffProperties {
  readonly onContainerRef: (e: HTMLElement | null) => void
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
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    return (
      <div className="image-diff_inner--fade">
        <div
          className="onion-skin-sizing-container"
          ref={this.props.onContainerRef}
        >
          <div className="image-container" style={style}>
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
          </div>
        </div>

        <input
          style={{
            width: this.props.maxSize.width / 2,
          }}
          className="slider"
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
