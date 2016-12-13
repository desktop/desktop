import * as React from 'react'

interface ISubmoduleDiffProps {
}

/** A component to render when a new image has been added to the repository */
export class SubmoduleDiff extends React.Component<ISubmoduleDiffProps, void> {

  public render() {
    return <div className='panel' id='diff'>
      Submodule goes here
    </div>
  }
}
