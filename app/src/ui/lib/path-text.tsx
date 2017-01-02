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

interface IPathDisplayState {
  /**
   * The normalized version of the path prop. Normalization in this
   * instance refers to formatting of the path in a platform specific
   * way, see Path.normalize for more information.
   */
  readonly normalizedPath: string

  readonly directoryText: string,
  readonly fileText: string

  /**
   * The current number of characters that the normalizedPath is to
   * be truncated to.
   */
  readonly length: number
}

interface IPathTextState extends IPathDisplayState {
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
   * The smallest number of characters that we've tried and found
   * to be too wide to fit.
   */
  readonly shortestNonFit?: number

  /**
   * The highest number of characters that we've tried and found
   * to fit inside the available space.
   */
  readonly longestFit: number
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

function createPathDisplayState(normalizedPath: string, length?: number): IPathDisplayState {
  length = length === undefined ? normalizedPath.length : length

  if (length <= 0) {
    return { normalizedPath, directoryText: '', fileText: '', length }
  }

  const lastSeparator = normalizedPath.lastIndexOf(Path.sep)

  const truncatedPath = truncatePath(normalizedPath, length)
  let directoryLength = 0

  // Figure out the longest shared substring between the normalized
  // path and the truncated path up until the last separator. In other
  // words, try to figure out how much of the directory prefix was
  // kept before the ellipsis. This allows us to color the directory
  // part more accurately than if we did a Path.dirname on the truncated
  // path.
  for (let i = 0; i < lastSeparator && i < truncatedPath.length; i++) {
    if (normalizedPath[i] === truncatedPath[i]) {
      directoryLength++
    } else {
      // We've run out of matching characters but if the truncated path
      // has an ellipsis right where our comparison ended we'll include
      // that as well. This is simply an aesthetic choice between coloring
      // the ellipsis as a path prefix or as a file name.
      if (truncatedPath[i] === '…') {
        directoryLength++
      }
      break
    }
  }

  const fileText = truncatedPath.substr(directoryLength)
  const directoryText = truncatedPath.substr(0, directoryLength)

  return { normalizedPath, directoryText, fileText, length }
}

function createState(path: string, length?: number): IPathTextState {
  const normalizedPath = Path.normalize(path)
  return {
    normalizedPath,
    longestFit: 0,
    shortestNonFit: undefined,
    availableWidth: undefined,
    fullTextWidth: undefined,
    ...createPathDisplayState(normalizedPath, length),
  }
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
    this.state = createState(props.path)
  }

  public componentWillReceiveProps(nextProps: IPathTextProps) {
    if (nextProps.path !== this.props.path) {
      this.setState(createState(nextProps.path))
    }
  }

  public componentDidMount() {
    this.resizeIfNeccessary()
  }

  public componentDidUpdate() {
    this.resizeIfNeccessary()
  }

  private onPathElementRef = (element: HTMLDivElement | undefined) => {
    this.pathElement = element || null
  }

  private onPathInnerElementRef = (element: HTMLSpanElement | undefined) => {
    this.pathInnerElement = element || null
  }

  public render() {

    const directoryElement = this.state.directoryText && this.state.directoryText.length
      ? <span className='dirname'>{this.state.directoryText}</span>
      : null

    const truncated = this.state.length < this.state.normalizedPath.length
    const title = truncated ? this.state.normalizedPath : undefined

    return (
      <div className='path-text-component' ref={this.onPathElementRef} title={title}>
        <span ref={this.onPathInnerElementRef}>
          {directoryElement}
          <span className='filename'>{this.state.fileText}</span>
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
          ...createPathDisplayState(this.state.normalizedPath),
          availableWidth,
        })

        return
      }
    }

    // The available width has changed from underneath us
    if (this.state.availableWidth !== undefined && this.state.availableWidth !== availableWidth) {
      // Keep the current length as that's likely a good starting point
      const resetState = createState(this.props.path, this.state.length)

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
        console.log(`${this.state.normalizedPath}: no available width`)
        this.setState({
          ...this.state,
          ...createPathDisplayState(this.state.normalizedPath, 0),
          availableWidth,
          longestFit: 0,
          shortestNonFit: 1,
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
        const maxChars = this.state.shortestNonFit !== undefined
          ? this.state.shortestNonFit - 1
          : this.state.normalizedPath.length

        const minChars = longestFit + 1

        if (minChars >= maxChars) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length} (${this.state.normalizedPath.length - this.state.length} cut)`)
          this.setState({ ...this.state, longestFit, availableWidth, fullTextWidth })
          return
        }

        if (availableWidth - actualWidth < 3) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length}, doubtful that we could fit more (${this.state.normalizedPath.length - this.state.length} cut)`)
          this.setState({ ...this.state, longestFit, availableWidth, fullTextWidth })
          return
        }

        const length = clamp(Math.floor(this.state.length * ratio), minChars, maxChars)

        console.log(`${this.state.normalizedPath} could potentially fit more, shortestNonFit: ${this.state.shortestNonFit}, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

        this.setState({
          ...this.state,
          ...createPathDisplayState(this.state.normalizedPath, length),
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
      console.log(`${this.state.normalizedPath} overflows at ${availableWidth}, shortestNonFit: ${shortestNonFit}, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

      this.setState({
        ...this.state,
        ...createPathDisplayState(this.state.normalizedPath, length),
        shortestNonFit,
        availableWidth,
        fullTextWidth,
      })
    }
  }
}
