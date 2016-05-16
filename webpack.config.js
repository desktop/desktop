var path = require('path')
var webpack = require('webpack')
var webpackTargetElectronRenderer = require('webpack-target-electron-renderer')

var config = {
  devtool: 'cheap-module-eval-source-map',
  entry: [
    'webpack-hot-middleware/client?path=http://localhost:3000/__webpack_hmr',
    './src/index'
  ],
  output: {
    filename: 'bundle.js',
    path: path.join(__dirname, 'build'),
    libraryTarget: 'commonjs2',
    publicPath: 'http://localhost:3000/build/'
  },
  plugins: [
    new webpack.IgnorePlugin(/vertx/),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoErrorsPlugin(),
    new webpack.DefinePlugin({
      // TODO: This is obviously wrong for production builds.
      __DEV__: true,
      'process.env': {
        NODE_ENV: JSON.stringify('development')
      }
    })
  ],
  module: {
    loaders: [
      {
        test: /\.tsx?$/,
        loaders: ['babel', 'ts'],
        include: path.join(__dirname, 'src')
      }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.ts', '.tsx'],
    packageMains: ['webpack', 'browser', 'web', 'browserify', ['jam', 'main'], 'main']
  },
  target: 'electron',
  externals: function (context, request, callback) {
    try {
      // Attempt to resolve the module via Node
      require.resolve(request)
      callback(null, request)
    } catch (e) {
      // Node couldn't find it, so it must be user-aliased
      callback()
    }
  }
}

config.target = webpackTargetElectronRenderer(config)

module.exports = config
