import * as React from 'react'
import Octicon, * as OcticonSymbol from '@githubprimer/octicons-react'

/** A Loading component. */
export class Loading extends React.Component<{}, {}> {
  public render() {
    return <Octicon className="spin" icon={OcticonSymbol.Sync} />
  }
}
