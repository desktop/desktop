import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

/** A Loading component. */
export class Loading extends React.Component<{}, {}> {
  public render() {
    return <Octicon className="spin" symbol={OcticonSymbol.sync} />
  }
}
