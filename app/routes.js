const { Router } = require('express')
const search = require('./controllers/search.js')
const router = Router()
module.exports = router

router.get('/', search.show)
router.get('/search', search.show)
