import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts ship inside the bundle so the app renders identically offline.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// Ask WebKit not to evict IndexedDB under storage pressure. Fire-and-forget:
// granted or not, the daily auto-backup stays the real safety net.
void navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
