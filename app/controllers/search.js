const { TVTropes } = require('../models.js')

module.exports.show = async function(req, res) {
  // parse parameters
  const namespaceSearchQuery = req.query.nsq || ''
  const tropeSearchQuery = req.query.tsq || ''
  const page = req.query.page || 1

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
    namespaceFilters[i].selected = namespaces.includes(item.namespace)
  }
  for (const [i, item] of tropeFilters.entries()) {
    tropeFilters[i].selected = tropes.includes(item.id)
  }

  res.render('search', { namespaces: namespaceFilters, results, tropes: tropeFilters })
} 
