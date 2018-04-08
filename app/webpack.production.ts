'use strict'

const common = require('./webpack.common')

import * as webpack from 'webpack'
import * as merge from 'webpack-merge'
import * as ExtractTextPlugin from 'extract-text-webpack-plugin'
import * as BabelPlugin from 'babel-webpack-plugin'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

const config: webpack.Configuration = {
  devtool: 'source-map',
  plugins: [
    new BabelPlugin({
      test: /\.js$/,
      sourceMaps: true,
      compact: true,
      minified: true,
      comments: false,
      presets: [
        [
          'minify',
          {
            evaluate: false,
          },
        ],
      ],
    }),
    new webpack.optimize.ModuleConcatenationPlugin(),
  ],
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

export = [
  mainConfig,
  rendererConfig,
  askPassConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
