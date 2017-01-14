import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { IRemote } from '../../models/remote'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Repository } from '../../models/repository'

interface IRemoteProps {
  readonly dispatcher: Dispatcher

  readonly remote: IRemote | null

  readonly repository: Repository
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
      <Form onSubmit={this.save}>
        <div>Primary remote repository ({remote.name})</div>
        <TextBox placeholder='Remote URL' value={this.state.url} onChange={this.onChange}/>

        <hr/>

        <Button type='submit'>Save</Button>
        <Button onClick={this.close}>Cancel</Button>
      </Form>
    )
  }

  private close = () => {
    this.props.dispatcher.closePopup()
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const url = event.currentTarget.value
    this.setState({ url })
  }

  private save = () => {
    const remote = this.props.remote
    if (!remote) { return }

    this.props.dispatcher.setRemoteURL(this.props.repository, remote.name, this.state.url)
    this.close()
  }
}
