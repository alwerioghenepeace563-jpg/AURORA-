import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const map = fs.readFileSync(path.join(root, "src/MapsWorkspace.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/maps.css"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");

assert.match(app, /import MapsWorkspace from "\.\/MapsWorkspace"/, "the existing Maps workspace must remain the app map entry point");
assert.match(map, /loadLeaflet/, "the actual interactive map engine must load");
assert.match(map, /tileLayer\("https:\/\/tile\.openstreetmap\.org\//, "real street-map tiles must render");
assert.match(map, /nominatim\.openstreetmap\.org\/search/, "place search must use real geocoding");
assert.match(map, /router\.project-osrm\.org\/route/, "road route geometry must be requested");
assert.match(map, /L\.geoJSON\(route\.geometry/, "the route must render on the street map");
assert.match(map, /navigator\.geolocation\.getCurrentPosition/, "one-shot GPS location must be available");
assert.match(map, /navigator\.geolocation\.watchPosition/, "foreground live GPS tracking must be available");
assert.match(map, /maps\.google\.com\/maps\?q=/, "satellite imagery mode must be available");
assert.match(map, /googleView === "satellite"/, "the satellite layer switch must be available");
assert.match(css, /\.maps-leaflet-map/, "the actual map surface must have layout styling");
assert.match(css, /\.maps-google-embed/, "satellite map mode must have responsive layout styling");
assert.doesNotMatch(map, /three\.module\.js|SphereGeometry/, "the primary map must not be only a decorative globe");

console.log("AURORA real interactive map tests passed.");
