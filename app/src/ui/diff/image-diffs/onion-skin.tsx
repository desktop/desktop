import * as React from 'react'
import { ICommonImageDiffProperties } from './modified-image-diff'
import { ImageContainer } from './image-container'

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
    const style: React.CSSProperties = {
      height: this.props.maxSize.height,
      width: this.props.maxSize.width,
    }

    const maxSize: React.CSSProperties = {
      maxHeight: this.props.maxSize.height,
      maxWidth: this.props.maxSize.width,
    }

    return (
      <div className="image-diff-onion-skin">
        <div className="sizing-container" ref={this.props.onContainerRef}>
          <div className="image-container" style={style}>
            <div className="image-diff-previous" style={style}>
              <ImageContainer
                image={this.props.previous}
                onElementLoad={this.props.onPreviousImageLoad}
                style={maxSize}
              />
            </div>

            <div
              className="image-diff-current"
              style={{
                ...style,
                opacity: this.state.crossfade,
              }}
            >
              <ImageContainer
                image={this.props.current}
                onElementLoad={this.props.onCurrentImageLoad}
                style={maxSize}
              />
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

  private onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ crossfade: e.currentTarget.valueAsNumber })
  }
}
