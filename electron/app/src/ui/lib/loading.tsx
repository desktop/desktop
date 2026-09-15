import * as React from 'react'
import { Octicon, syncClockwise } from '../octicons'

/** A Loading component. */
export class Loading extends React.Component<{}, {}> {
  public render() {
    return <Octicon className="spin" symbol={syncClockwise} />
  }
}
