import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import { App } from './ui/App';
import { theme } from './ui/theme';
import './ui/global.css';

const host = document.getElementById('root');
if (!host) throw new Error('#root missing from index.html');

createRoot(host).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
);
