import * as React from 'react'
import * as Path from 'path'

interface IPathTextProps {
  /**
   * The file system path which is to be displayed and, if
   * necessary, truncated.
   */
  readonly path: string

  /**
   * An optional maximum width that the path should fit.
   * If omitted the available width is calculated at render
   * though never updated after the initial measurement.
   */
  readonly availableWidth?: number
}

interface IPathTextState {
  readonly iterations: number

  /** 
   * The maximum available width for the path. This corresponds
   * to the availableWidth prop if one was specified, if not it's
   * calculated at render time.
   */
  readonly availableWidth?: number

  /**
   * The measured width of the normalized path without any truncation.
   * We can use this value to optimize and avoid re-measuring the
   * string when the width increases.
   */
  readonly fullTextWidth?: number

  /**
   * The normalized version of the path prop. Normalization in this
   * instance refers to formatting of the path in a platform specific
   * way, see Path.normalize for more information.
   */
  readonly normalizedPath: string

  /**
   * The smallest number of characters that we've tried and found
   * to be too wide to fit.
   */
  readonly shortestNonFit?: number

  /**
   * The highest number of characters that we've tried and found
   * to fit inside the available space.
   */
  readonly longestFit: number

  /**
   * The current number of characters that the normalizedPath is to
   * be truncated to.
   */
  readonly length: number
}

/** Helper function to coerce a number into a valid range */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function truncateMid(value: string, length: number) {
  if (value.length <= length) {
    return value
  }

  if (length <= 0) {
    return ''
  }

  if (length === 1) {
    return '…'
  }

  const mid = (length - 1) / 2
  const pre = value.substr(0, Math.floor(mid))
  const post = value.substr(value.length - Math.ceil(mid))

  return `${pre}…${post}`
}

/**
 * String truncation for paths.
 * 
 * This method takes a path and returns it truncated (if necessary)
 * to the exact number of characters specified by the length
 * parameter.
 */
export function truncatePath(path: string, length: number) {

  if (path.length <= length) {
    return path
  }

  if (length <= 0) {
    return ''
  }

  if (length === 1) {
    return '…'
  }

  const lastSeparator = path.lastIndexOf(Path.sep)

  // No directory prefix, fall back to middle ellipsis
  if (lastSeparator === -1) {
    return truncateMid(path, length)
  }

  const filenameLength = path.length - lastSeparator - 1

  // File name prefixed with …/ would be too long, fall back
  // to middle ellipsis.
  if (filenameLength + 2 > length) {
    return truncateMid(path, length)
  }

  const pre = path.substr(0, length - filenameLength - 2)
  const post = path.substr(lastSeparator)

  return `${pre}…${post}`
}

/**
 * A component for displaying a path (rooted or relative) with truncation
 * if necessary.
 * 
 * If the path needs to be truncated this component will set its title element
 * to the full path such that it can be seen by hovering the path text.
 */
export class PathText extends React.PureComponent<IPathTextProps, IPathTextState> {

  private pathElement: HTMLDivElement | null = null
  private pathInnerElement: HTMLSpanElement | null = null

  public constructor(props: IPathTextProps) {
    super(props)
    this.state = this.createState(props.path)
  }

  public componentWillReceiveProps(nextProps: IPathTextProps) {
    if (nextProps.path !== this.props.path) {
      this.setState(this.createState(nextProps.path))
    }
  }

  public componentDidMount() {
    this.resizeIfNeccessary()
  }

  public componentDidUpdate() {
    this.resizeIfNeccessary()
  }

  private createState(path: string): IPathTextState {
    const normalizedPath = Path.normalize(path)
    return {
      iterations: 0,
      normalizedPath,
      length: normalizedPath.length,
      longestFit: 0,
      shortestNonFit: undefined,
      availableWidth: undefined,
      fullTextWidth: undefined,
    }
  }

  private onPathElementRef = (element: HTMLDivElement | undefined) => {
    this.pathElement = element || null
  }

  private onPathInnerElementRef = (element: HTMLSpanElement | undefined) => {
    this.pathInnerElement = element || null
  }

  public render() {
    const path = truncatePath(this.state.normalizedPath, this.state.length)
    const file = Path.basename(path)
    const dirname = Path.dirname(path)
    const directory = dirname === '.' ? '' : `${dirname}${Path.sep}`

    const directoryElement = directory && directory.length
      ? <span className='dirname'>{directory}</span>
      : null

    const truncated = this.state.length < this.state.normalizedPath.length
    const title = truncated ? this.state.normalizedPath : undefined

    return (
      <div className='path-text-component' ref={this.onPathElementRef} title={title}>
        <span ref={this.onPathInnerElementRef}>
          {directoryElement}
          <span className='filename'>{file}</span>
        </span>
      </div>
    )
  }

  private resizeIfNeccessary() {
    if (!this.pathElement || !this.pathInnerElement) {
      return
    }

    const availableWidth = Math.max(
      this.props.availableWidth !== undefined
        ? this.props.availableWidth
        : this.pathElement.getBoundingClientRect().width
      , 0
    )

    // Can we fit the entire, untruncated, path in the available width?
    if (this.state.fullTextWidth !== undefined && this.state.fullTextWidth <= availableWidth) {

      // Are we already doing so?
      if (this.state.length === this.state.normalizedPath.length) {
        // Yeay, happy path, we're already displaying the full path and it
        // fits in our new available width. Nothing left to do.

        console.log('happy path! We show the full path and it still fits')

        if (availableWidth !== this.state.availableWidth) {
          this.setState({ ...this.state, availableWidth })
        }

        return
      } else {
        // We _can_ fit the entire untruncated path inside the available
        // width but we're not doing so right now. Let's make sure we do
        // by keeping all the state properties and updating the availableWidth
        // and setting length to the maximum number of characters available.
        console.log('happy path! We can show the full path, let\'s!')
        this.setState({
          ...this.state,
          availableWidth,
          length: this.state.normalizedPath.length,
        })

        return
      }
    }

    // The available width has changed from underneath us
    if (this.state.availableWidth !== undefined && this.state.availableWidth !== availableWidth) {
      const resetState = this.createState(this.props.path)

      if (availableWidth < this.state.availableWidth) {
        console.log(`${this.state.normalizedPath}: resetting state due to shrinking container`)
        // We've gotten less space to work with so we can keep our shortest non-fit since
        // that's still valid
        this.setState({
          ...resetState,
          fullTextWidth: this.state.fullTextWidth,
          shortestNonFit: this.state.shortestNonFit,
          availableWidth,
        })
      } else if (availableWidth > this.state.availableWidth) {
        console.log(`${this.state.normalizedPath}: resetting state due to growing container`)
        // We've gotten more space to work with so we can keep our longest fit since
        // that's still valid.
        this.setState({
          ...resetState,
          fullTextWidth: this.state.fullTextWidth,
          longestFit: this.state.longestFit,
          availableWidth,
        })
      }

      return
    }

    if (availableWidth === 0) {
      if (this.state.length !== 0) {
        this.setState({
          ...this.createState(this.props.path),
          length: 0,
          availableWidth,
        })
      }
      return
    }

    const actualWidth = this.pathInnerElement.getBoundingClientRect().width

    // Did we just measure the full path? If so let's persist it in state, if
    // not we'll just take what we've got (could be nothing) and persist that
    const fullTextWidth = this.state.length === this.state.normalizedPath.length
      ? actualWidth
      : this.state.fullTextWidth

    // We shouldn't get into this state but if we do, guard against division by zero
    // and use a normal binary search ratio.
    const ratio = actualWidth === 0
      ? 0.5
      : availableWidth / actualWidth

    // It fits!
    if (actualWidth <= availableWidth) {

      // We're done, the entire path fits
      if (this.state.length === this.state.normalizedPath.length) {
        console.log(`${this.state.normalizedPath} fits at ${this.state.length} (all chars)`)
        this.setState({
          ...this.state,
          availableWidth,
          fullTextWidth,
        })
        return
      } else {
        // There might be more space to fill
        const longestFit = this.state.length
        const maxChars = this.state.shortestNonFit || this.state.length
        const minChars = longestFit + 1

        if (minChars === maxChars) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length} (${this.state.normalizedPath.length - this.state.length} cut) ${this.state.iterations} iterations`)
          this.setState({
            ...this.state,
            availableWidth,
            fullTextWidth,
          })
          return
        }

        if (availableWidth - actualWidth < 3) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length}, doubtful that we could fit more (${this.state.normalizedPath.length - this.state.length} cut) ${this.state.iterations} iterations`)
          this.setState({
            ...this.state,
            availableWidth,
            fullTextWidth,
          })
          return
        }

        const length = clamp(Math.floor(this.state.length * ratio), minChars, maxChars)

        console.log(`${this.state.normalizedPath} could potentially fit more, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

        this.setState({
          ...this.state,
          iterations: this.state.iterations + 1,
          length,
          longestFit,
          availableWidth,
          fullTextWidth,
        })
      }
    } else {
      // Okay, so it didn't quite fit, let's trim it down a little
      const shortestNonFit = this.state.length

      const maxChars = shortestNonFit - 1
      const minChars = this.state.longestFit || 0

      const length = clamp(Math.floor(this.state.length * ratio), minChars, maxChars)
      console.log(`${this.state.normalizedPath} overflows at ${shortestNonFit}, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

      this.setState({
        ...this.state,
        iterations: this.state.iterations + 1,
        length,
        shortestNonFit,
        availableWidth,
        fullTextWidth,
      })
    }
  }
}
