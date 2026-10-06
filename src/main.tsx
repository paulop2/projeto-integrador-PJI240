import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { AuthPage } from './app/AuthPage';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/login' || window.location.pathname === '/login/' ? <AuthPage /> : <App />}
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
