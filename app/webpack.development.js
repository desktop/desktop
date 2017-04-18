'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')

const config = {
  devtool: 'cheap-module-source-map',
  output: {
    publicPath: 'http://localhost:3000/build/'
  },
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)

const rendererConfig = merge({}, common.renderer, config, {
  entry: {
    renderer: ['webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr', common.renderer.entry.renderer]
  },
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader?sourceMap', 'sass-loader?sourceMap']
      }
    ]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
  ]
})

const sharedConfig = merge({}, common.shared, config, {
  entry: {
    shared: ['webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr', common.shared.entry.shared]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
  ]
})

module.exports = [ mainConfig, sharedConfig, rendererConfig, askPassConfig ]
