import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { emitChange } from './store/epsStore';
import { initializeSharedData } from './data/sharedDataSync';

initializeSharedData(emitChange).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
