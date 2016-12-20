import * as React from 'react'
import * as Path from 'path'

interface IPathTextProps {
  readonly path: string,
}

interface IPathTextState {
  readonly iterations: number,
  readonly availableWidth?: number,
  readonly normalizedPath: string,
  readonly shortestNonFit?: number
  readonly longestFit: number
  readonly length: number,
}

export class PathText extends React.Component<IPathTextProps, IPathTextState> {

  private pathElement: HTMLSpanElement | null = null

  public constructor(props: IPathTextProps) {
    super(props)
    this.state = this.createState(props.path)
  }

  public componentWillReceiveProps(nextProps: IPathTextProps) {
    if (nextProps.path !== this.props.path) {
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
    }
  }

  private onPathElementRef = (element: HTMLSpanElement | undefined) => {
    this.pathElement = element || null
  }

  private renderPathComponent(directory: string | null, file: string): JSX.Element {

    const directoryElement = directory && directory.length
      ? <span className='dirname'>{directory}</span>
      : null

    return (
      <div className='path-text-component' ref={this.onPathElementRef}>
        {directoryElement}
        <span className='filename'>{file}</span>
      </div>
    )
  }

  public render() {
    const file = Path.basename(this.state.normalizedPath)
    const dirname = Path.dirname(this.state.normalizedPath)
    const directory = dirname === '.' ? '' : `${dirname}${Path.sep}`

    const normalizedPath = directory + file

    if (normalizedPath.length <= this.state.length) {
      return this.renderPathComponent(directory, file)
    }

    // hello
    // 5
    // …ello

    // if (file.length <= this.state.maxLength) {
    //   return this.renderPathComponent(null, file.substr(0, this.state.maxLength))
    // }

    return this.renderPathComponent(null, normalizedPath.substr(0, this.state.length))
  }

  private resizeIfNeccessary() {
    if (!this.pathElement) {
      return
    }

    const actualWidth = this.pathElement.scrollWidth
    const availableWidth = this.pathElement.offsetWidth

    // The available width has changed from underneath us
    if (this.state.availableWidth && this.state.availableWidth !== availableWidth) {
      const resetState = this.createState(this.props.path)

      if (availableWidth < this.state.availableWidth) {
        // We've gotten less space to work with so we can keep our shortest non-fit since
        // that's still valid
        this.setState({ ...resetState, shortestNonFit: this.state.shortestNonFit })
      } else if (availableWidth > this.state.availableWidth) {
        // We've gotten more space to work with so we can keep our longest fit since
        // that's still valid.
        this.setState({ ...resetState, longestFit: this.state.longestFit })
      }

      return
    }

    // const ratio = availableWidth / actualWidth
    const ratio = 0.5

    console.log(actualWidth, availableWidth, ratio)

    // It fits!
    if (actualWidth <= availableWidth) {

      // We're done, the entire path fits
      if (this.state.length === this.state.normalizedPath.length) {
        console.log(`${this.state.normalizedPath} fits at ${this.state.length} (all chars)`)
        return
      } else {
        // There might be more space to fill
        // TODO!
        const longestFit = this.state.length // 21
        const maxChars = this.state.shortestNonFit || this.state.length // 29
        const minChars = longestFit + 1 // 22

        if (minChars === maxChars) {
          console.log(`${this.state.normalizedPath} fits at ${this.state.length} (${this.state.normalizedPath.length - this.state.length} cut) ${this.state.iterations} iterations`)
          return
        }

        const length = Math.floor((maxChars - minChars) * ratio) + minChars

        console.log(`${this.state.normalizedPath} could potentially fit more, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

        setTimeout(() => {
          this.setState({ ...this.state, iterations: this.state.iterations + 1, length, longestFit, availableWidth })
        }, 1000)
      }
    } else {
      // Okay, so it didn't quite fit, let's trim it down a little
      const shortestNonFit = this.state.length // 44

      // ratio = 0.46

      const maxChars = shortestNonFit - 1 // 43
      const minChars = this.state.longestFit || 0 // 46

      const length = Math.floor((maxChars - minChars) * ratio) + minChars
      console.log(`${this.state.normalizedPath} overflows at ${shortestNonFit}, ratio: ${ratio}, currentLength: ${this.state.length}, newLength: ${length}, maxChars: ${maxChars}, minChars: ${minChars}`)

      setTimeout(() => {
        this.setState({ ...this.state, iterations: this.state.iterations + 1, length, shortestNonFit, availableWidth })
      }, 1000)
    }
  }

  public shouldComponentUpdate(nextProps: IPathTextProps, nextState: IPathTextState) {
    if (nextProps.path !== this.props.path) {
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
