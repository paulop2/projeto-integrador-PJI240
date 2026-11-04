import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { AuthPage } from './app/AuthPage';
import './styles/global.css';

// Login V2 appends /login to the kit's configured /login base URI.
const loginPath = /^\/login(?:\/login)?\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {loginPath ? <AuthPage /> : <App />}
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
