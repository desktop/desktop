import * as React from 'react'
import ChangesList from './changes-list'
import FileDiff from '../file-diff'

export default class Changes extends React.Component<void, void> {
  public render() {
    return (
      <div id='changes'>
        <ChangesList/>
        <FileDiff/>
      </div>
    )
  }
}
