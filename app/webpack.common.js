'use strict'

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const merge = require('webpack-merge')

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'

const replacements = {
  __OAUTH_CLIENT_ID__: JSON.stringify(process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId),
  __OAUTH_SECRET__: JSON.stringify(process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret),
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32'
}

const commonConfig = {
  externals: [ 
    'electron',
    'net',
    'remote',
    'shell',
    'app',
    'ipc',

    '7zip',
    'dugite',
  ],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, '..', 'out'),
    libraryTarget: 'commonjs2'
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        use: [
          { loader: 'node-native-loader', options: { name: "[name].[ext]" } }
        ],
      }
    ],
  },
  plugins: [
    new webpack.NoEmitOnErrorsPlugin(),
  ],
  resolve: {
    extensions: [ '.js', '.ts', '.tsx' ],
    modules: [ path.resolve(__dirname, 'node_modules/') ],
    mainFields: ['webpack', 'browser', 'web', 'browserify', ['jam', 'main'], 'main']    
  },
  node: {
    __dirname: false,
    __filename: false
  },
}

const mainConfig = merge({}, commonConfig, {
  entry: { main: path.resolve(__dirname, 'src/main-process/main') },
  target: 'electron-main',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
})

const rendererConfig = merge({}, commonConfig, {
  entry: { renderer: path.resolve(__dirname, 'src/ui/index') },
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
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
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      'filename': 'shared.html',
      'chunks': ['shared']
    }),
  ],
})

const askPassConfig = merge({}, commonConfig, {
  entry: { 'ask-pass': path.resolve(__dirname, 'src/ask-pass/main') },
  target: 'node',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
})

module.exports = {
  main: mainConfig,
  shared: sharedConfig,
  renderer: rendererConfig,
  askPass: askPassConfig,
  replacements: replacements,
  externals: commonConfig.externals,
}
