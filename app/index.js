const express = require('express')
const routes = require('./routes.js')

const app = express()
const port = process.env.PORT || 8080
const addr = app.get('env') == 'development' ? '127.0.0.1' : '0.0.0.0'

app.set('view engine', 'ejs')
app.set('views', __dirname + '/views')

app.use('/', routes)

app.listen(port, addr, () => {
  console.log(`Server listening at ${addr}:${port}`)
})
