import * as common from './webpack.common'

import * as webpack from 'webpack'
import merge from 'webpack-merge'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'

const config: webpack.Configuration = {
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
    new MiniCssExtractPlugin({ filename: 'renderer.css' }),
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
    new MiniCssExtractPlugin({ filename: 'crash.css' }),
  ],
})

// eslint-disable-next-line no-restricted-syntax
export default [
  mainConfig,
  rendererConfig,
  askPassConfig,
  crashConfig,
  cliConfig,
  highlighterConfig,
]
