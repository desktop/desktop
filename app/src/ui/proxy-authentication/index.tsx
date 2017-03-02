import * as React from 'react'
import { ipcRenderer } from 'electron'
import { AuthInfo } from '../../lib/proxy'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogFooter } from '../dialog'

interface IProxyAuthenticationProps {
  readonly onDismissed: () => void
  readonly authInfo: AuthInfo
}

interface IProxyAuthenticationState {
  readonly username: string
  readonly password: string
  readonly disabled: boolean
  readonly errors?: ReadonlyArray<JSX.Element | string>
}

export class ProxyAuthentication extends React.Component<IProxyAuthenticationProps, IProxyAuthenticationState> {

  public constructor(props: IProxyAuthenticationProps) {
    super(props)

    this.state = {
      username: '',
      password: '',
      disabled: false,
    }
  }

  private onDismissed() {
    // return an empty result to indicate the user has bypassed this
    ipcRenderer.send('proxy/credentials-response', { })

    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id='proxy-authentication'
        title={__DARWIN__ ? 'Proxy Authentication' : 'Proxy authentication'}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.disabled}
      >
        <div>TODO</div>

        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Save</Button>
            <Button onClick={this.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    if (this.props.authInfo.realm === 'FiddlerProxy (user: 1, pass: 1)') {
      ipcRenderer.send('proxy/credentials-response', { username: '1', password: '1' })
    }

    this.props.onDismissed()
  }
}
