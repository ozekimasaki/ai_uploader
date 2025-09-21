import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './pages/App';
import { AuthProvider } from './lib/auth';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);


