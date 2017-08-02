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
export const PADDING = 20

function getAspectFitSize(
  imageSize: IImageSize,
  containerSize: IImageSize
): IImageSize {
  // check wether we will need to scale the images or not
  const heightRatio =
    containerSize.height < imageSize.height
      ? imageSize.height / containerSize.height
      : 1
  const widthRatio =
    containerSize.width < imageSize.width
      ? imageSize.width / containerSize.width
      : 1

  // Use max to prevent scaling up the image
  let ratio = Math.max(1, widthRatio)
  if (widthRatio < heightRatio) {
    // fit to height
    ratio = Math.max(1, heightRatio)
  }

  return {
    width: imageSize.width / ratio,
    height: imageSize.height / ratio,
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
    const { previousImageSize, currentImageSize } = this.state

    const containerWidth =
      (this.container &&
        this.container.getBoundingClientRect().width - PADDING) ||
      0
    const containerHeight =
      (this.container &&
        this.container.getBoundingClientRect().height -
          PADDING -
          SIZE_CONTROLS) ||
      0
    const containerSize = { width: containerWidth, height: containerHeight }

    let height = 0
    let width = 0

    if (previousImageSize && currentImageSize) {
      const previousSize = getAspectFitSize(previousImageSize, containerSize)
      const currentSize = getAspectFitSize(currentImageSize, containerSize)

      height = Math.max(previousSize.height, currentSize.height)
      width = Math.max(previousSize.width, currentSize.height)
    }

    return {
      height,
      width,
      containerHeight,
      containerWidth,
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
      height: height + SIZE_CONTROLS,
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
    return (
      <DifferenceBlend
        maxSize={maxSize}
        containerWidth={containerWidth}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
      />
    )
  }

  private renderOnionSkin(
    height: number,
    width: number,
    containerWidth: number
  ) {
    const maxSize = { height, width }
    return (
      <OnionSkin
        maxSize={maxSize}
        containerWidth={containerWidth}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
      />
    )
  }

  private renderSwipe(height: number, width: number, containerWidth: number) {
    const maxSize = { width, height }
    return (
      <Swipe
        maxSize={maxSize}
        containerWidth={containerWidth}
        previous={this.props.previous}
        current={this.props.current}
        onPreviousImageLoad={this.onPreviousImageLoad}
        onCurrentImageLoad={this.onCurrentImageLoad}
      />
    )
  }
}
