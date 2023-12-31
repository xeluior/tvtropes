const { TVTropes } = require('../models.js')

module.exports.show = async function(req, res, next) {
  try {
    // parse parameters
    const namespaceSearchQuery = req.query.nsq || ''
    const tropeSearchQuery = req.query.tsq || ''
    const page = Number.parseInt(req.query.page) || 1

    // normalize to arrays
    const namespaces = (req.query.n || '') === '' ? [] : [].concat(req.query.n)
    const tropes = (req.query.t || '') === '' ? [] : [].concat(req.query.t)

    // perform queries
    const namespacesQuery = TVTropes.articleCount(`%${namespaceSearchQuery}%`)
    const resultsQuery = TVTropes.search(namespaces, tropes, page)
    const resultCountQuery = TVTropes.resultCount(namespaces, tropes)
    const tropeQuery = TVTropes.associatedTropes(namespaces, tropes, `%${tropeSearchQuery}%`)
    const [namespaceFilters, results, resultCount, tropeFilters] = await Promise.all([namespacesQuery, resultsQuery, resultCountQuery, tropeQuery])

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
    const path = `/search?tsq=${tropeSearchQuery}&nsq=${namespaceSearchQuery}&n=${namespaces.join('&n=')}&t=${tropes.join('&t=')}`
    const lastPage = Math.ceil(resultCount / TVTropes.RESULTS_PAGE_SIZE)
    const pageWindow = generatePageWindow(page, lastPage, 5)
    const pages = {
      first:    { href: `${path}&page=1`,           current: page === 1 },
      previous: { href: `${path}&page=${page - 1}`, current: page === 1 },
      next:     { href: `${path}&page=${page + 1}`, current: page === lastPage },
      last:     { href: `${path}&page=${lastPage}`, current: page === lastPage },
      window: pageWindow.map(i => {
        return { href: `${path}&page=${i}`, current: i === page, number: i }
      })
    }

    res.render('search', { namespaces: namespaceFilters, results, tropes: tropeFilters, pages })
  } catch (e) {
    next(e)
  }
} 

/**
 * Creates an array of integers representing page numbers surrounding current while keeping the range within 1..max
 * @param {Number} current
 * @param {Number} max
 * @param {Number} size
 * @returns {Array<Number>}
 */
const generatePageWindow = (current, max, size) => {
  size = Math.min(size, max)

  let start = current - Math.floor(size / 2)
  if (start < 1) {
    start = 1
  } else if (start + size > max) {
    start = max - size + 1
  }

  const pageWindow = []
  for (let i = start; i < start + size; i++) {
    pageWindow.push(i)
  }
  return pageWindow
}
