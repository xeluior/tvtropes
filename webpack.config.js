const path = require('path')

module.exports = {
  entry: './app/js/lazyload.js',
  output: {
    path: path.join(__dirname, 'app/static'),
    filename: '_bundle.js'
  }
}
