const forms = require('./forms.js')

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
  tropesForm.addEventListener('submit', forms.tropes)
  tropesDiv.replaceWith(tropesForm)

  // do the same with the "namespaces" controls
  const namespaceDiv = document.getElementById('namespaces')
  const namespacesForm = document.createElement('form')
  namespacesForm.id = 'form'
  namespacesForm.innerHTML = namespaceDiv.innerHTML
  for (const child of namespacesForm.querySelectorAll('[form]')) {
    child.removeAttribute('form')
  }
  namespacesForm.addEventListener('submit', forms.namespaces)
  namespaceDiv.replaceWith(namespacesForm)

  // override search form and pagination behaviour
  document.getElementById('search').addEventListener('submit', forms.search)
  for(const element of document.getElementsByClassName('page-link')) {
    element.addEventListener('click', forms.search)
  }

  // reload trope filters if namespaces are change
  document.querySelectorAll('[name="n"], [name="t"]').forEach(e => {
    e.addEventListener('change', function() {
      document.getElementById('tropes').requestSubmit()
    })
  })
}

