import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const map = fs.readFileSync(path.join(root, "src/MapsWorkspace.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/maps.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");

assert.match(app, /import MapsWorkspace from "\.\/MapsWorkspace"/, "the existing Maps workspace must remain the app's map entry point");
assert.match(map, /three\.module\.js/, "Cosmic Earth must load a real 3D rendering engine");
assert.match(map, /SphereGeometry\(2, 96, 96\)/, "the map must render a 3D Earth sphere");
assert.match(map, /earth_atmos_2048\.jpg/, "the globe must load a global Earth surface texture");
assert.match(map, /PointerCapture|setPointerCapture/, "the globe must support touch and pointer rotation");
assert.match(map, /navigator\.geolocation\.getCurrentPosition/, "GPS locate must remain available");
assert.match(map, /navigator\.geolocation\.watchPosition/, "live GPS tracking must remain available");
assert.match(map, /nominatim\.openstreetmap\.org\/search/, "destination search must remain available");
assert.match(map, /router\.project-osrm\.org\/route/, "road route preview must remain available");
assert.match(map, /ZoomIn|ZoomOut/, "zoom controls must be present");
assert.match(map, /Holographic grid mode/, "the map must offer a holographic surface mode");
assert.match(css, /\.cosmos-viewport/, "the replacement map must have a responsive 3D viewport");
assert.doesNotMatch(map, /loadLeaflet|tile\.openstreetmap\.org|maps\.google\.com/, "the old flat map and iframe fallback must be removed from the primary Maps workspace");

console.log("AURORA Cosmic Earth replacement tests passed.");
