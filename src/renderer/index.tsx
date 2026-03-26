import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="app">
    <App />
  </ErrorBoundary>
)
