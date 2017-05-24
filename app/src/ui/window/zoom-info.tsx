import * as React from 'react'

interface IZoomInfoProps {
  readonly windowZoomFactor: number
}

export class ZoomInfo extends React.Component<IZoomInfoProps, void> {
  public render() {
    return <div id='window-zoom-info'>{this.props.windowZoomFactor}</div>
  }
}
