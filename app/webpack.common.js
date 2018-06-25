'use strict'

const path = require('path')
const Fs = require('fs')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const webpack = require('webpack')
const merge = require('webpack-merge')
const appInfo = require('./app-info')
const packageInfo = require('./package-info')
const distInfo = require('../script/dist-info')

const channel = distInfo.getReleaseChannel()

const externals = ['7zip']
if (channel === 'development') {
  externals.push('devtron')
}

const outputDir = 'out'
const replacements = appInfo.getReplacements()

const commonConfig = {
  externals: externals,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', outputDir),
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: path.resolve(__dirname, 'src'),
        use: [
          {
            loader: 'awesome-typescript-loader',
            options: {
              useBabel: true,
              useCache: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        loader: 'awesome-node-loader',
        options: {
          name: '[name].[ext]',
        },
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin([outputDir], { verbose: false }),
    // This saves us a bunch of bytes by pruning locales (which we don't use)
    // from moment.
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new webpack.NoEmitOnErrorsPlugin(),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    modules: [path.resolve(__dirname, 'node_modules/')],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
}

const mainConfig = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('main'),
      })
    ),
  ],
})

const rendererConfig = merge({}, commonConfig, {
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        use: ['file?name=[path][name].[ext]'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'static', 'index.html'),
      chunks: ['renderer'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('ui'),
      })
    ),
  ],
})

const askPassConfig = merge({}, commonConfig, {
  entry: { 'ask-pass': path.resolve(__dirname, 'src/ask-pass/main') },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('askpass'),
      })
    ),
  ],
})

const crashConfig = merge({}, commonConfig, {
  entry: { crash: path.resolve(__dirname, 'src/crash/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      title: 'GitHub Desktop',
      filename: 'crash.html',
      chunks: ['crash'],
    }),
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('crash'),
      })
    ),
  ],
})

const cliConfig = merge({}, commonConfig, {
  entry: { cli: path.resolve(__dirname, 'src/cli/main') },
  target: 'node',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('cli'),
      })
    ),
  ],
})

const highlighterConfig = merge({}, commonConfig, {
  entry: { highlighter: path.resolve(__dirname, 'src/highlighter/index') },
  output: {
    libraryTarget: 'var',
    chunkFilename: 'highlighter/[name].js',
  },
  optimization: {
    namedChunks: true,
    splitChunks: {
      cacheGroups: {
        modes: {
          enforce: true,
          name: (mod, chunks) => {
            const builtInMode = /node_modules\/codemirror\/mode\/(\w+)\//.exec(
              mod.resource
            )
            if (builtInMode) {
              return `mode/${builtInMode[1]}`
            }
            const external = /node_modules\/codemirror-mode-(\w+)\//.exec(
              mod.resource
            )
            if (external) {
              return `ext/${external[1]}`
            }
            return 'common'
          },
        },
      },
    },
  },
  target: 'webworker',
  plugins: [
    new webpack.DefinePlugin(
      Object.assign({}, replacements, {
        __PROCESS_KIND__: JSON.stringify('highlighter'),
      })
    ),
  ],
  resolve: {
    // We don't want to bundle all of CodeMirror in the highlighter. A web
    // worker doesn't have access to the DOM and most of CodeMirror's core
    // code is useless to us in that context. So instead we use this super
    // nifty subset of codemirror that defines the minimal context needed
    // to run a mode inside of node. Now, we're not running in node
    // but CodeMirror doesn't have to know about that.
    alias: {
      codemirror$: 'codemirror/addon/runmode/runmode.node.js',
      '../lib/codemirror$': '../addon/runmode/runmode.node.js',
      '../../lib/codemirror$': '../../addon/runmode/runmode.node.js',
      '../../addon/runmode/runmode$': '../../addon/runmode/runmode.node.js',
    },
  },
})

highlighterConfig.module.rules = [
  {
    test: /\.ts$/,
    include: path.resolve(__dirname, 'src/highlighter'),
    use: [
      {
        loader: 'awesome-typescript-loader',
        options: {
          useBabel: true,
          useCache: true,
          configFileName: path.resolve(
            __dirname,
            'src/highlighter/tsconfig.json'
          ),
        },
      },
    ],
    exclude: /node_modules/,
  },
]

module.exports = {
  main: mainConfig,
  renderer: rendererConfig,
  askPass: askPassConfig,
  crash: crashConfig,
  cli: cliConfig,
  highlighter: highlighterConfig,
  replacements: replacements,
  externals: commonConfig.externals,
}
