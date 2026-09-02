/* Mocklane dashboard · rspack 入口（薄） */
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './app/App.jsx';

createRoot(document.getElementById('root')).render(<App />);
