import { remote } from 'electron'
import * as URL from 'url'
import * as React from 'react'
import { Form } from '../lib/form'
import { TextBox } from '../lib/text-box'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { getDefaultDir } from '../lib/default-dir'
import { Row } from '../lib/row'

interface ICloneRepositoryProps {
  readonly dispatcher: Dispatcher
}

interface ICloneRepositoryState {
  readonly url: string

  readonly path: string
}

/** The component for cloning a repository. */
export class CloneRepository extends React.Component<ICloneRepositoryProps, ICloneRepositoryState> {
  public constructor(props: ICloneRepositoryProps) {
    super(props)

    this.state = {
      url: '',
      path: getDefaultDir(),
    }
  }

  public render() {
    const disabled = this.state.url.length === 0 || this.state.path.length === 0
    return (
      <Form className='clone-repository' onSubmit={this.clone}>
        <div>Enter a repository URL or GitHub username and repository (e.g., <pre>hubot/cool-repo</pre>)</div>

        <TextBox placeholder='URL or username/repository' value={this.state.url} onChange={this.onURLChanged}/>

        <Row>
          <TextBox
            value={this.state.path}
            label='Local Path'
            placeholder='repository path'
            onChange={this.onPathChanged}/>
          <Button onClick={this.showFilePicker}>Choose…</Button>
        </Row>

        <Button disabled={disabled} type='submit'>Clone</Button>
      </Form>
    )
  }

  private showFilePicker = () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: [ 'createDirectory', 'openDirectory' ],
    })
    if (!directory) { return }

    const path = directory[0]
    this.setState({ ...this.state, path })
  }

  private onURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const url = event.currentTarget.value
    this.setState({ ...this.state, url })
  }

  private onPathChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const path = event.currentTarget.value
    this.setState({ ...this.state, path })
  }

  private clone = () => {
    const url = this.state.url
    const parsed = URL.parse(url)
    // If we can parse a hostname, we'll assume they gave us a proper URL. If
    // not, we'll treat it as a GitHub repository owner/repository shortcut.
    if (parsed.hostname) {
      this.props.dispatcher.clone(url, this.state.path, null)
    } else {
      this.props.dispatcher.clone(url, this.state.path, null)
    }
  }
}
