import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/workspace.css'
import './styles/welcome.css'
import './styles/motion.css'
import './styles/gis.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the service worker only for production builds. In dev, Vite serves
// unbundled modules that must never be cached by a service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration must not break the app. Offline support is an
      // enhancement; the UI reports its absence honestly on the offline page.
    })
  })
}
