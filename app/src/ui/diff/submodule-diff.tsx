import React from 'react'
import { ISubmoduleDiff } from '../../models/diff'

interface ISubmoduleDiffProps {
  readonly diff: ISubmoduleDiff
}

export class SubmoduleDiff extends React.Component<ISubmoduleDiffProps> {
  public constructor(props: ISubmoduleDiffProps) {
    super(props)
  }

  public render() {
    return (
      <div>
        <h1>Submodule changes</h1>
      </div>
    )
  }
}
