import * as React from 'react'
import * as Path from 'path'

interface IPathTextProps {
  readonly path: string,
}

export class PathText extends React.Component<IPathTextProps, void> {

  private pathElement: HTMLSpanElement | null = null

  private onPathElementRef = (element: HTMLSpanElement | undefined) => {
    this.pathElement = element || null
  }

  private renderPathComponent(directory: string, file: string): JSX.Element {
    return (
      <div className='path-text-component' ref={this.onPathElementRef}>
        <span className='dirname'>{directory}</span>
        <span className='filename'>{file}</span>
      </div>
    )
  }

  public render() {
    const file = Path.basename(this.props.path)
    const dirname = Path.dirname(this.props.path)
    const directory = Path.normalize(dirname === '.' ? '' : `${dirname}/`)

    return this.renderPathComponent(directory, file)
  }
}
