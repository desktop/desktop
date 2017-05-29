import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

/** A Loading component. */
export class Loading extends React.Component<{}, void> {
  public render() {
    return <Octicon className='spin' symbol={OcticonSymbol.sync}/>
  }
}
