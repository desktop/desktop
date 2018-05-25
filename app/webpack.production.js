'use strict'

const common = require('./webpack.common')

const webpack = require('webpack')
const merge = require('webpack-merge')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

const config = {
  mode: 'production',
  devtool: 'source-map',
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)

const rendererConfig = merge({}, common.renderer, config, {
  module: {
    rules: [
      // This will cause the compiled CSS to be output to a
      // styles.css and a <link rel="stylesheet"> tag to be
      // appended to the index.html HEAD at compile time
      {
        test: /\.(scss|css)$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin('renderer.css'),
    new BundleAnalyzerPlugin({
      // this generates the static HTML file to view afterwards, rather
      // than disrupting the user
      analyzerMode: 'static',
      openAnalyzer: false,
      // we can't emit this directly to the dist directory because the
      // build script immediately blows away dist after webpack is done
      // compiling the source into bundles
      reportFilename: 'renderer.report.html',
    }),
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
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
    ],
  },
  plugins: [
    // Necessary to be able to use MiniCssExtractPlugin as a loader.
    new MiniCssExtractPlugin('crash.css'),
  ],
})

module.exports = [
  mainConfig,
  rendererConfig,
  askPassConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
