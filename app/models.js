const sqlite3 = require('sqlite3')
const db = new sqlite3.Database('tvtropes.db', sqlite3.OPEN_READONLY)
if ((process.env.NODE_ENV || 'development') === 'development') {
  db.on('trace', console.log)
}

/**
 * @namespace TVTropes
 */
const TVTropes = {
  /**
   *  @typedef {Object} ArticleCount
   *  @property {String} namespace
   *  @property {Number} articles
   */

  /**
   * @typedef {Object} Page
   * @property {String} namespace
   * @property {String} id
   * @property {String} title
   */

  /**
   * @typedef {Object} Trope
   * @property {String} namespace
   * @property {String} id
   * @property {String} title
   * @property {Number} occurances
   */

  RESULTS_PAGE_SIZE: 20,
  TROPES_PAGE_SIZE: 12,
  NAMESPACES_PAGE_SIZE: 10,
  articleCountQueryStmt: db.prepare('SELECT namespace, COUNT(id) AS articles FROM pages WHERE namespace LIKE ? GROUP BY namespace ORDER BY COUNT(id) DESC LIMIT ? OFFSET ?'),

  /**
   * returns the proper LIMIT and OFFSET parameters for the given page based on the PAGE_SIZE constant
   * @param {Number} page
   * @returns {Array<Number>}
   */
  pageParams: function(page, pageSize = this.RESULTS_PAGE_SIZE) {
    const offset = pageSize * (page - 1)
    return [pageSize, offset]
  },

  /**
   * returns the article count for each namespace with an optional query which
   * only returns namespaces which match. % wildcards can be used
   * @param {Array<String>} [query='']
   * @param {Number} [page=1]
   * @returns {Promise<Array<ArticleCount>>}
   */
  articleCount: function(query = '', page = 1) {
    return new Promise((resolve, reject) => {
      this.articleCountQueryStmt.all(query, ...this.pageParams(page, this.NAMESPACES_PAGE_SIZE), (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
  },

  /**
   * gets all canonical pages from the database sorted by the number of pages that links to them
   * @param {Number} [page]
   * @returns {String}
   */
  allPages: function() {
    return `SELECT
        link_namespace AS namespace, link_id AS id
      FROM links
      GROUP BY link_namespace, link_id`
  },

  /**
   * returns all pages, sorted by count of pages that link to them where the page is in any of the given namespaces
   * @param {Array<String>} [namespaces]
   * @param {Number} [page=1]
   * @returns {String}
   */
  namespacePages: function(namespaces) {
    const conditions = Array(namespaces.length).fill('link_namespace = ?').join(' OR ')
    return `SELECT
        link_namespace AS namespace, link_id AS id
      FROM links
      WHERE (
        ${conditions}
      )
      GROUP BY link_namespace, link_id`
  },

  /**
   * returns the subquery needed to find all pages that link to all of the given tropes 
   * @param {Number} count - the number of tropes to bind to
   * @returns {String}
   */
  intersections: function(count) {
    const stmt = `SELECT
        namespace, id
      FROM links
      WHERE
        link_namespace = 'Main'
        AND link_id = ?`
    const query = Array(count).fill(stmt).join(' INTERSECT ')
    return query
  },

  /**
   * All pages that link to all of the given tropes
   * @param {Array<String>} tropes
   * @param {Array<String>} [namespaces]
   * @param {Number} [page=1]
   * @returns {String}
   */
  tropePages: function(tropes) {
    return `SELECT
        T1.namespace, T1.id
      FROM (
        ${this.intersections(tropes.length)}
      ) AS T1
      JOIN links AS T2 ON
        T1.namespace = T2.link_namespace
        AND T1.id = T2.link_id
      GROUP BY
        T1.namespace, T1.id`
  },

  /**
   * All pages in any of the namespaces that link to all the tropes
   * @param {Array<String>} tropes
   * @param {Array<String>} namespaces
   * @param {Number} [page=1]
   * @returns {String}
   */
  namespaceTropePages: function(tropes, namespaces) {
    const conditions = Array(namespaces.length).fill('T1.namespace = ?').join(' OR ')
    return `SELECT
        T1.namespace, T1.id
      FROM (
        ${this.intersections(tropes.length)}
      ) AS T1
      JOIN links AS T2 ON
        T1.namespace = T2.link_namespace
        AND T1.id = T2.link_id
      WHERE (
        ${conditions}
      ) 
      GROUP BY
        T1.namespace, T1.id`
  },

  /**
   * Determines and constructs the correct query for the parameters
   * @params {Array<String>} namespace
   * @params {Array<String>} tropes
   * @params {Number} [page=1]
   * @returns {sqlite3.Statement}
   */
  resultsQuery: function(namespaces, tropes) {
    if (tropes.length === 0 && namespaces.length > 0) {
      return this.namespacePages(namespaces)
    }
    if (tropes.length > 0 && namespaces.length === 0) {
      return this.tropePages(tropes)
    }
    if (tropes.length > 0 && namespaces.length > 0) {
      return this.namespaceTropePages(tropes, namespaces)
    }

    return this.allPages()
  },

  /**
    * Gets and executes the correct query for the parameters
    * @param {Array<String>} [namespaces]
    * @param {Array<String>} [tropes]
    * @param {Number} [page=1]
    * @returns {Promise<Array<Page>>}
    */
  search: function(namespaces, tropes, page = 1) {
    // ensure theres a sub array for the number of namespaces
    if (this.preparedSearches[namespaces.length] === undefined) {
      this.preparedSearches[namespaces.length] = []
    }

    // prepare the statement if it isn't already
    if (this.preparedSearches[namespaces.length][tropes.length] === undefined) {
      const subquery = this.resultsQuery(namespaces, tropes)
      const query = `SELECT
          results.namespace, results.id, pages.title
        FROM (${subquery} ORDER BY COUNT(*) DESC LIMIT ? OFFSET ?) AS results
        JOIN pages
        ON
          results.namespace = pages.namespace
          AND results.id = pages.id`
      this.preparedSearches[namespaces.length][tropes.length] = db.prepare(query)
    }

    // execute the prepared statement
    const stmt = this.preparedSearches[namespaces.length][tropes.length]
    return new Promise((resolve, reject) => {
      stmt.all(...tropes, ...namespaces, ...this.pageParams(page), (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
  },

  /**
   * A 2d array of cached prepared statements where the first level is indexed by count of namespaces and the second by count of tropes
   * ie. preparedSearches[0][2] is no namespaces and 2 tropes.
   */
  preparedSearches: [],

  /**
   * The total number of results that will be returned for the given filters
   * @param {Array<String>} [namespaces]
   * @param {Array<String>} [tropes]
   * @returns {Promise<Number>}
   */
  resultCount: function(namespaces, tropes) {
    // ensure sub array exists
    if (this.preparedCounts[namespaces.length] === undefined) {
      this.preparedCounts[namespaces.length] = []
    }
    
    // prepare statement if needed
    if (this.preparedCounts[namespaces.length][tropes.length] === undefined) {
      const subquery = this.resultsQuery(namespaces, tropes)
      const query = `SELECT COUNT(*) AS results FROM (${subquery})`
      this.preparedCounts[namespaces.length][tropes.length] = db.prepare(query)
    }

    // execute the statement
    const stmt = this.preparedCounts[namespaces.length][tropes.length]
    return new Promise((resolve, reject) => {
      stmt.all(...tropes, ...namespaces, (err, data) => {
        if (err) reject(err)
        resolve(Number.parseInt(data[0].results))
      })
    })
  },

  /**
   * As preparedSearches but for resultCount
   */
  preparedCounts: [],

  /**
   * List of tropes that occur linked to the result set of the search query
   * @param {Array<String>} [namespaces]
   * @param {Array<String>} [tropes]
   * @param {String} [query]
   * @param {Number} [page=1]
   * @returns {Promise<Array<Trope>>}
   */
  associatedTropes: function(namespaces, tropes, query, page = 1) {
    // ensure cache exists
    if (this.tropesCache[namespaces.length] === undefined) {
      this.tropesCache[namespaces.length] = []
    }
    
    // prepare the query if needed
    if (this.tropesCache[namespaces.length][tropes.length] === undefined) {
      const subquery = (() => {
        if (namespaces.length === 0 && tropes.length === 0) {
          return `SELECT
              links.link_namespace AS namespace, links.link_id AS id, COUNT(*) AS occurances
            FROM links WHERE links.link_namespace = 'Main'`
        }
        const innerSubquery = this.resultsQuery(namespaces, tropes)
        return `SELECT
            links.link_namespace AS namespace, links.link_id AS id, COUNT(*) AS occurances
          FROM links
          JOIN (${innerSubquery}) AS results
          ON
            links.namespace = results.namespace
            AND links.id = results.id
          WHERE links.link_namespace = 'Main'`
      })()

      // including tropes in the search condition ensures we don't have to unshift the result with already selected filters
      const conditionsArray = Array(tropes.length).fill('links.link_id = ?')
      conditionsArray.unshift('links.link_id LIKE ?')
      const conditions = conditionsArray.join(' OR ')

      const sql = `SELECT
          tropes.namespace, tropes.id, pages.title, tropes.occurances
        FROM (
          ${subquery}
          AND ( ${conditions} )  /* binds to query and tropes */
          GROUP BY links.link_namespace, links.link_id
          ORDER BY COUNT(*) DESC
          LIMIT ? OFFSET ?       /* binds to this.pageParams */
        ) AS tropes
        JOIN pages
        ON
          tropes.namespace = pages.namespace
          AND tropes.id = pages.id`
      this.tropesCache[namespaces.length][tropes.length] = db.prepare(sql)
    }

    // run the statement
    const stmt = this.tropesCache[namespaces.length][tropes.length]
    return new Promise((resolve, reject) => {
      stmt.all(
        ...tropes,
        ...namespaces,
        query,
        ...tropes,
        ...this.pageParams(page, this.TROPES_PAGE_SIZE),
        (err, data) => {
          if (err) reject(err)
          resolve(data)
        })
    })
  },

  /**
   * As preparedSearches but for associatedTropes
   */
  tropesCache: []
}

module.exports = { TVTropes }
