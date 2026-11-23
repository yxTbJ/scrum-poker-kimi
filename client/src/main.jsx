import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyStoredTheme } from './ThemeToggle.jsx';
import './styles.css';

applyStoredTheme();

createRoot(document.getElementById('root')).render(<App />);
