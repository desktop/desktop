'use strict'

const path = require('path')
const Fs = require('fs')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const webpack = require('webpack')
const merge = require('webpack-merge')
const distInfo = require('../script/dist-info')

const devClientId = '3a723b10ac5575cc5bb9'
const devClientSecret = '22c34d87789a365981ed921352a7b9a8c3f69d54'

const channel = distInfo.getReleaseChannel()

/**
 * Attempt to dereference the given ref without requiring a Git environment
 * to be present. Note that this method will not be able to dereference packed
 * refs but should suffice for simple refs like 'HEAD'.
 *
 * Will throw an error for unborn HEAD.
 *
 * @param {string} gitDir The path to the Git repository's .git directory
 * @param {string} ref    A qualified git ref such as 'HEAD' or 'refs/heads/master'
 */
function revParse(gitDir, ref) {
  const refPath = path.join(gitDir, ref)
  const refContents = Fs.readFileSync(refPath)
  const refRe = /^([a-f0-9]{40})|(?:ref: (refs\/.*))$/m
  const refMatch = refRe.exec(refContents)

  if (!refMatch) {
    throw new Error(
      `Could not de-reference HEAD to SHA, invalid ref in ${refPath}: ${refContents}`
    )
  }

  return refMatch[1] || revParse(gitDir, refMatch[2])
}

const replacements = {
  __OAUTH_CLIENT_ID__: JSON.stringify(
    process.env.DESKTOP_OAUTH_CLIENT_ID || devClientId
  ),
  __OAUTH_SECRET__: JSON.stringify(
    process.env.DESKTOP_OAUTH_CLIENT_SECRET || devClientSecret
  ),
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __LINUX__: process.platform === 'linux',
  __DEV__: channel === 'development',
  __RELEASE_CHANNEL__: JSON.stringify(channel),
  __UPDATES_URL__: JSON.stringify(distInfo.getUpdatesURL()),
  __SHA__: JSON.stringify(revParse(path.resolve(__dirname, '../.git'), 'HEAD')),
  'process.platform': JSON.stringify(process.platform),
  'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  'process.env.TEST_ENV': JSON.stringify(process.env.TEST_ENV),
}

const outputDir = 'out'

const externals = ['7zip']
if (channel === 'development') {
  externals.push('devtron')
}

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
        use: [
          { loader: 'node-native-loader', options: { name: '[name].[ext]' } },
        ],
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

module.exports = {
  main: mainConfig,
  renderer: rendererConfig,
  askPass: askPassConfig,
  crash: crashConfig,
  cli: cliConfig,
  replacements: replacements,
  externals: commonConfig.externals,
}
