/* eslint-env browser */
window.onload = function() {
  // replace the "tropes" form control with its own form
  // performs an AJAX rejest when submitted
  const tropesDiv = document.getElementById('tropes')
  const tropesForm = document.createElement('form')
  tropesForm.id = 'tropes'
  tropesForm.innerHTML = tropesDiv.innerHTML
  for (const child of tropesForm.querySelectorAll('[form]')) {
    child.removeAttribute('form')
  }
  tropesForm.addEventListener('submit', function(event) {
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
  })
  tropesDiv.replaceWith(tropesForm)

  // do the same with the "namespaces" controls
  const namespaceDiv = document.getElementById('namespaces')
  const namespacesForm = document.createElement('form')
  namespacesForm.id = 'form'
  namespacesForm.innerHTML = namespaceDiv.innerHTML
  for (const child of namespacesForm.querySelectorAll('[form]')) {
    child.removeAttribute('form')
  }
  namespacesForm.addEventListener('submit', function(event) {
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
  })
  namespaceDiv.replaceWith(namespacesForm)

  // override search form behaviour
  const search = document.getElementById('search')
  search.addEventListener('submit', function(event) {
    event.preventDefault()

    const formdata = new FormData(search)
    const params = Array.from(formdata).map(f => f.join('=')).join('&')

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
  })

  // reload trope filters if namespaces are change
  document.querySelectorAll('[name="n"]').forEach(e => {
    e.addEventListener('change', function() {
      document.getElementById('tropes').requestSubmit()
    })
  })
}

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
