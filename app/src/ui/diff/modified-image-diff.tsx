import * as React from 'react'

import { ImageDiffType } from '../../lib/app-state'
import { Image } from '../../models/diff'
import { renderImage } from './render-image'
import { TabBar, TabBarType } from '../tab-bar'

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
  readonly diffType: ImageDiffType
  readonly onChangeDiffType: (type: ImageDiffType) => void
}

interface IModifiedImageDiffState {
  readonly value: ImageDiffType
  readonly naturalWidthBefore: number | null
  readonly naturalHeightBefore: number | null
  readonly naturalWidthAfter: number | null
  readonly naturalHeightAfter: number | null
}

const SIZE_CONTROLS = 60
const PADDING = 20

const getDimensions = (
  naturalHeight: number | null,
  naturalWidth: number | null,
  _containerWidth: number,
  _containerHeight: number
) => {
  // keep some padding
  const containerWidth = _containerWidth - PADDING
  const containerHeight = _containerHeight - PADDING - SIZE_CONTROLS

  // check wether we will need to scale the images or not
  const heightRatio =
    containerHeight < (naturalHeight || 0)
      ? (naturalHeight || 0) / containerHeight
      : 1
  const widthRatio =
    containerWidth < (naturalWidth || 0)
      ? (naturalWidth || 0) / containerWidth
      : 1

  // Use max to prevent scaling up the image
  let ratio = Math.max(1, widthRatio)
  if (widthRatio < heightRatio) {
    // fit to height
    ratio = Math.max(1, heightRatio)
  }

  return {
    width: (naturalWidth || 0) / ratio,
    height: (naturalHeight || 0) / ratio,
  }
}

/** A component which renders the changes to an image in the repository */
export class ModifiedImageDiff extends React.Component<
  IModifiedImageDiffProps,
  IModifiedImageDiffState
> {
  private _container: HTMLDivElement | null

  public constructor(props: IModifiedImageDiffProps) {
    super(props)
    this.state = {
      value: ImageDiffType.Swipe,
      naturalWidthBefore: null,
      naturalHeightBefore: null,
      naturalWidthAfter: null,
      naturalHeightAfter: null,
    }
  }

  private handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({
      value: parseFloat(e.currentTarget.value),
    })
  }

  private handleImgLoadBefore = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalHeight, naturalWidth } = e.target as HTMLImageElement
    this.setState({
      naturalHeightBefore: naturalHeight,
      naturalWidthBefore: naturalWidth,
    })
  }

  private handleImgLoadAfter = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalHeight, naturalWidth } = e.target as HTMLImageElement
    this.setState({
      naturalHeightAfter: naturalHeight,
      naturalWidthAfter: naturalWidth,
    })
  }

  private getScaledDimensions() {
    const {
      naturalWidthBefore,
      naturalHeightBefore,
      naturalWidthAfter,
      naturalHeightAfter,
    } = this.state

    const widthContainer =
      (this._container && this._container.getBoundingClientRect().width) || 0
    const heightContainer =
      (this._container && this._container.getBoundingClientRect().height) || 0

    let height = 0
    let width = 0

    if (naturalHeightBefore && naturalHeightAfter) {
      const before = getDimensions(
        naturalHeightBefore,
        naturalWidthBefore,
        widthContainer,
        heightContainer
      )
      const after = getDimensions(
        naturalHeightAfter,
        naturalWidthAfter,
        widthContainer,
        heightContainer
      )

      height = Math.max(before.height, after.height)
      width = Math.max(before.width, after.height)
    }

    return {
      height,
      width,
      heightContainer,
      widthContainer,
    }
  }

  private onContainerRef = (c: HTMLDivElement | null) => {
    this._container = c
  }

  public render() {
    const { height, width, widthContainer } = this.getScaledDimensions()
    return (
      <div className="panel image" id="diff" ref={this.onContainerRef}>
        {this.props.diffType === ImageDiffType.TwoUp &&
          this.render2Up(height, width, widthContainer)}
        {this.props.diffType === ImageDiffType.Swipe &&
          this.renderSwipe(height, width, widthContainer)}
        {this.props.diffType === ImageDiffType.OnionSkin &&
          this.renderFade(height, width, widthContainer)}
        {this.props.diffType === ImageDiffType.Difference &&
          this.renderDifference(height, width, widthContainer)}
        <TabBar
          selectedIndex={this.props.diffType}
          onTabClicked={this.props.onChangeDiffType}
          type={TabBarType.Switch}
        >
          <span>2-up</span>
          <span>Swipe</span>
          <span>Onion Skin</span>
          <span>Difference</span>
        </TabBar>
      </div>
    )
  }

  private render2Up(height: number, width: number, widthContainer: number) {
    const style = {
      maxHeight: height + SIZE_CONTROLS,
      maxWidth: Math.min((widthContainer - 20) / 2, width),
    }
    return (
      <div className="image-diff_inner--two-up">
        <div className="image-diff__before">
          <div className="image-diff__header">Deleted</div>
          {renderImage(this.props.previous, {
            onLoad: this.handleImgLoadBefore,
            style,
          })}
          <div className="image-diff__footer">
            <span className="strong">W:</span> {this.state.naturalWidthBefore}px
            | <span className="strong">H:</span>{' '}
            {this.state.naturalHeightBefore}px
          </div>
        </div>
        <div className="image-diff__after">
          <div className="image-diff__header">Added</div>
          {renderImage(this.props.current, {
            onLoad: this.handleImgLoadAfter,
            style,
          })}
          <div className="image-diff__footer">
            <span className="strong">W:</span> {this.state.naturalWidthAfter}px
            | <span className="strong">H:</span> {this.state.naturalHeightAfter}px
          </div>
        </div>
      </div>
    )
  }

  private renderDifference(
    height: number,
    width: number,
    widthContainer: number
  ) {
    return (
      <div
        className="image-diff_inner--difference"
        style={{
          height,
          width,
          left: (widthContainer - PADDING - width) / 2 + PADDING / 2,
        }}
      >
        <div className="image-diff__before">
          {renderImage(this.props.previous, {
            onLoad: this.handleImgLoadBefore,
            style: {
              maxHeight: height,
              maxWidth: width,
            },
          })}
        </div>
        <div className="image-diff__after">
          {renderImage(this.props.current, {
            onLoad: this.handleImgLoadAfter,
            style: {
              maxHeight: height,
              maxWidth: width,
              mixBlendMode: 'difference',
            },
          })}
        </div>
      </div>
    )
  }

  private renderFade(height: number, width: number, widthContainer: number) {
    const style = {
      height,
      width,
    }
    return (
      <div
        className="image-diff_inner--fade"
        style={{
          ...style,
          marginBottom: 30,
          left: (widthContainer - PADDING - width) / 2 + PADDING / 2,
        }}
      >
        <div className="image-diff__before" style={style}>
          {renderImage(this.props.previous, {
            onLoad: this.handleImgLoadBefore,
            style: {
              maxHeight: height,
              maxWidth: width,
            },
          })}
        </div>
        <div
          className="image-diff__after"
          style={{
            ...style,
            opacity: this.state.value,
          }}
        >
          {renderImage(this.props.current, {
            onLoad: this.handleImgLoadAfter,
            style: {
              maxHeight: height,
              maxWidth: width,
            },
          })}
        </div>
        <input
          style={{ margin: `${height + 10}px 0 0 ${(width - 129) / 2}px` }}
          type="range"
          max={1}
          min={0}
          value={this.state.value}
          step={0.001}
          onChange={this.handleValueChange}
        />
      </div>
    )
  }

  private renderSwipe(height: number, width: number, widthContainer: number) {
    const style = {
      height,
      width,
    }
    return (
      <div
        className="image-diff_inner--swipe"
        style={{
          ...style,
          marginBottom: 30,
          left: (widthContainer - PADDING - width) / 2 + PADDING / 2,
        }}
      >
        <div className="image-diff__after" style={style}>
          {renderImage(this.props.current, {
            onLoad: this.handleImgLoadAfter,
            style: {
              maxHeight: height,
              maxWidth: width,
            },
          })}
        </div>
        <div
          className="image-diff--swiper"
          style={{
            width: width * (1 - this.state.value),
            height: height + 10,
          }}
        >
          <div className="image-diff__before" style={style}>
            {renderImage(this.props.previous, {
              onLoad: this.handleImgLoadBefore,
              style: {
                maxHeight: height,
                maxWidth: width,
              },
            })}
          </div>
        </div>
        <input
          style={{ margin: `${height + 10}px 0 0 -7px`, width: width + 14 }}
          type="range"
          max={1}
          min={0}
          value={this.state.value}
          step={0.001}
          onChange={this.handleValueChange}
        />
      </div>
    )
  }
}
