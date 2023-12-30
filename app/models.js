const sqlite3 = require('sqlite3')
const db = new sqlite3.Database('tvtropes.db', sqlite3.OPEN_READONLY)


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
   * @typedef {Object} ParameterizedStatement
   * @property {String} statement
   * @property {Array} parameters
   */

  /**
   * @typedef {Object} Trope
   * @property {String} namespace
   * @property {String} id
   * @property {String} title
   * @property {Number} occurances
   */

  PAGE_SIZE: 10,
  articleCountQueryStmt: db.prepare('SELECT namespace, COUNT(id) AS articles FROM pages WHERE namespace LIKE ? GROUP BY namespace ORDER BY COUNT(id) DESC LIMIT ? OFFSET ?'),

  /**
   * returns the proper LIMIT and OFFSET parameters for the given page based on the PAGE_SIZE constant
   * @param {Number} page
   * @returns {Array<Number>}
   */
  pageParams: function(page) {
    const offset = this.PAGE_SIZE * (page - 1)
    return [this.PAGE_SIZE, offset]
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
      this.articleCountQueryStmt.all(query, ...this.pageParams(page), (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
  },

  /**
   * gets all canonical pages from the database sorted by the number of pages that links to them
   * @param {Number} [page]
   * @returns {ParameterizedStatement}
   */
  allPages: function() {
    return {
      statement: `SELECT
          link_namespace AS namespace, link_id AS id
        FROM links
        GROUP BY link_namespace, link_id`,
      parameters: []
    }
  },

  /**
   * returns all pages, sorted by count of pages that link to them where the page is in any of the given namespaces
   * @param {Array<String>} [namespaces]
   * @param {Number} [page=1]
   * @returns {ParameterizedStatement}
   */
  namespacePages: function(namespaces) {
    const conditions = Array(namespaces.length).fill('link_namespace = ?').join(' OR ')
    const namespacePagesStmt = `SELECT
        link_namespace AS namespace, link_id AS id
      FROM links
      WHERE (
        ${conditions}
      )
      GROUP BY link_namespace, link_id`
    return {
      statement: namespacePagesStmt,
      parameters: namespaces
    }
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
   * @returns {ParameterizedStatement}
   */
  tropePages: function(tropes) {
    const stmt = `SELECT
        T1.namespace, T1.id
      FROM (
        ${this.intersections(tropes.length)}
      ) AS T1
      JOIN links AS T2 ON
        T1.namespace = T2.link_namespace
        AND T1.id = T2.link_id
      GROUP BY
        T1.namespace, T1.id`
    return {
      statement: stmt,
      parameters: tropes
    }
  },

  /**
   * All pages in any of the namespaces that link to all the tropes
   * @param {Array<String>} tropes
   * @param {Array<String>} namespaces
   * @param {Number} [page=1]
   * @returns {ParameterizedStatement}
   */
  namespaceTropePages: function(tropes, namespaces) {
    const conditions = Array(namespaces.length).fill('T1.namespace = ?').join(' OR ')
    const stmt = `SELECT
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
    const params = [...tropes, ...namespaces]
    return {
      statement: stmt,
      parameters: params
    }
  },

  /**
   * Determines and constructs the correct query for the parameters
   * @params {Array<String>} namespace
   * @params {Array<String>} tropes
   * @params {Number} [page=1]
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
    const subquery = this.resultsQuery(namespaces, tropes, page)
    const query = `SELECT
        results.namespace, results.id, pages.title
      FROM (${subquery.statement} ORDER BY COUNT(*) DESC LIMIT ? OFFSET ?) AS results
      JOIN pages
      ON
        results.namespace = pages.namespace
        AND results.id = pages.id`
    return new Promise((resolve, reject) => {
      db.all(query, ...subquery.parameters, ...this.pageParams(page), (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
  },

  /**
   * List of tropes that occur linked to the result set of the search query
   * @param {Array<String>} [namespaces]
   * @param {Array<String>} [tropes]
   * @param {String} [query]
   * @param {Number} [page=1]
   * @returns {Promise<Array<Trope>>}
   */
  associatedTropes: function(namespaces, tropes, query, page = 1) {
    const subquery = this.resultsQuery(namespaces, tropes, page)
    const conditionsArray = Array(tropes.length).fill('links.link_id = ?') // bind to ...tropes
    conditionsArray.unshift('links.link_id LIKE ?')  // bind to query

    const conditions = conditionsArray.join(' OR ')
    const sql = `SELECT
        tropes.namespace, tropes.id, pages.title, tropes.occurances
      FROM (
        SELECT
          links.link_namespace AS namespace, links.link_id AS id, COUNT(*) as occurances
        FROM links
        JOIN (${subquery.statement}) AS results /* binds to subquery.parameters */
        ON
          links.namespace = results.namespace
          AND links.id = results.id
        WHERE links.link_namespace = 'Main'
        AND ( ${conditions} )
        GROUP BY links.link_namespace, links.link_id
        ORDER BY COUNT(*) DESC
        LIMIT ? OFFSET ?       /* binds to this.pageParams */
      ) AS tropes
      JOIN pages
      ON
        tropes.namespace = pages.namespace
        AND tropes.id = pages.id`
    return new Promise((resolve, reject) => {
      db.all(
        sql,
        ...subquery.parameters,
        query,
        ...tropes,
        ...this.pageParams(page),
        (err, data) => {
          if (err) reject(err)
          resolve(data)
        })
    })
  }
}

module.exports = { TVTropes }
