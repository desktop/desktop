import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { IRemote } from '../../models/remote'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'

interface IRemoteProps {
  readonly dispatcher: Dispatcher

  readonly remote: IRemote | null
}

interface IRemoteState {
  readonly url: string
}

export class Remote extends React.Component<IRemoteProps, IRemoteState> {
  public constructor(props: IRemoteProps) {
    super(props)

    const url = props.remote ? props.remote.url : ''
    this.state = { url }
  }

  public render() {
    const remote = this.props.remote
    if (!remote) {
      return <div>Nope</div>
    }

    return (
      <Form>
        <div>Primary remote repository ({remote.name})</div>
        <TextBox placeholder='Remote URL' value={this.state.url}/>

        <hr/>

        <Button type='submit'>Save</Button>
        <Button onClick={this.cancel}>Cancel</Button>
      </Form>
    )
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }
}
