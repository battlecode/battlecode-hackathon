const path = require('path');
const BabelMinifyPlugin = require('babel-minify-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const webpack = require('webpack');

// dev settings
const dev = require('./webpack.config');

// overrides

// minify output using babel
dev.plugins = [
  new webpack.optimize.OccurrenceOrderPlugin(),
  new webpack.DefinePlugin({
    'process.env': {
      'NODE_ENV': JSON.stringify('production')
    }
  }),
  new webpack.optimize.UglifyJsPlugin({
    uglifyOptions: {
      ecma: 7,
      warnings: true
    }
  }),
  new BundleAnalyzerPlugin({
    analyzerMode: 'static',
    openAnalyzer: false
  })
];
// no source maps
dev.devtool = false;

module.exports = dev;