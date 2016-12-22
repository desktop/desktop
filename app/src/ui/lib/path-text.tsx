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

  // const lastSeparator = path.lastIndexOf(Path.sep)
  // const ellipsis = '…'

  // if (lastSeparator === -1) {
    const mid = (length - 1) / 2
    const pre = path.substr(0, Math.floor(mid))
    const post = path.substr(path.length - Math.ceil(mid))

    return `${pre}…${post}`
  // }

  // const basenameLength = lastSeparator + 1


  // return path.substr(0, length)
}

/**
 * A component for displaying a path (rooted or relative) with truncation
 * if necessary.
 * 
 * If the path needs to be truncated this component will 
 */
export class PathText extends React.Component<IPathTextProps, IPathTextState> {

  private pathElement: HTMLDivElement | null = null
  private pathInnerElement: HTMLSpanElement | null = null

  public constructor(props: IPathTextProps) {
    super(props)
    this.state = this.createState(props.path)
  }

  public componentWillReceiveProps(nextProps: IPathTextProps) {
    if (nextProps.path !== this.props.path || nextProps.availableWidth !== this.props.availableWidth) {
      this.setState(this.createState(nextProps.path))
    }
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

    const availableWidth = this.props.availableWidth !== undefined
      ? this.props.availableWidth
      : this.pathElement.getBoundingClientRect().width

    // The available width has changed from underneath us
    if (this.state.availableWidth && this.state.availableWidth !== availableWidth) {
      const resetState = this.createState(this.props.path)

      if (availableWidth < this.state.availableWidth) {
        console.log(`${this.state.normalizedPath}: resetting state due to shrinking container`)
        // We've gotten less space to work with so we can keep our shortest non-fit since
        // that's still valid
        this.setState({ ...resetState, shortestNonFit: this.state.shortestNonFit })
      } else if (availableWidth > this.state.availableWidth) {
        console.log(`${this.state.normalizedPath}: resetting state due to growing container`)
        // We've gotten more space to work with so we can keep our longest fit since
        // that's still valid.
        this.setState({ ...resetState, longestFit: this.state.longestFit })
      }

      return
    }

    const actualWidth = this.pathInnerElement.getBoundingClientRect().width
    const ratio = availableWidth / actualWidth
    //const ratio = 0.5

    console.log(this.state.normalizedPath, actualWidth, availableWidth, ratio)

    // It fits!
    if (actualWidth <= availableWidth) {

      // We're done, the entire path fits
      if (this.state.length === this.state.normalizedPath.length) {
        console.log(`${this.state.normalizedPath} fits at ${this.state.length} (all chars)`)
        return
      } else {
        // There might be more space to fill
        // TODO!
        const longestFit = this.state.length
        const maxChars = this.state.shortestNonFit || this.state.length
        const minChars = longestFit + 1

        if (minChars === maxChars) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length} (${this.state.normalizedPath.length - this.state.length} cut) ${this.state.iterations} iterations`)
          return
        }

        if (availableWidth - actualWidth < 3) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length}, doubtful that we could fit more (${this.state.normalizedPath.length - this.state.length} cut) ${this.state.iterations} iterations`)
          return
        }

        const length = clamp(Math.floor(this.state.length * ratio), minChars, maxChars)

        console.log(`${this.state.normalizedPath} could potentially fit more, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

        this.setState({ ...this.state, iterations: this.state.iterations + 1, length, longestFit, availableWidth })
      }
    } else {
      // Okay, so it didn't quite fit, let's trim it down a little
      const shortestNonFit = this.state.length

      const maxChars = shortestNonFit - 1
      const minChars = this.state.longestFit || 0

      const length = clamp(Math.floor(this.state.length * ratio), minChars, maxChars)
      console.log(`${this.state.normalizedPath} overflows at ${shortestNonFit}, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

      this.setState({ ...this.state, iterations: this.state.iterations + 1, length, shortestNonFit, availableWidth })
    }
  }

  public shouldComponentUpdate(nextProps: IPathTextProps, nextState: IPathTextState) {
    if (nextProps.path !== this.props.path) {
      return true
    }

    if (nextProps.availableWidth !== this.props.availableWidth) {
      return true
    }

    if (nextState.length !== this.state.length) {
      return true
    }

    if (nextState.longestFit !== this.state.longestFit) {
      return true
    }

    if (nextState.shortestNonFit !== this.state.shortestNonFit) {
      return true
    }

    if (nextState.availableWidth !== this.state.availableWidth) {
      return true
    }

    return false
  }

  public componentDidMount() {
    this.resizeIfNeccessary()
  }

  public componentDidUpdate() {
    this.resizeIfNeccessary()
  }
}
