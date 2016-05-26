import * as React from 'react'
import {ipcRenderer} from 'electron'
import ThingList from './thing-list'
import Info from './info'

import {getToken} from './main-process/auth'

const Octokat = require('octokat')

type AppState = {
  selectedRow: number
}

type AppProps = {
  style?: Object
}

const AppStyle = {
  display: 'flex',
  flexDirection: 'row',
  flexGrow: 1
}

export default class App extends React.Component<AppProps, AppState> {
  private octo: any

  public constructor(props: AppProps) {
    super(props)

    this.octo = new Octokat({
      token: process.env.GITHUB_ACCESS_TOKEN
    })

    this.state = {selectedRow: -1}
  }

  public async componentDidMount() {
    const zen = await this.octo.zen.read()
    console.log('zen', zen)

    ipcRenderer.on('did-auth', () => this.didAuthenticate())
  }

  public componentWillUnmount() {
    ipcRenderer.removeListener('did-auth', () => this.didAuthenticate())
  }

  private didAuthenticate() {
    console.log(`authenticated! ${getToken()}`)
  }

  public render() {
    const completeStyle = Object.assign({}, this.props.style, AppStyle)
    return (
      <div style={completeStyle}>
        <ThingList selectedRow={this.state.selectedRow} onSelectionChanged={row => this.handleSelectionChanged(row)}/>
        <Info selectedRow={this.state.selectedRow}/>
      </div>
    )
  }

  private handleSelectionChanged(row: number) {
    this.setState({selectedRow: row})
  }
}
