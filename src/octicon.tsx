import * as React from 'react'

interface OcticonProps {
  width?: number,
  height?: number,
  symbol: string
}

export default class Octicon extends React.Component<OcticonProps, void> {

  public static defaultProps: OcticonProps = { width: 16, height: 16, symbol: "" };

  public constructor(props: OcticonProps) {
    super(props)
  }

  public render() {
    return (
      <svg aria-hidden="true" class="octicon" width="12" height="16" role="img" version="1.1" viewBox="0 0 12 16">
        <path d="M12 9H7v5H5V9H0V7h5V2h2v5h5v2z"></path>
      </svg>
    )
  }
}
