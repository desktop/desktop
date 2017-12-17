#!/usr/bin/env ts-node

'use strict'

import { run } from './run'
import express = require('express')
import webpack = require('webpack')
const configs: webpack.Configuration[] = require('../app/webpack.development')

function startApp() {
  const runningApp = run({ stdio: 'inherit' })
  if (runningApp) {
    runningApp.on('close', () => {
      process.exit(0)
    })
  } else {
    console.error(
      "Couldn't launch the app. You probably need to build it first. Run `yarn build:dev`."
    )
    process.exit(1)
  }
}

if (process.env.NODE_ENV === 'production') {
  startApp()
} else {
  const [, rendererConfig] = configs

  const server = express()
  const compiler = webpack(rendererConfig)
  const port = Number(process.env.PORT) || 3000

  server.use(
    require('webpack-dev-middleware')(compiler, {
      publicPath: rendererConfig.output!.publicPath,
      noInfo: true
    })
  )

  server.use(require('webpack-hot-middleware')(compiler))

  server.listen(port, 'localhost', (err?: Error) => {
    if (err) {
      console.log(err)
      process.exit(1)
      return
    }

    console.log(`Server running at http://localhost:${port}`)
    startApp()
  })
}
