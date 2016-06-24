'use strict'

const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: {
    renderer: ['./src/index'],
    background: ['./src/background-process/index']
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, 'build'),
    libraryTarget: 'commonjs2'
  },
  module: {
    loaders: [
      {
        test: /\.tsx?$/,
        loaders: ['babel', 'ts'],
        include: path.join(__dirname, 'src')
      },
      {
        test: /\.(jpe?g|png|gif|ico)$/,
        loaders: ['file?name=[path][name].[ext]']
      }
    ]
  },
  resolve: {
    extensions: ['', '.js', '.ts', '.tsx'],
    packageMains: ['webpack', 'browser', 'web', 'browserify', ['jam', 'main'], 'main']
  },
  target: 'electron',
  plugins: [
    new HtmlWebpackPlugin({
      'template': 'static/index.html',
      'chunks': ['renderer']
    }),
    new HtmlWebpackPlugin({
      'filename': 'background.html',
      'chunks': ['background']
    })
  ],
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
