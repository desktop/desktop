import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { ErrorApp } from './error-app'

const container = document.createElement('div')
container.id = 'desktop-crash-container'
document.body.appendChild(container)

ReactDOM.render(
  <ErrorApp />,
  document.getElementById('desktop-app-container')!
)
