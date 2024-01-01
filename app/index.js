const express = require('express')
const path = require('path')
const routes = require('./routes.js')

const app = express()
const port = process.env.PORT || 8080

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use('/', routes)
app.use('/static', express.static(path.join(__dirname, 'static')))
app.use((err, req, res, _) => {
  const path = req.path + '?' + Object.entries(req.query).map(([key, value]) => `${key}=${value}`).join('&')
  console.log(`${Date()} to ${path} from ${req.ip} caused ${err.name}: ${err.message}`)
  console.log(err.stack)
  res.sendStatus(500)
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Server listening at 127.0.0.1:${port}`)
})
