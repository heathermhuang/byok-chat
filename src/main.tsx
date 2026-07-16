import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LegalPage, legalPageKind } from './components/LegalPage'
import { PrivacyControls } from './components/PrivacyControls'
import './styles.css'

function Root() {
  const legalKind = legalPageKind(globalThis.location?.pathname || '/')
  return (
    <div className="site-root">
      {legalKind ? <LegalPage kind={legalKind} /> : <App />}
      <PrivacyControls />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
