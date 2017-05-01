'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const BabelPlugin = require('babel-webpack-plugin')

let branchName = ''
if (process.platform === 'darwin') {
  branchName = process.env.TRAVIS_BRANCH
} else if (process.platform === 'win32') {
  branchName = process.env.APPVEYOR_REPO_BRANCH
}

let environment = 'production'
if (branchName && branchName.length > 0) {
  const matches = branchName.match(/^__release-([a-zA-Z]+)-.*/)
  if (matches && matches.length === 2) {
    environment = matches[1]
  }
}

const config = {
  devtool: 'source-map',
  plugins: [
    new BabelPlugin({
      test: /\.js$/,
      sourceMaps: true,
      compact: true, 
      minified: true,
      comments: false,
      presets: ['babili'],
    })
  ],
}

const mainConfig = merge({}, common.main, config)
const sharedConfig = merge({}, common.shared, config)
const askPassConfig = merge({}, common.askPass, config)

const rendererConfig = merge({}, common.renderer, config, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: [ 'css-loader', 'sass-loader' ]
        })
      },
    ],
  },
  plugins: [
    // Necessary to be able to use ExtractTextPlugin as a loader.
    new ExtractTextPlugin('styles.css'),
  ]
})

module.exports = [ mainConfig, sharedConfig, rendererConfig, askPassConfig ]
