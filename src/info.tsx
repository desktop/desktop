import * as React from 'react'

import User from './user'
import Octicon from './octicon'

const Octokat = require('octokat')

const LOLZ = [
  'http://www.reactiongifs.com/r/drkrm.gif',
  'http://www.reactiongifs.com/r/wvy1.gif',
  'http://www.reactiongifs.com/r/ihniwid.gif',
  'http://www.reactiongifs.com/r/dTa.gif',
  'http://www.reactiongifs.com/r/didit.gif'
]

interface InfoProps {
  selectedRow: number,
  user: User
}

interface InfoState {
  userAvatarURL: string
}

const ContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1
}

const ImageStyle = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  flex: 1
}

const AvatarStyle = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  paddingRight: 4
}

export default class Info extends React.Component<InfoProps, InfoState> {
  public constructor() {
    super()

    this.state = {userAvatarURL: ''}
  }

  public async componentWillMount() {
    if (!this.props.user) {
      return Promise.resolve()
    }

    const api = new Octokat({token: this.props.user.getToken()})
    const user = await api.user.fetch()
    this.setState({userAvatarURL: user.avatarUrl})
    console.log('user', user)
    return Promise.resolve()
  }

  private renderNoSelection() {
    return (
      <div>
        <div>No row selected!</div>
      </div>
    )
  }

  private renderUser() {
    return (
      <div>
        <img style={AvatarStyle} src={this.state.userAvatarURL}/>
      </div>
    )
  }

  public render() {
    const row = this.props.selectedRow
    if (row < 0) {
      return this.renderNoSelection()
    }

    const img = LOLZ[row % LOLZ.length]
    return (
      <div style={ContainerStyle}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center'
        }}>
          {this.renderUser()}
          <div>Row {row + 1} is selected!</div>
        </div>

        <div style={ImageStyle}>
          <img src={img}/>
        </div>

        <Octicon symbol="x" />
      </div>
    )
  }
}
