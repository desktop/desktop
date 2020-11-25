import * as React from 'react'

import { Image, ImageDiffType } from '../../../models/diff'
import { TabBar, TabBarType } from '../../tab-bar'
import { TwoUp } from './two-up'
import { DifferenceBlend } from './difference-blend'
import { OnionSkin } from './onion-skin'
import { Swipe } from './swipe'
import { assertNever } from '../../../lib/fatal-error'
import { ISize, getMaxFitSize } from './sizing'

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
  readonly diffType: ImageDiffType
  readonly onChangeDiffType: (type: ImageDiffType) => void
}

export interface ICommonImageDiffProperties {
  /** The biggest size to fit both the previous and current images. */
  readonly maxSize: ISize

  /** The previous image. */
  readonly previous: Image

  /** The current image. */
  readonly current: Image

  /** A function to call when the previous image has loaded. */
  readonly onPreviousImageLoad: (img: HTMLImageElement) => void

  /** A function to call when the current image has loaded. */
  readonly onCurrentImageLoad: (img: HTMLImageElement) => void

  /**
   * A function to call which provides the element that will contain the
   * images. This container element is used to measure the available space for
   * the images, which is then used to calculate the aspect fit size.
   */
  readonly onContainerRef: (e: HTMLElement | null) => void
}

interface IModifiedImageDiffState {
  /** The size of the previous image. */
  readonly previousImageSize: ISize | null

  /** The size of the current image. */
  readonly currentImageSize: ISize | null

  /** The size of the container element. */
  readonly containerSize: ISize | null
}

/** A component which renders the changes to an image in the repository */
export class ModifiedImageDiff extends React.Component<
  IModifiedImageDiffProps,
  IModifiedImageDiffState
> {
  private container: HTMLElement | null = null

  private readonly resizeObserver: ResizeObserver
  private resizedTimeoutID: NodeJS.Immediate | null = null

  public constructor(props: IModifiedImageDiffProps) {
    super(props)

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === this.container) {
          // We might end up causing a recursive update by updating the state
          // when we're reacting to a resize so we'll defer it until after
          // react is done with this frame.
          if (this.resizedTimeoutID !== null) {
            clearImmediate(this.resizedTimeoutID)
          }

          this.resizedTimeoutID = setImmediate(
            this.onResized,
            entry.target,
            entry.contentRect
          )
        }
      }
    })

    this.state = {
      previousImageSize: null,
      currentImageSize: null,
      containerSize: null,
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

  private onResized = (target: HTMLElement, contentRect: ClientRect) => {
    this.resizedTimeoutID = null

    const containerSize = {
      width: contentRect.width,
      height: contentRect.height,
    }
    this.setState({ containerSize })
  }

  private getMaxSize(): ISize {
    const zeroSize = { width: 0, height: 0, containerWidth: 0 }
    const containerSize = this.state.containerSize
    if (!containerSize) {
      return zeroSize
    }

    const { previousImageSize, currentImageSize } = this.state
    if (!previousImageSize || !currentImageSize) {
      return zeroSize
    }

    const maxFitSize = getMaxFitSize(
      previousImageSize,
      currentImageSize,
      containerSize
    )

    return maxFitSize
  }

  private onContainerRef = (c: HTMLElement | null) => {
    this.container = c

    this.resizeObserver.disconnect()

    if (c) {
      this.resizeObserver.observe(c)
    }
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
    const maxSize = this.getMaxSize()
    const type = this.props.diffType
    switch (type) {
      case ImageDiffType.TwoUp:
        return (
          <TwoUp
            {...this.getCommonProps(maxSize)}
            containerWidth={
              (this.state.containerSize && this.state.containerSize.width) || 0
            }
            previousImageSize={this.state.previousImageSize}
            currentImageSize={this.state.currentImageSize}
          />
        )

      case ImageDiffType.Swipe:
        return <Swipe {...this.getCommonProps(maxSize)} />

      case ImageDiffType.OnionSkin:
        return <OnionSkin {...this.getCommonProps(maxSize)} />

      case ImageDiffType.Difference:
        return <DifferenceBlend {...this.getCommonProps(maxSize)} />

      default:
        return assertNever(type, `Unknown diff type: ${type}`)
    }
  }

  private getCommonProps(maxSize: ISize): ICommonImageDiffProperties {
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
