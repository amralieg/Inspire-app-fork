import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import HarnessApp from './HarnessApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HarnessApp open={new URLSearchParams(window.location.search).get('open')} />
  </StrictMode>,
);
