import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

window.onerror = (msg, src, line, col, err) => {
  document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">${msg}\n${src}:${line}\n${err?.stack || ''}</pre>`
}
window.addEventListener('unhandledrejection', e => {
  document.body.innerHTML = `<pre style="color:red;padding:20px;font-family:monospace;font-size:13px;white-space:pre-wrap">Unhandled Promise Rejection:\n${e.reason?.stack || e.reason}</pre>`
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
