GC Buildings Map (static build)

Opening
  Unzip and double-click index.html. A network is needed: the MapLibre script comes from jsDelivr and the basemap tiles from OpenFreeMap.
  If the map is blank or shows a load failure, open a terminal in this folder and run
      python3 -m http.server 3000
  then open http://localhost:3000 in a browser.

Contents
  Handout C3 §6 has 161 rows and 172 map markers.
  153 markers come from Wikipedia and 2 from other web pages (named in the note); all are marked "Supplementary - to be verified" and the detail panel links to the source.
  17 markers are memory estimates (semi-transparent on the map, marked "unverified" in the detail panel) with no source; check each one.
  Every row has a coordinate.

Publishing
  The whole folder can go on any static host (Cloudflare Pages, Netlify, GitHub Pages).
  Once published, anyone who knows the URL can open it. noindex and robots.txt are included, but that is not confidentiality;
  to restrict access, use the host's access control (for example Cloudflare Access).

Updating the data
  This folder is a generated snapshot. After the data changes, run npm run site in the project root to regenerate it.
