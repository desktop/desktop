import * as common from './webpack.common'

import * as webpack from 'webpack'
import merge from 'webpack-merge'

const config: webpack.Configuration = {
  mode: 'development',
  devtool: 'source-map',
}

const mainConfig = merge({}, common.main, config)
const askPassConfig = merge({}, common.askPass, config)
const cliConfig = merge({}, common.cli, config)
const highlighterConfig = merge({}, common.highlighter, config)

const getRendererEntryPoint = () => {
  const entry = common.renderer.entry as webpack.Entry
  if (entry == null) {
    throw new Error(
      `Unable to resolve entry point. Check webpack.common.ts and try again`
    )
  }

  return entry.renderer as string
}

const getPortOrDefault = () => {
  const port = process.env.PORT
  if (port != null) {
    const result = parseInt(port)
    if (isNaN(result)) {
      throw new Error(`Unable to parse '${port}' into valid number`)
    }
    return result
  }

  return 3000
}

const port = getPortOrDefault()
const webpackHotModuleReloadUrl = `webpack-hot-middleware/client?path=http://localhost:${port}/__webpack_hmr`
const publicPath = `http://localhost:${port}/build/`

const rendererConfig = merge({}, common.renderer, config, {
  entry: {
    renderer: [webpackHotModuleReloadUrl, getRendererEntryPoint()],
  },
  output: {
    publicPath,
  },
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader?sourceMap', 'sass-loader?sourceMap'],
      },
    ],
  },
  plugins: [new webpack.HotModuleReplacementPlugin()],
})

const crashConfig = merge({}, common.crash, config, {
  module: {
    rules: [
      // This will cause the compiled CSS (and sourceMap) to be
      // embedded within the compiled javascript bundle and added
      // as a blob:// uri at runtime.
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader?sourceMap', 'sass-loader?sourceMap'],
      },
    ],
  },
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
