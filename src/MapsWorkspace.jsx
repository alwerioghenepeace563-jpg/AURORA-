import { useEffect, useRef, useState } from "react";
import { ArrowLeft, LocateFixed, MapPinned, Navigation, Search, Satellite, ExternalLink, Route, Clock3 } from "lucide-react";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.__auroraLeafletPromise) return window.__auroraLeafletPromise;
  window.__auroraLeafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-aurora-leaflet]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.dataset.auroraLeaflet = "true";
      document.head.appendChild(link);
    }
    let script = document.querySelector('script[data-aurora-leaflet]');
    if (script) {
      script.addEventListener("load", () => resolve(window.L), { once: true });
      script.addEventListener("error", reject, { once: true });
      return;
    }
    script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.dataset.auroraLeaflet = "true";
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Map library did not initialise."));
    script.onerror = () => reject(new Error("Map library could not load. Check your internet connection."));
    document.head.appendChild(script);
  });
  return window.__auroraLeafletPromise;
}

export default function MapsWorkspace() {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [notice, setNotice] = useState("Search for a destination or use your current location to begin.");
  const [mode, setMode] = useState("street");

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !mapNodeRef.current || mapRef.current) return;
      const map = L.map(mapNodeRef.current, { zoomControl: false, preferCanvas: true }).setView([6.5244, 3.3792], 12);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 150);
    }).catch((error) => setMapError(error.message || "The map could not load."));
    return () => { cancelled = true; if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [mapReady]);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("This device or browser does not support location."); return; }
    setNotice("Requesting location permission…");
    navigator.geolocation.getCurrentPosition((position) => {
      const point = [position.coords.latitude, position.coords.longitude];
      setLocation({ lat: point[0], lon: point[1] });
      const L = window.L;
      if (L && mapRef.current) {
        if (!userMarkerRef.current) userMarkerRef.current = L.circleMarker(point, { radius: 8, color: "#e9fbff", weight: 3, fillColor: "#37b9ff", fillOpacity: 1 }).addTo(mapRef.current).bindPopup("Your current location");
        else userMarkerRef.current.setLatLng(point);
        mapRef.current.setView(point, 16);
      }
      setNotice("Your current location is shown. Location is only accessed after you tap this button.");
    }, (error) => setNotice(error.code === 1 ? "Location permission was denied. Allow location access in your device settings and try again." : "Could not get your location. Check GPS and internet, then try again."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
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
      const L = window.L;
      if (L && mapRef.current) {
        if (!userMarkerRef.current) userMarkerRef.current = L.circleMarker(point, { radius: 8, color: "#e9fbff", weight: 3, fillColor: "#37b9ff", fillOpacity: 1 }).addTo(mapRef.current).bindPopup("Your live location");
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
    try {
      const geocodeResponse = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), { headers: { Accept: "application/json" } });
      if (!geocodeResponse.ok) throw new Error("Destination search is temporarily unavailable.");
      const results = await geocodeResponse.json();
      if (!results.length) throw new Error("I couldn't find that place. Try adding the city or state.");
      const target = { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
      const L = window.L;
      if (L && mapRef.current) {
        if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
        destinationMarkerRef.current = L.marker([target.lat, target.lon]).addTo(mapRef.current).bindPopup(target.label);
        destinationMarkerRef.current.openPopup();
      }
      if (location) {
        const routeResponse = await fetch("https://router.project-osrm.org/route/v1/driving/" + location.lon + "," + location.lat + ";" + target.lon + "," + target.lat + "?overview=full&geometries=geojson&steps=true");
        if (routeResponse.ok) {
          const routeData = await routeResponse.json();
          const route = routeData.routes?.[0];
          if (route && L && mapRef.current) {
            if (routeLayerRef.current) routeLayerRef.current.remove();
            routeLayerRef.current = L.geoJSON(route.geometry, { style: { color: "#35b9ff", weight: 6, opacity: .9, lineCap: "round", lineJoin: "round" } }).addTo(mapRef.current);
            mapRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [35, 35] });
            setRouteInfo({ distance: route.distance, duration: route.duration, target });
            setNotice("Route shown. Directions and ETA are estimates; follow road signs and local guidance.");
            return;
          }
        }
      }
      if (L && mapRef.current) mapRef.current.setView([target.lat, target.lon], 15);
      setRouteInfo({ target });
      setNotice("Destination found. Tap Use my location first to calculate a route from where you are.");
    } catch (error) {
      setNotice(error.message || "Could not find that destination.");
    } finally { setBusy(false); }
  }

  function openGoogle(modeName) {
    const query = destination.trim();
    const origin = location ? "&origin=" + encodeURIComponent(location.lat + "," + location.lon) : "";
    const destinationParam = query ? "&destination=" + encodeURIComponent(query) : "";
    const url = modeName === "satellite"
      ? "https://www.google.com/maps" + (query ? "/search/" + encodeURIComponent(query) : "") + "?output=classic&t=k"
      : modeName === "streetview"
        ? "https://www.google.com/maps" + (query ? "/search/" + encodeURIComponent(query) : "") + "?layer=c"
        : "https://www.google.com/maps/dir/?api=1" + origin + destinationParam + "&travelmode=driving";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const fmtDistance = (metres) => metres >= 1000 ? (metres / 1000).toFixed(1) + " km" : Math.round(metres) + " m";
  const fmtDuration = (seconds) => { const mins = Math.round(seconds / 60); return mins >= 60 ? Math.floor(mins / 60) + " hr " + (mins % 60) + " min" : mins + " min"; };

  return <section className="utility-page aurora-maps-page">
    <div className="maps-heading"><div><p className="panel-eyebrow"><MapPinned size={14}/> AURORA NAVIGATION</p><h1>Maps<span>.</span></h1><p className="utility-intro">Explore places, locate yourself, and plan a journey.</p></div><span className={"maps-live-badge " + (tracking ? "is-live" : "")}><i/>{tracking ? "LOCATION LIVE" : "MAP READY"}</span></div>
    <div className="maps-workspace">
      <aside className="maps-controls">
        <form className="maps-search" onSubmit={searchDestination}><Search size={18}/><input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where do you want to go?" aria-label="Destination" /><button type="submit" disabled={busy} aria-label="Search destination">{busy ? <span className="mini-loader"/> : <Navigation size={17}/>}</button></form>
        <button type="button" className="maps-action" onClick={useCurrentLocation}><LocateFixed size={17}/><span><strong>Use my location</strong><small>Show where I am now</small></span></button>
        <button type="button" className={"maps-action " + (tracking ? "maps-action-active" : "")} onClick={toggleTracking}><span className="maps-pulse-dot"/><span><strong>{tracking ? "Stop live location" : "Live location tracking"}</strong><small>{tracking ? "Updates while this page is open" : "Requires location permission"}</small></span></button>
        <div className="maps-mode-row"><button type="button" className={mode === "street" ? "maps-mode-active" : ""} onClick={() => { setMode("street"); setNotice("Built-in street map is active."); }}><MapPinned size={15}/> Map</button><button type="button" onClick={() => openGoogle("satellite")}><Satellite size={15}/> Satellite</button></div>
        <button type="button" className="maps-action" onClick={() => openGoogle("streetview")}><ExternalLink size={17}/><span><strong>Street-level view</strong><small>Open Google Street View where available</small></span><ArrowLeft size={14} style={{ transform: "rotate(135deg)" }}/></button>
        <button type="button" className="maps-action" onClick={() => openGoogle("directions")}><Route size={17}/><span><strong>Google Maps directions</strong><small>Fallback for full navigation and traffic</small></span><ExternalLink size={14}/></button>
        {routeInfo && <div className="maps-route-card"><p className="panel-eyebrow">DESTINATION</p><strong>{routeInfo.target.label}</strong>{routeInfo.distance != null && <div className="maps-route-stats"><span><Route size={15}/>{fmtDistance(routeInfo.distance)}</span><span><Clock3 size={15}/>{fmtDuration(routeInfo.duration)}</span></div>}<small>Routing is provided by a public demo service and may be limited or unavailable.</small></div>}
        <p className="maps-note" role="status">{notice}</p>
      </aside>
      <div className="maps-map-frame"><div ref={mapNodeRef} className="maps-leaflet-map" aria-label="Interactive map" />{!mapReady && !mapError && <div className="maps-loading"><span className="mini-loader"/> Loading interactive map…</div>}{mapError && <div className="maps-error">{mapError}<button type="button" className="outline-action" onClick={() => window.location.reload()}>Reload map</button></div>}<div className="maps-map-caption">Interactive street map · © OpenStreetMap contributors</div></div>
    </div>
    <div className="maps-disclaimer">Satellite imagery, Street View, traffic and full turn-by-turn guidance open in Google Maps where supported. Built-in routing uses public services for prototype use and is not a guaranteed emergency or commercial navigation service.</div>
  </section>;
}
