'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const BabelPlugin = require('babel-webpack-plugin')

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
    }),
  ],
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)
const cliConfig = merge({}, common.cli, config)

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
          use: ['css-loader', 'sass-loader'],
        }),
      },
    ],
  },
  plugins: [
    // Necessary to be able to use ExtractTextPlugin as a loader.
    new ExtractTextPlugin('ui.css'),
  ],
})

const crashConfig = merge({}, common.crash, config, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: ['css-loader', 'sass-loader'],
        }),
      },
    ],
  },
  plugins: [
    // Necessary to be able to use ExtractTextPlugin as a loader.
    new ExtractTextPlugin('crash.css'),
  ],
})

module.exports = [
  mainConfig,
  rendererConfig,
  askPassConfig,
  crashConfig,
  cliConfig,
]
