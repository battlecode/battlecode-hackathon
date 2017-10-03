var path = require('path');

module.exports = {
  entry: {
    index: './src/index.ts'
  },

  output: {
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: '/dist/',
    filename: '[name].bundle.js'
  },


  module: {
    loaders: [
      {
        test: /\.ts$/,
        use: 'awesome-typescript-loader?useBabel=true',
        exclude: /node_modules/
      }
    ],
    rules: [
      {
        test: /\.(png|jpg|gif)$/,
        use: [
          {
            loader: 'file-loader',
            options: {}  
          }
        ]
      }
    ]
  },

  resolve: {
    extensions: ['.ts', '.js'],
    //alias: {
    //  'three': path.join(__dirname, 'node_modules/three/build/three.module.js')
    //}
  },

  devtool: 'source-map'
};
