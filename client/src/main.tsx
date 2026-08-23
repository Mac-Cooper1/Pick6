import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Self-hosted fonts (no Google Fonts <link>): Barlow for UI, Barlow Condensed
// for headlines / tabs / big numbers. Only the weights we use get bundled.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
