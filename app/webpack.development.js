'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')

const config = {
  devtool: 'cheap-module-eval-source-map',
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)

const rendererConfig = merge({}, common.renderer, config, {
  entry: {
    renderer: ['webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr', common.renderer.entry.renderer]
  },
  output: {
    publicPath: 'http://localhost:3000/build/'
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

const sharedConfig = merge({}, common.shared, config, { })

module.exports = [ mainConfig, sharedConfig, rendererConfig, askPassConfig ]
