import * as React from 'react'

import { ImageDiffType } from '../../../lib/app-state'
import { Image } from '../../../models/diff'
import { TabBar, TabBarType } from '../../tab-bar'
import { TwoUp } from './two-up'
import { DifferenceBlend } from './difference-blend'
import { OnionSkin } from './onion-skin'
import { Swipe } from './swipe'
import { assertNever } from '../../../lib/fatal-error'

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
  readonly diffType: ImageDiffType
  readonly onChangeDiffType: (type: ImageDiffType) => void
}

export interface IImageSize {
  readonly width: number
  readonly height: number
}

interface IModifiedImageDiffState {
  /** The size of the previous image. */
  readonly previousImageSize: IImageSize | null

  /** The size of the current image. */
  readonly currentImageSize: IImageSize | null
}

const SIZE_CONTROLS = 60
const PADDING = 20

/**
 * Get the size which fits in the container without scaling and maintaining
 * aspect ratio.
 */
function getAspectFitSize(
  imageSize: IImageSize,
  containerSize: IImageSize
): IImageSize {
  const heightRatio =
    containerSize.height < imageSize.height
      ? imageSize.height / containerSize.height
      : 1
  const widthRatio =
    containerSize.width < imageSize.width
      ? imageSize.width / containerSize.width
      : 1

  let ratio = Math.max(1, widthRatio)
  if (widthRatio < heightRatio) {
    ratio = Math.max(1, heightRatio)
  }

  return {
    width: imageSize.width / ratio,
    height: imageSize.height / ratio,
  }
}

/**
 * Get the size which will fit the bigger of the two images while maintaining
 * aspect ratio.
 */
function getMaxFitSize(
  previousImageSize: IImageSize,
  currentImageSize: IImageSize,
  containerSize: IImageSize
): IImageSize {
  const previousSize = getAspectFitSize(previousImageSize, containerSize)
  const currentSize = getAspectFitSize(currentImageSize, containerSize)

  const width = Math.max(previousSize.width, currentSize.width)
  const height = Math.max(previousSize.height, currentSize.height)

  return {
    width,
    height,
  }
}

/** A component which renders the changes to an image in the repository */
export class ModifiedImageDiff extends React.Component<
  IModifiedImageDiffProps,
  IModifiedImageDiffState
> {
  private container: HTMLDivElement | null

  public constructor(props: IModifiedImageDiffProps) {
    super(props)

    this.state = {
      previousImageSize: null,
      currentImageSize: null,
    }
  }

  private onPreviousImageLoad = (img: HTMLImageElement) => {
    const size = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    this.setState({ previousImageSize: size })
  }

  private onCurrentImageLoad = (img: HTMLImageElement) => {
    const size = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    this.setState({ currentImageSize: size })
  }

  private getScaledDimensions() {
    const zeroSize = { width: 0, height: 0, containerWidth: 0 }
    const container = this.container
    if (!container) {
      return zeroSize
    }

    const { previousImageSize, currentImageSize } = this.state
    if (!previousImageSize || !currentImageSize) {
      return zeroSize
    }

    const boundingRect = container.getBoundingClientRect()
    const containerWidth = boundingRect.width - PADDING
    const containerHeight = boundingRect.height - PADDING - SIZE_CONTROLS
    const containerSize = { width: containerWidth, height: containerHeight }
    return {
      ...getMaxFitSize(previousImageSize, currentImageSize, containerSize),
      containerWidth,
      containerHeight,
    }
  }

  private onContainerRef = (c: HTMLDivElement | null) => {
    this.container = c
  }

  public render() {
    return (
      <div className="panel image" id="diff" ref={this.onContainerRef}>
        {this.renderCurrentDiffType()}

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

  private renderCurrentDiffType() {
    const { height, width, containerWidth } = this.getScaledDimensions()
    const type = this.props.diffType
    switch (type) {
      case ImageDiffType.TwoUp:
        return this.render2Up(height, width, containerWidth)

      case ImageDiffType.Swipe:
        return this.renderSwipe(height, width, containerWidth)

      case ImageDiffType.OnionSkin:
        return this.renderOnionSkin(height, width, containerWidth)

      case ImageDiffType.Difference:
        return this.renderDifference(height, width, containerWidth)

      default:
        return assertNever(type, `Unknown diff type: ${type}`)
    }
  }

  private render2Up(height: number, width: number, containerWidth: number) {
    const maxSize = {
      height: height - SIZE_CONTROLS,
      width: Math.min((containerWidth - 20) / 2, width),
    }
    return (
      <TwoUp
        maxSize={maxSize}
        previous={this.props.previous}
        current={this.props.current}
        previousImageSize={this.state.previousImageSize}
        currentImageSize={this.state.currentImageSize}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
      />
    )
  }

  private renderDifference(
    height: number,
    width: number,
    containerWidth: number
  ) {
    const maxSize = { width, height }
    const left = (containerWidth - PADDING - width) / 2 + PADDING / 2
    return (
      <DifferenceBlend
        maxSize={maxSize}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
        left={left}
      />
    )
  }

  private renderOnionSkin(
    height: number,
    width: number,
    containerWidth: number
  ) {
    const maxSize = { height, width }
    const left = (containerWidth - PADDING - width) / 2 + PADDING / 2
    return (
      <OnionSkin
        maxSize={maxSize}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
        left={left}
      />
    )
  }

  private renderSwipe(height: number, width: number, containerWidth: number) {
    const maxSize = { width, height }
    const left = (containerWidth - PADDING - width) / 2 + PADDING / 2
    return (
      <Swipe
        maxSize={maxSize}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
        left={left}
      />
    )
  }
}
