const path = require('path');

module.exports = {
  entry: {
    index: './src/index.tsx'
  },

  output: {
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: '/dist/',
    filename: '[name].bundle.js'
  },

  module: {
    loaders: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'babel-loader',
          },
          {
            loader: 'ts-loader',
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.(png|jpg|gif)$/,
        use: [
          {
            loader: 'file-loader',
            options: {}  
          }
        ]
      },
      { test: /\.css$/, loader: "style-loader!css-loader" },
      { test: /\.(eot|svg|ttf|woff|woff2)$/, loader: 'file-loader' },
    ]
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      'three': path.join(__dirname, 'node_modules/three/build/three.module.js')
    }
  },

  plugins: [],

  devtool: 'source-map'
};
