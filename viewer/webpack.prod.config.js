const path = require('path');
const BabelMinifyPlugin = require('babel-minify-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const webpack = require('webpack');

// dev settings
const dev = require('./webpack.config');

// overrides

// minify output using babel
dev.plugins = dev.plugins.concat([
  new webpack.optimize.OccurrenceOrderPlugin(),
  new webpack.DefinePlugin({
    'process.env': {
      'NODE_ENV': JSON.stringify('production')
    }
  }),
  new UglifyJsPlugin({
    uglifyOptions: {
      ecma: 7,
      warnings: true
    }
  }),
  new BundleAnalyzerPlugin({
    analyzerMode: 'static',
    openAnalyzer: false
  })
]);
// no source maps
dev.devtool = false;

module.exports = dev;