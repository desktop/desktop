import * as React from 'react'
import { DialogContent } from '../dialog'
import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'

import { Form } from '../lib/form'
import { TextArea } from '../lib/text-area'
import { Button } from '../lib/button'


interface IGitIgnoreProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly text: string | null
}

interface IGitIgnoreState {
  readonly text: string
}

/** A view for creating or modifying the repository's gitignore file */
export class GitIgnore extends React.Component<IGitIgnoreProps, IGitIgnoreState> {

  public constructor(props: IGitIgnoreProps) {
    super(props)

    const text = this.props.text || ''
    this.state = { text }
  }

  public render() {

    const existing = this.props.text
    const current = this.state.text
    // disable the submit button if the gitignore text isn't changed
    const disabled = existing !== null && current === existing

    return (
      <Form>
        <div>Ignored files (.gitignore)</div>
        <TextArea
          placeholder='Ignored files'
          value={this.state.text}
          onChange={this.onChange}
          rows={6} />

        <hr/>

        <Button type='submit' onClick={this.save} disabled={disabled}>Save</Button>
        <Button onClick={this.close}>Cancel</Button>
      </Form>
    )
  }

  private close = () => {
    this.props.dispatcher.closePopup()
  }

  private onChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    const text = event.currentTarget.value
    this.setState({ text })
  }

  private save = () => {
    this.props.dispatcher.setGitIgnoreText(this.props.repository, this.state.text)
    this.close()
  }
}
