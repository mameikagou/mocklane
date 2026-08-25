const path = require('node:path');
const rspack = require('@rspack/core');

module.exports = {
  mode: 'production',
  experiments: {
    css: true,
  },
  context: __dirname,
  entry: './dashboard/src/index.jsx',
  output: {
    path: path.resolve(__dirname, 'dist/dashboard'),
    filename: 'app.js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'ecmascript', jsx: true },
            transform: { react: { runtime: 'automatic' } },
          },
        },
      },
      {
        test: /\.css$/,
        type: 'css',
        use: ['postcss-loader'],
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: './dashboard/src/index.html',
      inject: 'body',
      minify: true,
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  optimization: {
    minimize: true,
  },
};
