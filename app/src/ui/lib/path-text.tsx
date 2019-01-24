import * as React from 'react'
import * as Path from 'path'
import { clamp } from '../../lib/clamp'

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

  readonly directoryText: string
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

/**
 * Truncates the given string to the number of characters given by
 * the length parameter. The value is truncated (if necessary) by
 * removing characters from the middle of the string and inserting
 * an ellipsis in their place until the value fits within the alloted
 * number of characters.
 */
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
 * Extract the filename and directory from a given normalized path
 *
 * @param normalizedPath The normalized path (i.e. no '.' or '..' characters in path)
 */
export function extract(
  normalizedPath: string
): { normalizedFileName: string; normalizedDirectory: string } {
  // for untracked submodules, the status entry is returned as a directory,
  // with a trailing / which causes the directory to be trimmed in a weird way
  // below. let's try and resolve this here
  normalizedPath = normalizedPath.endsWith('/')
    ? normalizedPath.substr(0, normalizedPath.length - 1)
    : normalizedPath

  const normalizedFileName = Path.basename(normalizedPath)
  const normalizedDirectory = normalizedPath.substr(
    0,
    normalizedPath.length - normalizedFileName.length
  )

  return { normalizedFileName, normalizedDirectory }
}

function createPathDisplayState(
  normalizedPath: string,
  length?: number
): IPathDisplayState {
  length = length === undefined ? normalizedPath.length : length

  if (length <= 0) {
    return { normalizedPath, directoryText: '', fileText: '', length }
  }

  const { normalizedFileName, normalizedDirectory } = extract(normalizedPath)

  // Happy path when it already fits, we already know the length of the directory
  if (length >= normalizedPath.length) {
    return {
      normalizedPath,
      directoryText: normalizedDirectory,
      fileText: normalizedFileName,
      length,
    }
  }

  const truncatedPath = truncatePath(normalizedPath, length)
  let directoryLength = 0

  // Attempt to determine how much of the truncated path is the directory prefix
  // vs the filename (basename). It does so by comparing each character in the
  // normalized directory prefix to the truncated path, as long as it's a match
  // we know that it's a directory name.
  for (
    let i = 0;
    i < truncatedPath.length && i < normalizedDirectory.length;
    i++
  ) {
    const normalizedChar = normalizedDirectory[i]
    const truncatedChar = truncatedPath[i]

    if (normalizedChar === truncatedChar) {
      directoryLength++
    } else {
      // We're no longer matching the directory prefix but if the following
      // characters is '…' or '…/' we'll count those towards the directory
      // as well, this is purely an aesthetic choice.
      if (truncatedChar === '…') {
        directoryLength++
        const nextTruncatedIx = i + 1

        // Do we have one more character to read? Is is a path separator?
        if (truncatedPath.length > nextTruncatedIx) {
          if (truncatedPath[nextTruncatedIx] === Path.sep) {
            directoryLength++
          }
        }
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
export class PathText extends React.PureComponent<
  IPathTextProps,
  IPathTextState
> {
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
    this.resizeIfNecessary()
  }

  public componentDidUpdate() {
    this.resizeIfNecessary()
  }

  private onPathElementRef = (element: HTMLDivElement | null) => {
    this.pathElement = element
  }

  private onPathInnerElementRef = (element: HTMLSpanElement | null) => {
    this.pathInnerElement = element
  }

  public render() {
    const directoryElement =
      this.state.directoryText && this.state.directoryText.length ? (
        <span className="dirname">{this.state.directoryText}</span>
      ) : null

    const truncated = this.state.length < this.state.normalizedPath.length
    const title = truncated ? this.state.normalizedPath : undefined

    return (
      <div
        className="path-text-component"
        ref={this.onPathElementRef}
        title={title}
      >
        <span ref={this.onPathInnerElementRef}>
          {directoryElement}
          <span className="filename">{this.state.fileText}</span>
        </span>
      </div>
    )
  }

  private resizeIfNecessary() {
    if (!this.pathElement || !this.pathInnerElement) {
      return
    }

    const computedAvailableWidth =
      this.props.availableWidth !== undefined
        ? this.props.availableWidth
        : this.pathElement.getBoundingClientRect().width

    const availableWidth = Math.max(computedAvailableWidth, 0)

    // Can we fit the entire path in the available width?
    if (
      this.state.fullTextWidth !== undefined &&
      this.state.fullTextWidth <= availableWidth
    ) {
      // Are we already doing so?
      if (this.state.length === this.state.normalizedPath.length) {
        // Yeay, happy path, we're already displaying the full path and it
        // fits in our new available width. Nothing left to do.
        //
        // This conditional update isn't strictly necessary but it'll save
        // us one round of comparisons in the PureComponent shallowCompare
        if (availableWidth !== this.state.availableWidth) {
          this.setState({ availableWidth })
        }

        return
      } else {
        // We _can_ fit the entire path inside the available width but we're
        // not doing so right now. Let's make sure we do by keeping all the
        // state properties and updating the availableWidth and setting length
        // to the maximum number of characters available.
        this.setState(prevState => ({
          ...createPathDisplayState(prevState.normalizedPath),
          availableWidth,
        }))

        return
      }
    }

    // The available width has changed from underneath us
    if (
      this.state.availableWidth !== undefined &&
      this.state.availableWidth !== availableWidth
    ) {
      // Keep the current length as that's likely a good starting point
      const resetState = createState(this.props.path, this.state.length)

      if (availableWidth < this.state.availableWidth) {
        // We've gotten less space to work with so we can keep our shortest non-fit since
        // that's still valid
        this.setState(prevState => ({
          ...resetState,
          fullTextWidth: prevState.fullTextWidth,
          shortestNonFit: prevState.shortestNonFit,
          availableWidth,
        }))
      } else if (availableWidth > this.state.availableWidth) {
        // We've gotten more space to work with so we can keep our longest fit since
        // that's still valid.
        this.setState(prevState => ({
          ...resetState,
          fullTextWidth: prevState.fullTextWidth,
          longestFit: prevState.longestFit,
          availableWidth,
        }))
      }

      return
    }

    // Optimization, if we know that we can't fit anything we can avoid a reflow
    // by not measuring the actual width.
    if (availableWidth === 0) {
      if (this.state.length !== 0) {
        this.setState(prevState => ({
          ...prevState,
          ...createPathDisplayState(prevState.normalizedPath, 0),
          availableWidth,
          longestFit: 0,
          shortestNonFit: 1,
        }))
      }
      return
    }

    const actualWidth = this.pathInnerElement.getBoundingClientRect().width

    // Did we just measure the full path? If so let's persist it in state, if
    // not we'll just take what we've got (could be nothing) and persist that
    const fullTextWidth =
      this.state.length === this.state.normalizedPath.length
        ? actualWidth
        : this.state.fullTextWidth

    // We shouldn't get into this state but if we do, guard against division by zero
    // and use a normal binary search ratio.
    const ratio = actualWidth === 0 ? 0.5 : availableWidth / actualWidth

    // It fits!
    if (actualWidth <= availableWidth) {
      // We're done, the entire path fits
      if (this.state.length === this.state.normalizedPath.length) {
        this.setState({ availableWidth, fullTextWidth })
        return
      } else {
        // There might be more space to fill
        const longestFit = this.state.length
        const maxChars =
          this.state.shortestNonFit !== undefined
            ? this.state.shortestNonFit - 1
            : this.state.normalizedPath.length

        const minChars = longestFit + 1

        // We've run out of options, it fits here but we can't grow any further, i.e
        // we're done.
        if (minChars >= maxChars) {
          this.setState({
            longestFit,
            availableWidth,
            fullTextWidth,
          })
          return
        }

        // Optimization, if our available space for growth is less than 3px it's unlikely
        // that we'll be able to fit any more characters in here. Note that this is very
        // much an optimization for our specific styles and it also assumes that the
        // directory and file name spans are styled similarly. Another approach could be
        // to calculated the average width of a character when we're measuring the full
        // width and use that instead but this works pretty well for now and lets us
        // avoid one more measure phase.
        if (availableWidth - actualWidth < 3) {
          this.setState({
            longestFit,
            availableWidth,
            fullTextWidth,
          })
          return
        }

        const length = clamp(
          Math.floor(this.state.length * ratio),
          minChars,
          maxChars
        )

        // We could potentially fit more characters, there's room to try so we'll go for it
        this.setState(prevState => ({
          ...createPathDisplayState(prevState.normalizedPath, length),
          longestFit,
          availableWidth,
          fullTextWidth,
        }))
      }
    } else {
      // Okay, so it didn't quite fit, let's trim it down a little
      const shortestNonFit = this.state.length

      const maxChars = shortestNonFit - 1
      const minChars = this.state.longestFit || 0

      const length = clamp(
        Math.floor(this.state.length * ratio),
        minChars,
        maxChars
      )

      this.setState(prevState => ({
        ...createPathDisplayState(prevState.normalizedPath, length),
        shortestNonFit,
        availableWidth,
        fullTextWidth,
      }))
    }
  }
}
