import * as React from 'react'
import { IRemote } from '../../models/remote'
import { TextBox } from '../lib/text-box'

interface IRemoteProps {
  readonly remote: IRemote | null
  readonly onRemoteUrlChanged: (url: string) => void
}

export class Remote extends React.Component<IRemoteProps, void> {
  public render() {
    const remote = this.props.remote
    if (!remote) {
      return <div>Nope</div>
    }

    return (
      <div>
        <div>Primary remote repository ({remote.name})</div>
        <TextBox placeholder='Remote URL' value={remote.url} onChange={this.onChange}/>
      </div>
    )
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const url = event.currentTarget.value
    this.props.onRemoteUrlChanged(url)
  }
}
