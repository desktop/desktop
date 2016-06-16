'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const webpackTargetElectronRenderer = require('webpack-target-electron-renderer')

const config = {
  devtool: 'cheap-module-source-map',
  entry: common.entry,
  output: common.output,
  plugins: [
    ...common.plugins,
    new webpack.optimize.UglifyJsPlugin(),
    new webpack.optimize.OccurrenceOrderPlugin(true),
    new webpack.DefinePlugin({
      __DEV__: false
    })
  ],
  module: common.module,
  resolve: common.resolve,
  target: common.target,
  externals: common.externals
}

config.target = webpackTargetElectronRenderer(config)

module.exports = config
