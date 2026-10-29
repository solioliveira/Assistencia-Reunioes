import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import { initializeTheme } from './services/theme';

// Remove qualquer Service Worker antigo que possa bloquear a sincronização ou autenticação
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {});
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          caches.delete(key).catch(() => {});
        }
      })
      .catch(() => {});
  }

  // Se um Service Worker antigo interceptou o redirecionamento com __aistudio_auth_token,
  // encaminha imediatamente para /api/health para validar o cookie no Nginx
  if (window.location.search.includes('__aistudio_auth_token=')) {
    fetch(`/api/health${window.location.search}&__storage_access_granted=1`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('__aistudio_auth_token');
          url.searchParams.delete('__storage_access_granted');
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch {}
      })
      .catch(() => {});
  }
}

// Inicializa a cor primária configurada antes da montagem
initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


