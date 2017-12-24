'use strict'

import * as express from 'express'
import * as webpack from 'webpack'
import * as devMiddleware from 'webpack-dev-middleware'
import * as hotMiddleware from 'webpack-hot-middleware'

import { forceUnwrap as u } from '../app/src/lib/fatal-error'

import configs = require('../app/webpack.development')

const server = express()
const compiler = webpack(configs)
const port = process.env.PORT || 3000

const config = configs.find(c => !!(c.output && c.output.publicPath))

const message = 'Could not find public path from configuration'

server.use(
  devMiddleware(compiler, {
    publicPath: u(message, u(message, u(message, config).output).publicPath),
    noInfo: true,
  })
)

server.use(hotMiddleware(compiler))

server.listen(port, 'localhost', (err?: Error) => {
  if (err) {
    console.log(err)
    process.exit(1)
    return
  }

  console.log(`Server running at http://localhost:${port}`)
})
