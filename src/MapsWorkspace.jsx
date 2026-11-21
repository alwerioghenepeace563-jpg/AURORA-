import "./maps.css";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LocateFixed, MapPinned, Navigation, Search, Satellite, Route, Clock3, Globe2, Layers3, RotateCcw, Mountain, Volume2, VolumeX, Play, Pause } from "lucide-react";

const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css";
const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js";
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (window.__auroraMapLibrePromise) return window.__auroraMapLibrePromise;
  window.__auroraMapLibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-aurora-maplibre]')) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = MAPLIBRE_CSS; link.dataset.auroraMaplibre = "true"; document.head.appendChild(link);
    }
    let script = document.querySelector('script[data-aurora-maplibre]');
    if (script) { script.addEventListener("load", () => resolve(window.maplibregl), { once: true }); script.addEventListener("error", reject, { once: true }); return; }
    script = document.createElement("script"); script.src = MAPLIBRE_JS; script.async = true; script.dataset.auroraMaplibre = "true";
    script.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error("3D map engine did not initialise."));
    script.onerror = () => reject(new Error("3D map engine could not load. Check your internet connection."));
    document.head.appendChild(script);
  });
  return window.__auroraMapLibrePromise;
}
const STREET_STYLE = {
  version: 8,
  sources: {
    auroraStreet: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" }
  },
  layers: [{ id: "aurora-street", type: "raster", source: "auroraStreet", paint: { "raster-opacity": 1 } }]
};
const TERRAIN_SOURCE = { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: "© AWS Terrain Tiles" };
const SATELLITE_SOURCE = {
  type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19,
  attribution: "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
};

function distanceMetres(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const lat1 = rad(a[1]), lat2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function maneuverInstruction(step) {
  const maneuver = step?.maneuver || {};
  const modifier = String(maneuver.modifier || "").replace(/_/g, " ");
  const road = step?.name ? " onto " + step.name : "";
  const type = maneuver.type || "continue";
  if (type === "arrive") return "You have arrived at your destination.";
  if (type === "depart") return "Start your journey" + (step?.name ? " on " + step.name : "") + ".";
  if (type === "roundabout" || type === "rotary") return "Enter the roundabout" + (maneuver.exit ? " and take exit " + maneuver.exit : "") + road + ".";
  if (type === "merge") return "Merge " + (modifier || "ahead") + road + ".";
  if (type === "fork" || type === "on ramp" || type === "off ramp") return "Keep " + (modifier || "going") + road + ".";
  if (type === "turn" || type === "end of road" || type === "new name") return "Turn " + (modifier || "ahead") + road + ".";
  if (type === "continue" || type === "notification") return "Continue " + (modifier || "ahead") + road + ".";
  return "Continue your route" + road + ".";
}
export default function MapsWorkspace() {
  const mapNodeRef = useRef(null), mapRef = useRef(null), routeRef = useRef(null), userMarkerRef = useRef(null), destinationMarkerRef = useRef(null), watchIdRef = useRef(null), stepIndexRef = useRef(0);
  const [mapReady, setMapReady] = useState(false), [mapError, setMapError] = useState(""), [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false), [location, setLocation] = useState(null), [routeInfo, setRouteInfo] = useState(null);
  const [tracking, setTracking] = useState(false), [mode, setMode] = useState("street");
  const [terrainEnabled, setTerrainEnabled] = useState(true), [guidanceActive, setGuidanceActive] = useState(false), [voiceGuidance, setVoiceGuidance] = useState(true), [stepIndex, setStepIndex] = useState(0);
  const [notice, setNotice] = useState("Drag the Earth to rotate it. Zoom in to explore real streets and places.");

  useEffect(() => {
    let cancelled = false;
    loadMapLibre().then((gl) => {
      if (cancelled || !mapNodeRef.current || mapRef.current) return;
      const map = new gl.Map({
        container: mapNodeRef.current, style: STREET_STYLE, center: [8.6753, 9.082], zoom: 0.5,
        projection: "globe", attributionControl: true, renderWorldCopies: false,
        pitch: 0, bearing: 0, maxPitch: 75, minZoom: 0.3, maxZoom: 19,
        canvasContextAttributes: { antialias: true }
      });
      map.addControl(new gl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.on("load", () => {
        if (cancelled) return;
        map.setFog({ color: "rgb(5, 12, 27)", "high-color": "rgb(12, 42, 76)", "space-color": "rgb(2, 5, 14)", "star-intensity": 0.75 });
        map.addSource("auroraTerrain", TERRAIN_SOURCE);
        map.setTerrain({ source: "auroraTerrain", exaggeration: 1.15 });
        map.addLayer({ id: "aurora-hillshade", type: "hillshade", source: "auroraTerrain", paint: { "hillshade-exaggeration": 0.22, "hillshade-shadow-color": "#14253b", "hillshade-highlight-color": "#9db8ce" } });
        setMapReady(true);
      });
      map.on("error", (event) => { if (event?.error && !mapReady) setMapError("Some map tiles could not load. Check your connection and try again."); });
      mapRef.current = map;
    }).catch(error => setMapError(error.message || "The 3D Earth map could not load."));
    return () => {
      cancelled = true;
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
      mapRef.current?.remove(); mapRef.current = null; setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const timer = setTimeout(() => map.resize(), 100);
    return () => clearTimeout(timer);
  }, [mapReady]);

  function setMapLayer(nextMode) {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const hasSatellite = !!map.getSource("auroraSatellite");
    if (nextMode === "satellite" && !hasSatellite) {
      map.addSource("auroraSatellite", SATELLITE_SOURCE);
      map.addLayer({ id: "aurora-satellite", type: "raster", source: "auroraSatellite", paint: { "raster-opacity": 1 } });
      map.setLayoutProperty("aurora-street", "visibility", "none");
    } else if (nextMode === "street") {
      if (hasSatellite) map.setLayoutProperty("aurora-satellite", "visibility", "none");
      map.setLayoutProperty("aurora-street", "visibility", "visible");
    } else if (hasSatellite) {
      map.setLayoutProperty("aurora-satellite", "visibility", "visible");
      map.setLayoutProperty("aurora-street", "visibility", "none");
    }
    setMode(nextMode);
    setNotice(nextMode === "satellite" ? "Satellite imagery layer active. Imagery availability and freshness vary by location." : "Real street map active. Zoom in to inspect roads, labels and places.");
  }

  function setTerrain(enabled) {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource("auroraTerrain")) return;
    map.setTerrain(enabled ? { source: "auroraTerrain", exaggeration: 1.15 } : null);
    if (map.getLayer("aurora-hillshade")) map.setLayoutProperty("aurora-hillshade", "visibility", enabled ? "visible" : "none");
    setTerrainEnabled(enabled);
    setNotice(enabled ? "3D elevation terrain enabled where elevation tiles are available." : "Terrain relief is off; the 3D Earth and map layers remain active.");
  }

  function speakInstruction(step) {
    if (!voiceGuidance || !("speechSynthesis" in window) || !step) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(maneuverInstruction(step));
    utterance.rate = 0.92; utterance.pitch = 0.95; utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  function stopGuidance() {
    if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
    watchIdRef.current = null; setGuidanceActive(false); setTracking(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setNotice("Turn guidance stopped.");
  }

  function startGuidance() {
    if (!routeInfo?.steps?.length) { setNotice("Search a destination from your GPS location to get a step-by-step route first."); return; }
    if (!navigator.geolocation) { setNotice("GPS is not supported on this device."); return; }
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    stepIndexRef.current = 0; setStepIndex(0); setGuidanceActive(true); setTracking(true);
    speakInstruction(routeInfo.steps[0]);
    watchIdRef.current = navigator.geolocation.watchPosition(position => {
      const point = [position.coords.longitude, position.coords.latitude];
      setLocation({ lon: point[0], lat: point[1] }); updateMarker(point);
      mapRef.current?.easeTo({ center: point, duration: 500 });
      const nextIndex = stepIndexRef.current + 1;
      const nextStep = routeInfo.steps[nextIndex];
      if (nextStep?.maneuver?.location && distanceMetres(point, nextStep.maneuver.location) < 45) {
        stepIndexRef.current = nextIndex; setStepIndex(nextIndex); speakInstruction(nextStep);
        if (nextStep.maneuver.type === "arrive" || nextIndex === routeInfo.steps.length - 1) {
          setNotice("You have reached the end of the route.");
          setGuidanceActive(false); setTracking(false);
          if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      }
    }, error => {
      setGuidanceActive(false); setTracking(false);
      setNotice(error.code === 1 ? "Location permission was denied. Turn-by-turn guidance needs GPS permission." : "GPS guidance lost its location signal.");
    }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 15000 });
    setNotice("Turn-by-turn guidance started. Keep the app open and follow road signs.");
  }

  function updateMarker(point) {
    const map = mapRef.current, gl = window.maplibregl;
    if (!map || !gl) return;
    if (!userMarkerRef.current) {
      const element = document.createElement("div"); element.className = "aurora-user-marker";
      userMarkerRef.current = new gl.Marker({ element }).setLngLat(point).setPopup(new gl.Popup({ offset: 18 }).setText("Your current location")).addTo(map);
    } else userMarkerRef.current.setLngLat(point);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("This device or browser does not support GPS location."); return; }
    setNotice("Requesting location permission…");
    navigator.geolocation.getCurrentPosition(position => {
      const point = [position.coords.longitude, position.coords.latitude];
      setLocation({ lon: point[0], lat: point[1] }); updateMarker(point);
      mapRef.current?.flyTo({ center: point, zoom: 15, pitch: 48, essential: true });
      setNotice("Your location is shown on the real map. GPS accuracy depends on your device and signal.");
    }, error => setNotice(error.code === 1 ? "Location permission was denied. Allow it in device settings and try again." : "Could not get your location. Check GPS and internet, then try again."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }

  function toggleTracking() {
    if (tracking) { if (guidanceActive) { stopGuidance(); return; } if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current); watchIdRef.current = null; setTracking(false); setNotice("Live GPS tracking stopped."); return; }
    if (!navigator.geolocation) { setNotice("Live GPS is not supported on this device."); return; }
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(position => {
      const point = [position.coords.longitude, position.coords.latitude]; setLocation({ lon: point[0], lat: point[1] }); updateMarker(point);
      if (!routeRef.current) mapRef.current?.easeTo({ center: point, duration: 700 });
    }, error => { setTracking(false); setNotice(error.code === 1 ? "Location permission was denied." : "Live GPS update failed. Check your signal."); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    setNotice("Live GPS is updating while the map page remains open.");
  }

  async function searchDestination(event) {
    event?.preventDefault();
    const query = destination.trim();
    if (!query) { setNotice("Enter a place or destination first."); return; }
    setBusy(true); setRouteInfo(null); setNotice("Searching real-world places…");
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Place search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length) throw new Error("I couldn't find that place. Try adding its city or state.");
      const target = { lon: Number(results[0].lon), lat: Number(results[0].lat), label: results[0].display_name };
      const map = mapRef.current, gl = window.maplibregl;
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      destinationMarkerRef.current = new gl.Marker({ color: "#ffca73" }).setLngLat([target.lon, target.lat]).setPopup(new gl.Popup({ offset: 22 }).setText(target.label)).addTo(map);
      if (location) {
        const routeResponse = await fetch("https://router.project-osrm.org/route/v1/driving/" + location.lon + "," + location.lat + ";" + target.lon + "," + target.lat + "?overview=full&geometries=geojson&steps=true", { signal: AbortSignal.timeout(15000) });
        if (routeResponse.ok) {
          const data = await routeResponse.json(), route = data.routes?.[0];
          if (route) {
            if (map.getLayer("aurora-route-line")) map.removeLayer("aurora-route-line");
            if (map.getSource("aurora-route")) map.removeSource("aurora-route");
            map.addSource("aurora-route", { type: "geojson", data: route.geometry });
            map.addLayer({ id: "aurora-route-line", type: "line", source: "aurora-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#4dd8ff", "line-width": 5, "line-opacity": 0.95 } });
            routeRef.current = true;
            const coordinates = route.geometry.coordinates;
            const bounds = coordinates.reduce((b, p) => b.extend(p), new gl.LngLatBounds(coordinates[0], coordinates[0]));
            map.fitBounds(bounds, { padding: 65, maxZoom: 15, pitch: 42, duration: 1100 });
            const steps = (route.legs || []).flatMap(leg => leg.steps || []).filter(step => step.maneuver);
            stepIndexRef.current = 0; setStepIndex(0); setGuidanceActive(false);
            setRouteInfo({ distance: route.distance, duration: route.duration, target, steps });
            setNotice("Road route displayed on the Earth map. ETA is an estimate; follow road signs and local guidance.");
            return;
          }
        }
      }
      map.flyTo({ center: [target.lon, target.lat], zoom: 14, pitch: 45, essential: true });
      setRouteInfo({ target }); setNotice("Place found. Use My Location to calculate a road route from your position.");
    } catch (error) {
      setNotice(error.name === "TimeoutError" || error.name === "AbortError" ? "The map service took too long. Please try again." : error.message || "Could not find that place.");
    } finally { setBusy(false); }
  }

  function resetEarth() {
    mapRef.current?.flyTo({ center: [8.6753, 9.082], zoom: 0.5, pitch: 0, bearing: 0, duration: 1000 });
    setNotice("Back to the full 3D Earth. Drag to rotate the globe in any direction.");
  }
  const fmtDistance = metres => metres >= 1000 ? (metres / 1000).toFixed(1) + " km" : Math.round(metres) + " m";
  const fmtDuration = seconds => { const mins = Math.round(seconds / 60); return mins >= 60 ? Math.floor(mins / 60) + " hr " + (mins % 60) + " min" : mins + " min"; };

  return <section className="utility-page aurora-maps-page">
    <div className="maps-heading"><div><p className="panel-eyebrow"><Globe2 size={14}/> AURORA EARTH NAVIGATION</p><h1>Explore Earth<span>.</span></h1><p className="utility-intro">One living globe, from orbit to real streets.</p></div><span className={"maps-live-badge " + (tracking ? "is-live" : "")}><i/>{tracking ? "GPS LIVE" : "3D EARTH"}</span></div>
    <div className="maps-earth-shell">
      <div className="maps-map-frame">
        <div ref={mapNodeRef} className="maps-globe-map" aria-label="Interactive 3D Earth map. Drag to rotate, pinch or scroll to zoom." />
        {!mapReady && !mapError && <div className="maps-loading"><span className="mini-loader"/> Preparing the 3D Earth…</div>}
        {mapError && <div className="maps-error">{mapError}<button type="button" className="outline-action" onClick={() => window.location.reload()}>Reload Earth</button></div>}
        <div className="maps-globe-topline"><span><i/> LIVE GEOGRAPHIC MAP</span><span>DRAG · ROTATE · ZOOM</span></div>
        <button type="button" className="maps-earth-reset" onClick={resetEarth} aria-label="Return to full Earth"><RotateCcw size={15}/> Full Earth</button>
        <button type="button" className="maps-locate-overlay" onClick={useCurrentLocation}><LocateFixed size={16}/> My location</button>
        <div className="maps-map-caption">3D globe projection · Real OpenStreetMap data · {mode === "satellite" ? "Esri satellite imagery" : "Street layer"}</div>
      </div>
      <aside className="maps-controls">
        <form className="maps-search" onSubmit={searchDestination}><Search size={18}/><input value={destination} onChange={event => setDestination(event.target.value)} placeholder="Search any place on Earth…" aria-label="Search destination"/><button type="submit" disabled={busy} aria-label="Search place">{busy ? <span className="mini-loader"/> : <Navigation size={17}/>}</button></form>
        <div className="maps-layer-label"><Layers3 size={14}/> MAP LAYERS</div>
        <div className="maps-mode-row"><button type="button" className={mode === "street" ? "maps-mode-active" : ""} onClick={() => setMapLayer("street")}><MapPinned size={15}/> Street</button><button type="button" className={mode === "satellite" ? "maps-mode-active" : ""} onClick={() => setMapLayer("satellite")}><Satellite size={15}/> Satellite</button></div>
        <button type="button" className={"maps-action " + (terrainEnabled ? "maps-action-active" : "")} onClick={() => setTerrain(!terrainEnabled)}><Mountain size={17}/><span><strong>{terrainEnabled ? "3D terrain enabled" : "Enable 3D terrain"}</strong><small>Elevation relief from AWS Terrain Tiles</small></span></button>
        <button type="button" className="maps-action" onClick={useCurrentLocation}><LocateFixed size={17}/><span><strong>Use my location</strong><small>Fly from Earth to your GPS position</small></span></button>
        <button type="button" className={"maps-action " + (tracking ? "maps-action-active" : "")} onClick={toggleTracking}><span className="maps-pulse-dot"/><span><strong>{tracking ? "Stop live GPS" : "Live GPS tracking"}</strong><small>{tracking ? "Updates while this page is open" : "Requires location permission"}</small></span></button>
        {routeInfo && <div className="maps-route-card"><p className="panel-eyebrow">DESTINATION</p><strong>{routeInfo.target.label}</strong>{routeInfo.distance != null && <div className="maps-route-stats"><span><Route size={15}/>{fmtDistance(routeInfo.distance)}</span><span><Clock3 size={15}/>{fmtDuration(routeInfo.duration)}</span></div>}{routeInfo.steps?.length > 0 && <div className="maps-guidance-controls"><button type="button" onClick={guidanceActive ? stopGuidance : startGuidance}>{guidanceActive ? <Pause size={14}/> : <Play size={14}/>} {guidanceActive ? "Stop guidance" : "Start guidance"}</button><button type="button" aria-label={voiceGuidance ? "Mute voice guidance" : "Enable voice guidance"} onClick={() => { setVoiceGuidance(!voiceGuidance); if (voiceGuidance && "speechSynthesis" in window) window.speechSynthesis.cancel(); }} >{voiceGuidance ? <Volume2 size={15}/> : <VolumeX size={15}/>}</button></div>}{routeInfo.steps?.length > 0 && <div className="maps-turn-list"><strong>Next directions</strong>{routeInfo.steps.slice(stepIndex, stepIndex + 4).map((step, index) => <div className={"maps-turn-step " + (index === 0 ? "is-current" : "")} key={stepIndex + index}><span>{step.maneuver?.type === "arrive" ? "◎" : index + stepIndex + 1}</span><div><b>{maneuverInstruction(step)}</b><small>{fmtDistance(step.distance || 0)}</small></div></div>)}</div>}<small>OSRM road guidance is an estimate, not a substitute for signs or safe driving decisions.</small></div>}
        <p className="maps-note" role="status" aria-live="polite">{notice}</p>
        <button type="button" className="maps-reset-action" onClick={resetEarth}><ArrowLeft size={14}/> Return to full Earth</button>
      </aside>
    </div>
    <div className="maps-disclaimer">The globe is the actual interactive map. Street tiles, satellite imagery, AWS elevation tiles, Nominatim place search and OSRM route instructions are external services with coverage and usage limits. Voice guidance uses the device speech engine and requires this page to stay open with GPS permission. Live traffic is not enabled because it requires a separate traffic-data provider credential; this map does not replace road signs or safe navigation judgment.</div>
  </section>;
}
