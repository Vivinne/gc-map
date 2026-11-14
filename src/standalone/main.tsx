// Entry for the single-file build (scripts/build-standalone.ts): the same App, bundled by esbuild into one HTML file
import '@fontsource-variable/archivo/wdth.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../app/globals.css';
import { createRoot } from 'react-dom/client';
import App from '../components/App';

createRoot(document.getElementById('root')!).render(<App />);
