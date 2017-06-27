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

  private onNameChanged = (text: string) => {
    this.props.onNameChanged(text)
  }

  private onEmailChanged = (text: string) => {
    this.props.onEmailChanged(text)
  }

  public render() {
    return (
      <DialogContent>
        <Row>
          <TextBox
            label='Name'
            value={this.props.name}
            onValueChanged={this.onNameChanged}
            autoFocus
          />
        </Row>
        <Row>
          <TextBox
            label='Email'
            value={this.props.email}
            onValueChanged={this.onEmailChanged}
          />
        </Row>
      </DialogContent>
    )
  }
}
