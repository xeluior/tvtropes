/* eslint-env browser */
const causeAlert = (message) => {
  const alert = document.createElement('div')
  alert.classList.add('alert', 'alert-warning', 'alert-dismissible', 'fade', 'show')
  alert.innerHTML = message
  alert.role = "alert"

  const closeButton = document.createElement('button')
  closeButton.type = "button"
  closeButton.classList.add("btn-close")
  closeButton.dataset.bsDismiss = "alert"
  closeButton.ariaLabel = "Close"

  alert.appendChild(closeButton)
  document.body.insertBefore(alert, document.body.firstChild)
}

module.exports = {
  /**
   * Intercepts submit events from the tropes search box and makes the AJAX call to update the filter list
   */
  tropes: function(event) {
    event.preventDefault()

    // disable form controls while loading
    // doesn't need to be removed on success since the new html will replace it
    for (const t of document.querySelectorAll('[name="t"]')) {
      t.setAttribute('disabled', 'true')
      t.parentElement.classList.add('placeholder-glow')
      document.querySelector(`[for="${t.id}"]`).classList.add('placeholder')
    }

    // submit the form
    const tropeSearchQuery = document.getElementById('tsq').value
    const params = Array.from(document.querySelectorAll('[name="t"], [name="n]'))
      .filter(e => e.checked).map(e => `${e.name}=${e.value}`).join('&')
    fetch(`/tropes?${params}&tsq=${tropeSearchQuery}`).then((response) => {
      if (response.ok) {
        return response.text()
      }
      throw new Error(`${response.status} ${response.statusText}`)
    }).then((body) => {
      document.getElementById('trope-filters').innerHTML = body
    }).catch((err) => {
      causeAlert(err.message)

      // remove placeholder values from form
      for (const t of document.querySelectorAll('[name="t"]')) {
        t.removeAttribute('disabled')
        t.parentElement.classList.remove('placeholder-glow')
        document.querySelector(`[for="${t.id}"]`).classList.remove('placeholder')
      }
    })
  },

  /**
   * Intercepts submit event on the namespaces search, loads the search results
   */
  namespaces: function(event) {
    event.preventDefault()

    // disable form controls while loading
    // doesn't need to be removed on success since the new html will replace it
    for (const n of document.querySelectorAll('[name="n"]')) {
      n.setAttribute('disabled', 'true')
      n.parentElement.classList.add('placeholder-glow')
      document.querySelector(`[for="${n.id}"]`).classList.add('placeholder')
    }

    const namespaceSearchQuery = document.getElementById('nsq').value
    const namespaces = Array.from(document.querySelectorAll('[name="n"]'))
      .filter(e => e.checked).map(e => `${e.name}=${e.value}`).join('&')
    fetch(`/articlecount?nsq=${namespaceSearchQuery}&${namespaces}`).then(response => {
      if (response.ok) {
        return response.text()
      }
      throw new Error(`${response.status} ${response.statusText}`)
    }).then(body => {
      document.getElementById('namespace-filters').innerHTML = body
    }).catch((err) => {
      causeAlert(err.message)

      for (const n of document.querySelectorAll('[name="n"]')) {
        n.removeAttribute('disabled')
        n.parentElement.classList.remove('placeholder-glow')
        document.querySelector(`[for="${n.id}"]`).classList.remove('placeholder')
      }
    })
  },

  /**
   * updates the history and loads the new page of results. Should be callable from either form submit or link follow
   */
  search: function(event) {
    event.preventDefault()

    const params = (() => {
      if (event.target.href !== undefined) {
        // event was fired by a page navigation
        const url = new URL(event.target.href)
        return url.search
      }
      
      // event was fired by form submit
      Array.from(FormData(document.getElementById('search'))).map(f => f.join('=')).join('&')
    })()

    // update the browser history
    history.pushState({}, '', `/search?${params}`)

    // set the placeholders
    for (const e of document.querySelectorAll('.twikilink')) {
      e.classList.add('placeholder', 'disabled')
      e.ariaDisabled = true
      e.setAttribute('tabindex', -1)
      e.parentElement.classList.add('placeholder-glow')
    }

    // submit the form
    fetch(`/results?${params}`).then((response) => {
      if (response.ok) {
        return response.text()
      }

      throw new Error(`${response.status} ${response.statusText}`)
    }).then((body) => {
      document.getElementById('results').innerHTML = body
    }).catch((err) => {
      causeAlert(err.message)

      // remove the placeholders
      for (const e of document.querySelectorAll('.twikilink')) {
        e.classList.remove('placeholder', 'disabled')
        e.ariaDisabled = false
        e.removeAttribute('tabindex')
        e.parentElement.classList.remove('placeholder-glow')
      }
    })
  }
}
