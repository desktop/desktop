import * as React from 'react'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { DialogContent } from '../dialog'

interface IGitProps {
  readonly name: string
  readonly email: string

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
}

export class Git extends React.Component<IGitProps, void> {

  private onNameChanged = (e: React.FormEvent<HTMLInputElement>) => {
    this.props.onNameChanged(e.currentTarget.value)
  }

  private onEmailChanged = (e: React.FormEvent<HTMLInputElement>) => {
    this.props.onEmailChanged(e.currentTarget.value)
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label='Name'
            value={this.props.name}
            onChange={this.onNameChanged}
            autoFocus
          />
        </Row>
        <Row>
          <TextBox
            label='Email'
            value={this.props.email}
            onChange={this.onEmailChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
