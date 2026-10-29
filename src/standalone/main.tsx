// Entry for the static single-page build: mounts MapApp directly, without Next.js. MapLibre is loaded by index.html through a <script> tag (window.maplibregl).
import { createRoot } from 'react-dom/client';
import MapApp from '../components/MapApp';

createRoot(document.getElementById('root') as HTMLElement).render(<MapApp />);
