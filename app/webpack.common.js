'use strict'

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const webpack = require('webpack')
const merge = require('webpack-merge')

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'

const environment = process.env.NODE_ENV || 'development'

const replacements = {
  __OAUTH_CLIENT_ID__: JSON.stringify(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
  __OAUTH_SECRET__: JSON.stringify(process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret),
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __DEV__: environment === 'development',
  __RELEASE_ENV__: JSON.stringify(environment),
  'process.platform': JSON.stringify(process.platform),
  'process.env.NODE_ENV': JSON.stringify(environment),
  'process.env.TEST_ENV': JSON.stringify(process.env.TEST_ENV),
}

const outputDir = 'out'

const commonConfig = {
  externals: [ '7zip' ],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', outputDir),
    libraryTarget: 'commonjs2'
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
          }
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.node$/,
        use: [
          { loader: 'node-native-loader', options: { name: "[name].[ext]" } }
        ],
      }
    ],
  },
  plugins: [
    new CleanWebpackPlugin([ outputDir ], { verbose: false }),
    // This saves us a bunch of bytes by pruning locales (which we don't use)
    // from moment.
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new webpack.DefinePlugin(replacements),
    new webpack.NoEmitOnErrorsPlugin(),
  ],
  resolve: {
    extensions: [ '.js', '.ts', '.tsx' ],
    modules: [ path.resolve(__dirname, 'node_modules/') ],
  },
  node: {
    __dirname: false,
    __filename: false
  },
}

const mainConfig = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
})

const rendererConfig = merge({}, commonConfig, {
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        use: ['file?name=[path][name].[ext]']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      'template': path.join(__dirname, 'static', 'index.html'),
      'chunks': ['renderer']
    }),
  ],
})

const sharedConfig = merge({}, commonConfig, {
  entry: { shared: path.resolve(__dirname, 'src/shared-process/index') },
  target: 'electron-renderer',
  plugins: [
    new HtmlWebpackPlugin({
      'template': path.join(__dirname, 'static', 'error.html'),
      // without this we overwrite index.html
      'filename': 'error.html',
      // we don't need any scripts to run on this page
      'excludeChunks': [ 'main', 'renderer', 'shared', 'ask-pass' ]
    }),
    new HtmlWebpackPlugin({
      'filename': 'shared.html',
      'chunks': ['shared']
    }),
  ],
})

const askPassConfig = merge({}, commonConfig, {
  entry: { 'ask-pass': path.resolve(__dirname, 'src/ask-pass/main') },
  target: 'node',
})

module.exports = {
  main: mainConfig,
  shared: sharedConfig,
  renderer: rendererConfig,
  askPass: askPassConfig,
  replacements: replacements,
  externals: commonConfig.externals,
}
