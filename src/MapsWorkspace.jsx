import "./maps.css";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LocateFixed, MapPinned, Navigation, Search, Satellite, ExternalLink, Route, Clock3, Mountain, Layers3, Globe2 } from "lucide-react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const GLOBE_JS = "https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js";
const EARTH_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_BUMP = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";
const EARTH_SKY = "https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png";

function loadGlobeLibrary() {
  if (window.Globe) return Promise.resolve(window.Globe);
  if (window.__auroraGlobePromise) return window.__auroraGlobePromise;
  window.__auroraGlobePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GLOBE_JS;
    script.async = true;
    script.onload = () => window.Globe ? resolve(window.Globe) : reject(new Error("3D Earth could not initialise."));
    script.onerror = () => reject(new Error("3D Earth library could not load. Check your internet connection."));
    document.head.appendChild(script);
  }).catch((error) => {
    window.__auroraGlobePromise = null;
    throw error;
  });
  return window.__auroraGlobePromise;
}
const TILE_SOURCES = {
  street: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>', maxZoom: 19 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics and contributors", maxZoom: 19 },
  terrain: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 },
  hybrid: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics; labels &copy; Esri", maxZoom: 19 }
};

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.__auroraLeafletPromise) return window.__auroraLeafletPromise;
  window.__auroraLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-aurora-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS; link.dataset.auroraLeaflet = "true";
      document.head.appendChild(link);
    }
    let script = document.querySelector('script[data-aurora-leaflet]');
    if (script) {
      script.addEventListener("load", () => resolve(window.L), { once: true });
      script.addEventListener("error", reject, { once: true });
      return;
    }
    script = document.createElement("script"); script.src = LEAFLET_JS; script.async = true;
    script.dataset.auroraLeaflet = "true";
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Map library did not initialise."));
    script.onerror = () => reject(new Error("Map library could not load. Check your internet connection."));
    document.head.appendChild(script);
  });
  return window.__auroraLeafletPromise;
}

export default function MapsWorkspace() {
  const mapNodeRef = useRef(null), mapRef = useRef(null), tileLayerRef = useRef(null), labelLayerRef = useRef(null);
  const routeLayerRef = useRef(null), userMarkerRef = useRef(null), destinationMarkerRef = useRef(null), watchIdRef = useRef(null);
  const earthNodeRef = useRef(null), earthInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false), [mapError, setMapError] = useState("");
  const [destination, setDestination] = useState(""), [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(null), [routeInfo, setRouteInfo] = useState(null);
  const [tracking, setTracking] = useState(false), [notice, setNotice] = useState("Search for a destination or use your current location to begin.");
  const [mode, setMode] = useState("street"), [googleView, setGoogleView] = useState("");
  const [earth3D, setEarth3D] = useState(false), [earthReady, setEarthReady] = useState(false), [earthError, setEarthError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !mapNodeRef.current || mapRef.current) return;
      const map = L.map(mapNodeRef.current, { zoomControl: false, preferCanvas: true }).setView([9.0820, 8.6753], 6);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      tileLayerRef.current = L.tileLayer(TILE_SOURCES.street.url, { maxZoom: TILE_SOURCES.street.maxZoom, attribution: TILE_SOURCES.street.attribution }).addTo(map);
      mapRef.current = map; setMapReady(true); setTimeout(() => map.invalidateSize(), 150);
    }).catch((error) => setMapError(error.message || "The map could not load."));
    return () => {
      cancelled = true;
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
      mapRef.current?.remove(); mapRef.current = null; tileLayerRef.current = null; labelLayerRef.current = null; setMapReady(false);
    };
  }, [googleView]);

  useEffect(() => {
    if (!earth3D || !earthNodeRef.current) return;
    let cancelled = false;
    let resizeObserver;
    loadGlobeLibrary().then((Globe) => {
      if (cancelled || !earthNodeRef.current) return;
      const container = earthNodeRef.current;
      const globe = new Globe(container, { rendererConfig: { antialias: false, alpha: true }, animateIn: true })
        .globeImageUrl(EARTH_TEXTURE)
        .bumpImageUrl(EARTH_BUMP)
        .backgroundImageUrl(EARTH_SKY)
        .backgroundColor("#020713")
        .showAtmosphere(true)
        .atmosphereColor("#55b9ff")
        .atmosphereAltitude(0.16)
        .showGraticules(false)
        .pointLat("lat")
        .pointLng("lng")
        .pointAltitude("altitude")
        .pointRadius("radius")
        .pointColor("color")
        .pointResolution(12)
        .pointsMerge(true)
        .enablePointerInteraction(true);
      earthInstanceRef.current = globe;
      globe.width(Math.max(280, container.clientWidth || 600));
      globe.height(Math.max(380, container.clientHeight || 600));
      globe.pointsData([
        ...(location ? [{ lat: location.lat, lng: location.lon, altitude: 0.018, radius: 0.42, color: "#4fe3ff" }] : []),
        ...(routeInfo?.target ? [{ lat: routeInfo.target.lat, lng: routeInfo.target.lon, altitude: 0.025, radius: 0.52, color: "#ffc66d" }] : [])
      ]);
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.28;
      globe.pointOfView(
        routeInfo?.target
          ? { lat: routeInfo.target.lat, lng: routeInfo.target.lon, altitude: 1.9 }
          : location
            ? { lat: location.lat, lng: location.lon, altitude: 2.2 }
            : { lat: 9.082, lng: 8.6753, altitude: 2.6 },
        900
      );
      globe.onGlobeClick(({ lat, lng }) => setNotice("Globe coordinates: " + lat.toFixed(3) + ", " + lng.toFixed(3) + "."));
      resizeObserver = new ResizeObserver(() => {
        if (!cancelled && earthNodeRef.current) {
          globe.width(Math.max(280, earthNodeRef.current.clientWidth || 600));
          globe.height(Math.max(380, earthNodeRef.current.clientHeight || 600));
        }
      });
      resizeObserver.observe(container);
      setEarthReady(true);
      setNotice("AURORA 3D Earth is ready. Drag to rotate and pinch or scroll to zoom.");
    }).catch((error) => {
      if (!cancelled) {
        setEarthError(error.message || "3D Earth could not load.");
        setNotice("AURORA 3D Earth could not load. Check your connection and retry.");
      }
    });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const globe = earthInstanceRef.current;
      if (globe) {
        globe._destructor?.();
        earthInstanceRef.current = null;
      }
      if (earthNodeRef.current) earthNodeRef.current.replaceChildren();
    };
  }, [earth3D]);

  useEffect(() => {
    if (!earth3D || !earthInstanceRef.current) return;
    const points = [
      ...(location ? [{ lat: location.lat, lng: location.lon, altitude: 0.018, radius: 0.42, color: "#4fe3ff" }] : []),
      ...(routeInfo?.target ? [{ lat: routeInfo.target.lat, lng: routeInfo.target.lon, altitude: 0.025, radius: 0.52, color: "#ffc66d" }] : [])
    ];
    earthInstanceRef.current.pointsData(points);
    if (routeInfo?.target) earthInstanceRef.current.pointOfView({ lat: routeInfo.target.lat, lng: routeInfo.target.lon, altitude: 1.9 }, 900);
    else if (location) earthInstanceRef.current.pointOfView({ lat: location.lat, lng: location.lon, altitude: 2.2 }, 900);
  }, [earth3D, location, routeInfo]);

  function centerEarthOnLocation() {
    if (!location || !earthInstanceRef.current) {
      setNotice("Use my location first to centre the 3D globe on this device.");
      return;
    }
    earthInstanceRef.current.pointOfView({ lat: location.lat, lng: location.lon, altitude: 1.8 }, 1000);
    setNotice("Centered the 3D globe on your current location.");
  }

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L) return;
    const L = window.L, source = TILE_SOURCES[mode] || TILE_SOURCES.street;
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    if (labelLayerRef.current) { mapRef.current.removeLayer(labelLayerRef.current); labelLayerRef.current = null; }
    tileLayerRef.current = L.tileLayer(source.url, { maxZoom: source.maxZoom, attribution: source.attribution }).addTo(mapRef.current);
    if (mode === "hybrid") {
      labelLayerRef.current = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, opacity: 0.95, attribution: "Place labels &copy; Esri"
      }).addTo(mapRef.current);
    }
    setNotice(mode === "street" ? "Street map active." : mode === "satellite" ? "Satellite imagery active." : mode === "terrain" ? "Terrain map active. Elevation shading is illustrative, not a live 3D elevation model." : "Hybrid imagery and place labels active.");
  }, [mapReady, mode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !location || !window.L) return;
    const point = [location.lat, location.lon];
    if (!userMarkerRef.current) userMarkerRef.current = window.L.circleMarker(point, { radius: 9, color: "#f5fcff", weight: 3, fillColor: "#27a9ff", fillOpacity: 1 }).addTo(mapRef.current).bindPopup("Your current location");
    else userMarkerRef.current.setLatLng(point);
    if (!routeLayerRef.current) mapRef.current.setView(point, 16);
  }, [mapReady, location]);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("This device or browser does not support location."); return; }
    setNotice("Requesting location permission…");
    navigator.geolocation.getCurrentPosition((position) => {
      const point = [position.coords.latitude, position.coords.longitude];
      setLocation({ lat: point[0], lon: point[1] });
      if (window.L && mapRef.current) {
        if (!userMarkerRef.current) userMarkerRef.current = window.L.circleMarker(point, { radius: 8, color: "#e9fbff", weight: 3, fillColor: "#37b9ff", fillOpacity: 1 }).addTo(mapRef.current).bindPopup("Your current location");
        else userMarkerRef.current.setLatLng(point);
        mapRef.current.setView(point, 16);
      }
      setNotice("Your current location is shown. Location access is controlled by your device.");
    }, (error) => setNotice(error.code === 1 ? "Location permission was denied. Allow location access in device settings and try again." : "Could not get your location. Check GPS and internet, then try again."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }

  function toggleTracking() {
    if (tracking) {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null; setTracking(false); setNotice("Live location tracking stopped."); return;
    }
    if (!navigator.geolocation) { setNotice("Live location is not supported by this device."); return; }
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition((position) => {
      const point = [position.coords.latitude, position.coords.longitude];
      setLocation({ lat: point[0], lon: point[1] });
      if (window.L && mapRef.current) {
        if (!userMarkerRef.current) userMarkerRef.current = window.L.circleMarker(point, { radius: 8, color: "#e9fbff", weight: 3, fillColor: "#37b9ff", fillOpacity: 1 }).addTo(mapRef.current).bindPopup("Your live location");
        else userMarkerRef.current.setLatLng(point);
        if (!routeLayerRef.current) mapRef.current.panTo(point);
      }
    }, (error) => { setTracking(false); setNotice(error.code === 1 ? "Location permission was denied." : "Live location update failed. Check GPS and try again."); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    setNotice("Live location tracking is on while this page is open.");
  }

  async function searchDestination(event) {
    event?.preventDefault();
    const query = destination.trim();
    if (!query) { setNotice("Enter a place or destination first."); return; }
    setBusy(true); setRouteInfo(null); setNotice("Finding destination…");
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }
    if (destinationMarkerRef.current) { destinationMarkerRef.current.remove(); destinationMarkerRef.current = null; }
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error("Destination search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length) throw new Error("I couldn't find that place. Try adding the city or state.");
      const target = { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
      const L = window.L;
      if (L && mapRef.current) {
        destinationMarkerRef.current = L.marker([target.lat, target.lon]).addTo(mapRef.current).bindPopup(target.label);
        destinationMarkerRef.current.openPopup();
      }
      if (location) {
        const routeResponse = await fetch("https://router.project-osrm.org/route/v1/driving/" + location.lon + "," + location.lat + ";" + target.lon + "," + target.lat + "?overview=full&geometries=geojson&steps=true", { signal: AbortSignal.timeout(12000) });
        if (routeResponse.ok) {
          const data = await routeResponse.json(), route = data.routes?.[0];
          if (route && L && mapRef.current) {
            routeLayerRef.current = L.geoJSON(route.geometry, { style: { color: "#35b9ff", weight: 6, opacity: .9, lineCap: "round", lineJoin: "round" } }).addTo(mapRef.current);
            mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [35, 35] });
            setRouteInfo({ distance: route.distance, duration: route.duration, target });
            setNotice("Route shown. Distance and ETA are estimates; follow road signs and local guidance."); return;
          }
        }
      }
      if (L && mapRef.current) mapRef.current.setView([target.lat, target.lon], 15);
      setRouteInfo({ target }); setNotice("Destination found. Use your location to calculate a route from where you are.");
    } catch (error) {
      setNotice(error.name === "TimeoutError" || error.name === "AbortError" ? "The map service took too long to respond. Please try again." : error.message || "Could not find that destination.");
    } finally { setBusy(false); }
  }

  function stopTracking() {
    if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null; setTracking(false);
  }
  function openGoogle(view) {
    stopTracking(); setEarth3D(false); setGoogleView(view);
    setNotice(view === "streetview" ? "Opening Google Street View where imagery is available…" : "Opening Google Maps directions…");
  }
  function googleEmbedUrl() {
    const query = destination.trim() || (location ? location.lat + "," + location.lon : "Nigeria");
    if (googleView === "streetview") return "https://maps.google.com/maps?q=" + encodeURIComponent(query) + "&layer=c&output=embed";
    const origin = location ? location.lat + "," + location.lon : "Nigeria";
    return "https://maps.google.com/maps?saddr=" + encodeURIComponent(origin) + "&daddr=" + encodeURIComponent(destination.trim() || query) + "&output=embed";
  }
  function openEarth3D() {
    setGoogleView("");
    setEarthError("");
    setEarthReady(false);
    setEarth3D(true);
    setNotice("Loading AURORA 3D Earth…");
  }
  const fmtDistance = (metres) => metres >= 1000 ? (metres / 1000).toFixed(1) + " km" : Math.round(metres) + " m";
  const fmtDuration = (seconds) => { const mins = Math.round(seconds / 60); return mins >= 60 ? Math.floor(mins / 60) + " hr " + (mins % 60) + " min" : mins + " min"; };

  return <section className="utility-page aurora-maps-page">
    <div className="maps-heading"><div><p className="panel-eyebrow"><MapPinned size={14}/> AURORA EARTH & NAVIGATION</p><h1>Maps<span>.</span></h1><p className="utility-intro">Explore the world, switch map layers, find places and plan journeys.</p></div><span className={"maps-live-badge " + (tracking ? "is-live" : "")}><i/>{tracking ? "LOCATION LIVE" : "MAP READY"}</span></div>
    <div className="maps-workspace">
      <aside className="maps-controls">
        <form className="maps-search" onSubmit={searchDestination}><Search size={18}/><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Search a place, address or landmark" aria-label="Destination"/><button type="submit" disabled={busy} aria-label="Search destination">{busy ? <span className="mini-loader"/> : <Navigation size={17}/>}</button></form>
        <button type="button" className="maps-action" onClick={useCurrentLocation}><LocateFixed size={17}/><span><strong>Use my location</strong><small>Center the map on this device</small></span></button>
        <button type="button" className={"maps-action " + (tracking ? "maps-action-active" : "")} onClick={toggleTracking}><span className="maps-pulse-dot"/><span><strong>{tracking ? "Stop live location" : "Live location tracking"}</strong><small>{tracking ? "Updates while this page is open" : "Requires location permission"}</small></span></button>
        <p className="maps-layer-label"><Layers3 size={14}/> MAP LAYERS</p>
        <div className="maps-layer-grid">
          <button type="button" className={mode === "street" ? "maps-layer-active" : ""} onClick={() => { setEarth3D(false); setGoogleView(""); setMode("street"); }}><MapPinned size={16}/>Street</button>
          <button type="button" className={mode === "satellite" ? "maps-layer-active" : ""} onClick={() => { setEarth3D(false); setGoogleView(""); setMode("satellite"); }}><Satellite size={16}/>Satellite</button>
          <button type="button" className={mode === "hybrid" ? "maps-layer-active" : ""} onClick={() => { setEarth3D(false); setGoogleView(""); setMode("hybrid"); }}><Layers3 size={16}/>Hybrid</button>
          <button type="button" className={mode === "terrain" ? "maps-layer-active" : ""} onClick={() => { setEarth3D(false); setGoogleView(""); setMode("terrain"); }}><Mountain size={16}/>Terrain</button>
        </div>
        <button type="button" className="maps-action" onClick={openEarth3D}><Globe2 size={17}/><span><strong>{earth3D ? "3D Earth is active" : "Explore in 3D Earth"}</strong><small>Interactive globe with terrain relief inside AURORA</small></span></button>
        <button type="button" className="maps-action" onClick={() => openGoogle("streetview")}><ExternalLink size={17}/><span><strong>Street-level view</strong><small>Google imagery where available</small></span><ArrowLeft size={14} style={{transform:"rotate(135deg)"}}/></button>
        <button type="button" className="maps-action" onClick={() => openGoogle("directions")}><Route size={17}/><span><strong>Google Maps directions</strong><small>Traffic and full navigation</small></span><ExternalLink size={14}/></button>
        {routeInfo && <div className="maps-route-card"><p className="panel-eyebrow">DESTINATION</p><strong>{routeInfo.target.label}</strong>{routeInfo.distance != null && <div className="maps-route-stats"><span><Route size={15}/>{fmtDistance(routeInfo.distance)}</span><span><Clock3 size={15}/>{fmtDuration(routeInfo.duration)}</span></div>}<small>Routing uses a public demo service and may be limited or unavailable.</small></div>}
        <p className="maps-note" role="status">{notice}</p>
      </aside>
      <div className="maps-map-frame">{googleView ? <><iframe key={googleView + ":" + destination + ":" + (location ? location.lat + "," + location.lon : "no-location")} className="maps-google-embed" src={googleEmbedUrl()} title={googleView === "streetview" ? "Google Maps street-level view" : "Google Maps directions"} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade"/><button type="button" className="maps-return-map" onClick={() => { setGoogleView(""); setNotice("Returned to AURORA map layers."); }}><MapPinned size={14}/> AURORA Map</button><a className="maps-open-full" href={googleEmbedUrl().replace("&output=embed","")} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Open full map</a></> : earth3D ? <><div ref={earthNodeRef} className="maps-earth-canvas" aria-label="Interactive three-dimensional Earth globe"/>{!earthReady && !earthError && <div className="maps-earth-loading"><span className="mini-loader"/> Loading AURORA 3D Earth…</div>}{earthError && <div className="maps-earth-loading maps-earth-error">{earthError}<button type="button" className="outline-action" onClick={() => window.location.reload()}>Reload AURORA</button></div>}<div className="maps-earth-caption"><Globe2 size={13}/> AURORA 3D EARTH · drag to rotate · pinch to zoom</div><button type="button" className="maps-return-map" onClick={() => { setEarth3D(false); setNotice("Returned to AURORA map layers."); }}><MapPinned size={14}/> 2D Map</button><button type="button" className="maps-earth-locate" onClick={centerEarthOnLocation}><LocateFixed size={15}/> My location</button></> : <><div ref={mapNodeRef} className="maps-leaflet-map" aria-label="Interactive map"/>{!mapReady && !mapError && <div className="maps-loading"><span className="mini-loader"/> Loading interactive map…</div>}{mapError && <div className="maps-error">{mapError}<button type="button" className="outline-action" onClick={() => window.location.reload()}>Reload map</button></div>}<div className="maps-map-caption">{mode === "street" ? "Street map" : mode === "satellite" ? "Satellite imagery" : mode === "hybrid" ? "Satellite + place labels" : "Terrain"} · AURORA Maps</div></>}</div>
    </div>
    <div className="maps-disclaimer">AURORA includes street, satellite, hybrid and terrain layers plus an in-app interactive 3D globe with terrain relief. The globe uses a static Earth texture, not live satellite imagery or detailed 3D city buildings. Live tracking runs only while this map page is active.</div>
  </section>;
}
