var path = require('path')
var webpack = require('webpack')
var webpackTargetElectronRenderer = require('webpack-target-electron-renderer')

var config = {
  devtool: 'cheap-module-source-map',
  entry: [
    './src/index'
  ],
  output: {
    filename: 'bundle.js',
    path: path.join(__dirname, 'build'),
    libraryTarget: 'commonjs2'
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin(),
    new webpack.optimize.OccurrenceOrderPlugin(true),
    new webpack.DefinePlugin({
      __DEV__: false,
      'process.env': {
        NODE_ENV: JSON.stringify('production')
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
