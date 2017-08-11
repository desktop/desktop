import * as React from 'react'

import { ImageDiffType } from '../../../lib/app-state'
import { Image } from '../../../models/diff'
import { TabBar, TabBarType } from '../../tab-bar'
import { TwoUp } from './two-up'
import { DifferenceBlend } from './difference-blend'
import { OnionSkin } from './onion-skin'
import { Swipe } from './swipe'
import { assertNever } from '../../../lib/fatal-error'
import { IImageSize, getMaxFitSize } from './sizing'

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
  readonly diffType: ImageDiffType
  readonly onChangeDiffType: (type: ImageDiffType) => void
}

export interface ICommonImageDiffProperties {
  readonly maxSize: IImageSize

  readonly previous: Image
  readonly current: Image

  readonly onPreviousImageLoad: (img: HTMLImageElement) => void
  readonly onCurrentImageLoad: (img: HTMLImageElement) => void

  readonly onContainerRef: (e: HTMLElement | null) => void
}

interface IModifiedImageDiffState {
  /** The size of the previous image. */
  readonly previousImageSize: IImageSize | null

  /** The size of the current image. */
  readonly currentImageSize: IImageSize | null
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
    const size = { width: img.naturalWidth, height: img.naturalHeight }
    this.setState({ previousImageSize: size })
  }

  private onCurrentImageLoad = (img: HTMLImageElement) => {
    const size = { width: img.naturalWidth, height: img.naturalHeight }
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
    const containerWidth = boundingRect.width
    const containerHeight = boundingRect.height
    const containerSize = { width: containerWidth, height: containerHeight }

    const maxFitSize = getMaxFitSize(
      previousImageSize,
      currentImageSize,
      containerSize
    )

    return {
      ...maxFitSize,
      containerWidth,
    }
  }

  private onContainerRef = (c: HTMLDivElement | null) => {
    this.container = c
  }

  public render() {
    return (
      <div className="panel image" id="diff">
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
        return (
          <TwoUp
            {...this.getCommonProps(width, height)}
            containerWidth={containerWidth}
            previousImageSize={this.state.previousImageSize}
            currentImageSize={this.state.currentImageSize}
          />
        )

      case ImageDiffType.Swipe:
        return <Swipe {...this.getCommonProps(width, height)} />

      case ImageDiffType.OnionSkin:
        return <OnionSkin {...this.getCommonProps(width, height)} />

      case ImageDiffType.Difference:
        return <DifferenceBlend {...this.getCommonProps(width, height)} />

      default:
        return assertNever(type, `Unknown diff type: ${type}`)
    }
  }

  private getCommonProps(
    width: number,
    height: number
  ): ICommonImageDiffProperties {
    const maxSize = { width, height }
    return {
      maxSize,
      previous: this.props.previous,
      current: this.props.current,
      onPreviousImageLoad: this.onPreviousImageLoad,
      onCurrentImageLoad: this.onCurrentImageLoad,
      onContainerRef: this.onContainerRef,
    }
  }
}
