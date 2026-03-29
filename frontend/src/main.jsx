import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import SmartPOSImprovedLayout from './SmartPOSImprovedLayout.jsx'

registerSW({ immediate: true })

let routePath = '/'
if (typeof window !== 'undefined') {
  routePath = window.location.pathname
  if (routePath === '/') {
    window.history.replaceState(null, '', '/launch101')
    routePath = '/launch101'
  }
}

const isAdminRoute =
  routePath === '/admin' ||
  routePath === '/admin/' ||
  routePath === '/legacy-admin' ||
  routePath === '/legacy-admin/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdminRoute ? <App /> : <SmartPOSImprovedLayout />}
  </StrictMode>,
)
