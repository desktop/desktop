'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const webpackTargetElectronRenderer = require('webpack-target-electron-renderer')

const config = {
  devtool: 'cheap-module-eval-source-map',
  entry: {
    main: common.entry.main,
    renderer: ['webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr', ...common.entry.renderer],
    shared: ['webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr', ...common.entry.shared]
  },
  output: {
    filename: common.output.filename,
    path: common.output.path,
    libraryTarget: common.output.libraryTarget,
    publicPath: 'http://localhost:3000/build/'
  },
  plugins: [
    ...common.plugins,
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoErrorsPlugin(),
    new webpack.DefinePlugin({
      __DEV__: true
    })
  ],
  module: common.module,
  resolve: common.resolve,
  target: 'electron',
  externals: common.externals,
  node: common.node
}

// This will cause the compiled CSS (and sourceMap) to be
// embedded within the compiled javascript bundle and added
// as a blob:// uri at runtime.
config.module.loaders.push({
  test: /\.scss$/,
  loaders: ['style', 'css?sourceMap', 'sass?sourceMap']
})

config.target = webpackTargetElectronRenderer(config)

module.exports = config
