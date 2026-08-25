const path = require('node:path');

module.exports = {
  mode: 'production',
  context: __dirname,
  target: 'web',
  entry: {
    interceptor: './src/extension/interceptor.js',
    background: './src/extension/background.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist/extension'),
    filename: '[name].js',
    clean: true,
    iife: true,
  },
  optimization: {
    minimize: true,
  },
};
