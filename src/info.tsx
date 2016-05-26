import * as React from 'react'
import {ipcRenderer} from 'electron'

const LOLZ = [
  'http://www.reactiongifs.com/r/drkrm.gif',
  'http://www.reactiongifs.com/r/wvy1.gif',
  'http://www.reactiongifs.com/r/ihniwid.gif',
  'http://www.reactiongifs.com/r/dTa.gif',
  'http://www.reactiongifs.com/r/didit.gif'
]

type InfoProps = {
  selectedRow: number
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

export default class Info extends React.Component<InfoProps, void> {
  private renderNoSelection() {
    return (
      <div>
        <div>No row selected!</div>
        <div>Maybe you'd like to authenticate for fun and Great Victory?</div>
        <button onClick={() => this.authenticate()}>Yes pls</button>
      </div>
    )
  }

  private authenticate() {
    ipcRenderer.send('request-auth')
  }

  public render() {
    const row = this.props.selectedRow
    if (row < 0) {
      return this.renderNoSelection()
    }

    const img = LOLZ[row % LOLZ.length]
    return (
      <div style={ContainerStyle}>
        Row {row + 1} is selected!

        <div style={ImageStyle}>
          <img src={img}/>
        </div>
      </div>
    )
  }
}
