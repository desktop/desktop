var express = require('express')
var webpack = require('webpack')
var config = require('./webpack.config')

var app = express()
var compiler = webpack(config)
var port = process.env.PORT || 3000

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
