/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/naming-convention */
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
   
  entry: './src/playground.ts',


  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.worker\.js$/,
        loader: 'worker-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: { "crypto": false,
                "fs":false ,
              'path':false}
  },


  plugins: [
    new MiniCssExtractPlugin({
      filename: 'bundle.css'
    }),
    //new CleanWebpackPlugin()
  ],
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};
