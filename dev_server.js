'use strict'

const express = require('express')
const webpack = require('webpack')
const config = require('./webpack.development')

const app = express()
const compiler = webpack(config)
const port = process.env.PORT || 3000

app.use(require('webpack-dev-middleware')(compiler, {
  publicPath: config.output.publicPath
}))

app.use(require('webpack-hot-middleware')(compiler))

app.listen(port, 'localhost', err => {
  if (err) {
    console.log(err)
    return
  }

  console.log(`Listening at http://localhost:${port}`)
})
