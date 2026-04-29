import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import App from './App'
import './index.css'
import { DEFAULT_MODE } from './styles/tokens'

// Sprint 12 — sätt `data-mode` på documentElement så att [data-mode="..."]
// CSS-scopes i index.css aktiveras. Vardag-läge implementeras i Sprint 17;
// tills dess är default ('bokforare') det enda läget som används. Settings-
// driven persistens (ADR 005) hookas in när mode-switcher byggs.
document.documentElement.dataset.mode = DEFAULT_MODE

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        console.error('[Mutation Error]', error.message)
        toast.error(error.message || 'Ett oväntat fel uppstod')
      },
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
