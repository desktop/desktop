#!/usr/bin/env node

'use strict'

const express = require('express')
const webpack = require('webpack')
const config = require('../app/webpack.development')
const server = express()
const compiler = webpack(config)
const port = process.env.PORT || 3000

server.use(require('webpack-dev-middleware')(compiler, {
  publicPath: config.output.publicPath,
  noInfo: true
}))

server.use(require('webpack-hot-middleware')(compiler))

server.listen(port, 'localhost', err => {
  if (err) {
    console.log(err)
    process.exit(1)
    return
  }

  console.log(`Server running at http://localhost:${port}`)
})
