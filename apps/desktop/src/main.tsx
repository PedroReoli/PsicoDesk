import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import { AppProviders } from './app/AppProviders';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz da aplicação não foi encontrado.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
