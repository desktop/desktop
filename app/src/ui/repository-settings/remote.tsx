import * as React from 'react'
import { IRemote } from '../../models/remote'
import { TextBox } from '../lib/text-box'
import { DialogContent } from '../dialog'

interface IRemoteProps {
  /** The remote being shown. */
  readonly remote: IRemote

  /** The function to call when the remote URL is changed by the user. */
  readonly onRemoteUrlChanged: (url: string) => void
}

/** The Remote component. */
export class Remote extends React.Component<IRemoteProps, void> {
  public render() {
    const remote = this.props.remote
    return (
      <DialogContent>
        <div>Primary remote repository ({remote.name})</div>
        <TextBox placeholder='Remote URL' value={remote.url} onChange={this.onChange}/>
      </DialogContent>
    )
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const url = event.currentTarget.value
    this.props.onRemoteUrlChanged(url)
  }
}
