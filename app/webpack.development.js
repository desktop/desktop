'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')

const config = {
  mode: 'development',
  devtool: 'source-map',
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)

const rendererConfig = merge({}, common.renderer, config, {
  entry: {
    renderer: [
      'webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr',
      common.renderer.entry.renderer,
    ],
  },
  output: {
    publicPath: 'http://localhost:3000/build/',
  },
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader?sourceMap', 'sass-loader?sourceMap'],
      },
    ],
  },
  plugins: [new webpack.HotModuleReplacementPlugin()],
})

const crashConfig = merge({}, common.crash, config, {
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader?sourceMap', 'sass-loader?sourceMap'],
      },
    ],
  },
})

module.exports = [
  mainConfig,
  rendererConfig,
  askPassConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
