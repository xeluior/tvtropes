const { TVTropes } = require('../models.js')

module.exports.show = async function(req, res, next) {
  try {
    // parse parameters
    const namespaceSearchQuery = req.query.nsq || ''
    const tropeSearchQuery = req.query.tsq || ''
    const page = Number.parseInt(req.query.page) || 1

    // normalize to arrays
    const namespaces = req.query.n === undefined ? [] : [].concat(req.query.n)
    const tropes = req.query.t === undefined ? [] : [].concat(req.query.t)

    // perform queries
    const namespacesQuery = TVTropes.articleCount(`%${namespaceSearchQuery}%`)
    const resultsQuery = TVTropes.search(namespaces, tropes, page)
    const tropeQuery = TVTropes.associatedTropes(namespaces, tropes, `%${tropeSearchQuery}%`)
    const [namespaceFilters, results, tropeFilters] = await Promise.all([namespacesQuery, resultsQuery, tropeQuery])

    // include all selected namespace filters
    const queryNamespaces = await Promise.all(namespaces.filter(name =>
      !namespaceFilters.find(item => item.namespace === name)
    ).map(async name => {
      const articleCount = await TVTropes.articleCount(name)
      return articleCount[0]
    }))
    namespaceFilters.unshift(...queryNamespaces)

    // add data for which namespaces where queried
    for (const [i, item] of namespaceFilters.entries()) {
      namespaceFilters[i].selected = namespaces.find(namespace => item.namespace.toLowerCase() === namespace.toLowerCase()) !== undefined
    }
    for (const [i, item] of tropeFilters.entries()) {
      tropeFilters[i].selected = tropes.find(trope => item.id.toLowerCase() === trope.toLowerCase()) !== undefined
    }

    // generate page links
    const path = '/search?' + `tsq=${tropeSearchQuery}` + `&nsq=${namespaceSearchQuery}` + `&n=${namespaces.join('&n=')}` + `&t=${tropes.join('&t=')}`
    const pageNumbers = page === 1 ? [1, 2, 3] : [page - 1, page, page + 1]
    const pages = pageNumbers.map(i => {
      return { href: `${path}&page=${i}`, number: i, current: i === page }
    })

    res.render('search', { namespaces: namespaceFilters, results, tropes: tropeFilters, pages })
  } catch (e) {
    next(e)
  }
} 
