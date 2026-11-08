import * as React from 'react'

import { Image } from '../diff/image'
import { ImageDiffType } from '../diff/image-diff'
import { TwoUp } from './two-up'
import { DifferenceBlend } from './difference-blend'
import { OnionSkin } from './onion-skin'
import { Swipe } from './swipe'
import { ISize, getMaxFitSize } from './sizing'

const imageModes = [
  { type: ImageDiffType.TwoUp, label: '2-up' },
  { type: ImageDiffType.Swipe, label: 'Swipe' },
  { type: ImageDiffType.OnionSkin, label: 'Onion Skin' },
  { type: ImageDiffType.Difference, label: 'Difference' },
] as const

interface IModifiedImageDiffProps {
  readonly previous: Image
  readonly current: Image
  readonly diffType: ImageDiffType
  /**
   * Called when the user is viewing an image diff and requests
   * to change the diff presentation mode.
   */
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
  private readonly modeButtons = new Map<ImageDiffType, HTMLButtonElement>()

  private readonly resizeObserver: ResizeObserver | null
  private resizedTimeoutID: number | null = null

  public constructor(props: IModifiedImageDiffProps) {
    super(props)

    this.resizeObserver =
      typeof window.ResizeObserver === 'function'
        ? new window.ResizeObserver(() => this.scheduleResize())
        : null

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

  public componentDidMount() {
    window.addEventListener('resize', this.scheduleResize)
    this.scheduleResize()
  }

  public componentWillUnmount() {
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.scheduleResize)
    if (this.resizedTimeoutID !== null)
      window.clearTimeout(this.resizedTimeoutID)
  }

  private scheduleResize = () => {
    if (this.resizedTimeoutID !== null)
      window.clearTimeout(this.resizedTimeoutID)
    this.resizedTimeoutID = window.setTimeout(() => {
      this.resizedTimeoutID = null
      if (!this.container) return
      const box = this.container.getBoundingClientRect()
      this.setState(state =>
        state.containerSize?.width === box.width &&
        state.containerSize?.height === box.height
          ? null
          : { containerSize: { width: box.width, height: box.height } }
      )
    }, 0)
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

    this.resizeObserver?.disconnect()

    if (c) {
      this.resizeObserver?.observe(c)
      this.scheduleResize()
    }
  }

  private onModeKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    type: ImageDiffType
  ) => {
    const direction =
      event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (direction === 0) return
    const index = imageModes.findIndex(mode => mode.type === type)
    const next =
      imageModes[(index + direction + imageModes.length) % imageModes.length]
        .type
    event.preventDefault()
    this.modeButtons.get(next)?.focus()
    this.props.onChangeDiffType(next)
  }

  public render() {
    return (
      <div className="panel image" id="diff">
        <div
          className="tab-bar switch"
          role="group"
          aria-label="Image comparison modes"
        >
          {imageModes.map(({ type, label }, index) => (
            <React.Fragment key={type}>
              <button
                type="button"
                className={`tab-bar-item${
                  this.props.diffType === type ? ' selected' : ''
                }`}
                tabIndex={this.props.diffType === type ? 0 : -1}
                aria-pressed={this.props.diffType === type}
                ref={button => {
                  if (button) this.modeButtons.set(type, button)
                  else this.modeButtons.delete(type)
                }}
                onKeyDown={event => this.onModeKeyDown(event, type)}
                onClick={() => this.props.onChangeDiffType(type)}
              >
                {label}
              </button>
              {index < imageModes.length - 1 && (
                <div className="tab-bar-separator" />
              )}
            </React.Fragment>
          ))}
        </div>

        {this.renderCurrentDiffType()}
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
        throw new Error('Unknown image comparison mode')
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
