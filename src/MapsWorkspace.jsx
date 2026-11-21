import "./maps.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, LocateFixed, MapPinned, Navigation, Search, Satellite,
  ExternalLink, Route, Clock3, Mountain, Layers3, Globe2, Box
} from "lucide-react";

const MAPLIBRE_VERSION = "6.19.0";
const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const EMPTY_ROUTE = { type: "FeatureCollection", features: [] };

function loadMapLibre() {
  if (window.__auroraMapLibrePromise) return window.__auroraMapLibrePromise;
  window.__auroraMapLibrePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('link[data-aurora-maplibre]');
    if (!existing) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
      link.dataset.auroraMaplibre = "true";
      document.head.appendChild(link);
    }
    import(/* @vite-ignore */ `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.mjs`)
      .then((module) => resolve(module))
      .catch((error) => {
        window.__auroraMapLibrePromise = null;
        reject(new Error("AURORA 3D Maps could not load. Check your internet connection and try again."));
      });
  });
  return window.__auroraMapLibrePromise;
}

function makeLocationElement() {
  const element = document.createElement("div");
  element.className = "aurora-map-user-marker";
  element.setAttribute("aria-label", "Your current location");
  return element;
}

export default function MapsWorkspace() {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const routeLayerReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [notice, setNotice] = useState("Explore the real Earth, tilt into 3D, or search for a destination.");
  const [mode, setMode] = useState("hybrid");
  const [view3D, setView3D] = useState(true);

  const applyCameraMode = useCallback((enabled) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.easeTo({
      pitch: enabled ? 62 : 0,
      bearing: enabled ? -18 : 0,
      duration: 850
    });
    try {
      if (enabled) map.setTerrain({ source: "aurora-terrain", exaggeration: 1.15 });
      else map.setTerrain(null);
    } catch {
      setNotice("3D terrain is temporarily unavailable; the angled map view is still active.");
    }
  }, []);

  const applyLayerMode = useCallback((nextMode) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const satelliteVisible = nextMode === "satellite" || nextMode === "hybrid";
    if (map.getLayer("aurora-satellite-layer")) {
      map.setLayoutProperty("aurora-satellite-layer", "visibility", satelliteVisible ? "visible" : "none");
    }
    const styleLayers = map.getStyle()?.layers || [];
    for (const layer of styleLayers) {
      if (layer.type === "symbol" && layer.id !== "aurora-3d-buildings") {
        map.setLayoutProperty(layer.id, "visibility", nextMode === "satellite" ? "none" : "visible");
      }
    }
    if (map.getLayer("aurora-hillshade")) {
      map.setLayoutProperty("aurora-hillshade", "visibility", nextMode === "terrain" ? "visible" : "none");
    }
    setNotice(
      nextMode === "street" ? "Street map active."
      : nextMode === "satellite" ? "Satellite imagery active. Switch to Hybrid to show place labels."
      : nextMode === "terrain" ? "Terrain mode active with elevation shading and 3D relief."
      : "Hybrid satellite imagery with roads and place labels active."
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let mapInstance;
    loadMapLibre().then((maplibre) => {
      if (cancelled || !mapNodeRef.current || mapRef.current) return;
      mapLibraryRef.current = maplibre;
      const map = new maplibre.Map({
        container: mapNodeRef.current,
        style: BASE_STYLE,
        center: [8.6753, 9.082],
        zoom: 2.25,
        pitch: 48,
        bearing: -12,
        maxPitch: 82,
        minZoom: 1,
        maxZoom: 19,
        projection: { type: "globe" },
        canvasContextAttributes: { antialias: false, powerPreference: "low-power" },
        attributionControl: { compact: true, customAttribution: [
          "Satellite imagery © Esri, Maxar, Earthstar Geographics",
          "Terrain: Mapzen Terrain Tiles / AWS Open Data"
        ] }
      });
      mapInstance = map;
      mapRef.current = map;
      map.addControl(new maplibre.NavigationControl({
        visualizePitch: true, showZoom: true, showCompass: true
      }), "bottom-right");
      map.addControl(new maplibre.GlobeControl(), "top-right");

      map.once("load", () => {
        if (cancelled) return;
        try {
          map.setProjection({ type: "globe" });
          map.addSource("aurora-satellite", {
            type: "raster",
            tiles: [SATELLITE_TILES],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
          });
          map.addSource("aurora-terrain", {
            type: "raster-dem",
            tiles: [TERRAIN_TILES],
            tileSize: 256,
            maxzoom: 15,
            encoding: "terrarium",
            attribution: "Terrain: Mapzen Terrain Tiles / AWS Open Data"
          });
          map.addSource("aurora-route", { type: "geojson", data: EMPTY_ROUTE });
          map.addSource("aurora-buildings", {
            type: "vector",
            url: "https://tiles.openfreemap.org/planet"
          });

          const firstSymbol = map.getStyle().layers.find((layer) =>
            layer.type === "symbol" && layer.layout && layer.layout["text-field"]
          )?.id;

          map.addLayer({
            id: "aurora-satellite-layer",
            type: "raster",
            source: "aurora-satellite",
            layout: { visibility: "visible" },
            paint: { "raster-opacity": 1, "raster-fade-duration": 250 }
          }, firstSymbol);

          map.addLayer({
            id: "aurora-hillshade",
            type: "hillshade",
            source: "aurora-terrain",
            layout: { visibility: "none" },
            paint: {
              "hillshade-exaggeration": 0.35,
              "hillshade-shadow-color": "#263342",
              "hillshade-highlight-color": "#f4ead5"
            }
          }, firstSymbol);

          map.addLayer({
            id: "aurora-3d-buildings",
            source: "aurora-buildings",
            "source-layer": "building",
            type: "fill-extrusion",
            minzoom: 13.5,
            filter: ["!=", ["get", "hide_3d"], true],
            paint: {
              "fill-extrusion-color": [
                "interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0],
                0, "#c9d4df", 80, "#aebfce", 250, "#829db5"
              ],
              "fill-extrusion-height": [
                "interpolate", ["linear"], ["zoom"],
                13.5, 0, 14.5, ["coalesce", ["get", "render_height"], 0]
              ],
              "fill-extrusion-base": [
                "interpolate", ["linear"], ["zoom"],
                13.5, 0, 14.5, ["coalesce", ["get", "render_min_height"], 0]
              ],
              "fill-extrusion-opacity": 0.88
            }
          }, firstSymbol);

          map.addLayer({
            id: "aurora-route-line",
            type: "line",
            source: "aurora-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#29b9ff",
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3, 15, 7],
              "line-opacity": 0.94
            }
          });
          routeLayerReadyRef.current = true;
          map.setTerrain({ source: "aurora-terrain", exaggeration: 1.15 });
          applyLayerMode("hybrid");
          setMapReady(true);
          requestAnimationFrame(() => map.resize());
        } catch (error) {
          setMapError(error?.message || "AURORA could not initialise its 3D map layers.");
        }
      });
      map.on("error", (event) => {
        if (!mapReady && event?.error?.message?.includes("style")) {
          setMapError("The map style could not be loaded. Please check your connection and retry.");
        }
      });
    }).catch((error) => {
      if (!cancelled) setMapError(error.message || "The map could not load.");
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
      userMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      mapInstance?.remove();
      if (mapRef.current === mapInstance) mapRef.current = null;
      mapLibraryRef.current = null;
      routeLayerReadyRef.current = false;
      setMapReady(false);
    };
  }, [applyLayerMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    applyLayerMode(mode);
  }, [mapReady, mode, applyLayerMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    applyCameraMode(view3D);
  }, [mapReady, view3D, applyCameraMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !location || !mapLibraryRef.current) return;
    const point = [location.lon, location.lat];
    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapLibraryRef.current.Marker({ element: makeLocationElement() })
        .setLngLat(point).setPopup(new mapLibraryRef.current.Popup({ offset: 18 }).setText("Your current location"))
        .addTo(mapRef.current);
    } else userMarkerRef.current.setLngLat(point);
  }, [mapReady, location]);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("This device or browser does not support location."); return; }
    setNotice("Requesting location permission…");
    navigator.geolocation.getCurrentPosition((position) => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude };
      setLocation(point);
      mapRef.current?.flyTo({ center: [point.lon, point.lat], zoom: 16, pitch: 65, speed: 0.8, curve: 1.4 });
      setView3D(true);
      setNotice("Your current location is shown. Location access is controlled by your device.");
    }, (error) => setNotice(error.code === 1
      ? "Location permission was denied. Allow location access in device settings and try again."
      : "Could not get your location. Check GPS and internet, then try again."
    ), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  }

  function toggleTracking() {
    if (tracking) {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setTracking(false);
      setNotice("Live location tracking stopped.");
      return;
    }
    if (!navigator.geolocation) { setNotice("Live location is not supported by this device."); return; }
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition((position) => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude };
      setLocation(point);
      if (!routeInfo) mapRef.current?.easeTo({ center: [point.lon, point.lat], duration: 700 });
    }, (error) => {
      setTracking(false);
      setNotice(error.code === 1 ? "Location permission was denied." : "Live location update failed. Check GPS and try again.");
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    setNotice("Live location tracking is on while this page is open.");
  }

  function stopTracking() {
    if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setTracking(false);
  }

  async function searchDestination(event) {
    event?.preventDefault();
    const query = destination.trim();
    if (!query) { setNotice("Enter a place or destination first."); return; }
    setBusy(true);
    setRouteInfo(null);
    setNotice("Finding destination…");
    if (routeLayerReadyRef.current && mapRef.current?.getSource("aurora-route")) {
      mapRef.current.getSource("aurora-route").setData(EMPTY_ROUTE);
    }
    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(query), {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error("Destination search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length) throw new Error("I couldn't find that place. Try adding the city or state.");
      const target = { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
      const maplibre = mapLibraryRef.current;
      if (maplibre && mapRef.current) {
        destinationMarkerRef.current = new maplibre.Marker({ color: "#ffca6b" })
          .setLngLat([target.lon, target.lat])
          .setPopup(new maplibre.Popup({ offset: 24 }).setText(target.label))
          .addTo(mapRef.current);
      }
      if (location) {
        const routeResponse = await fetch(
          "https://router.project-osrm.org/route/v1/driving/" + location.lon + "," + location.lat + ";" + target.lon + "," + target.lat + "?overview=full&geometries=geojson&steps=true",
          { signal: AbortSignal.timeout(12000) }
        );
        if (routeResponse.ok) {
          const data = await routeResponse.json();
          const route = data.routes?.[0];
          if (route && mapRef.current?.getSource("aurora-route") && maplibre) {
            mapRef.current.getSource("aurora-route").setData({
              type: "Feature",
              properties: {},
              geometry: route.geometry
            });
            const bounds = new maplibre.LngLatBounds();
            route.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate));
            mapRef.current.fitBounds(bounds, { padding: 70, pitch: view3D ? 55 : 0, duration: 900 });
            setRouteInfo({ distance: route.distance, duration: route.duration, target });
            setNotice("Route shown. Distance and ETA are estimates; follow road signs and local guidance.");
            return;
          }
        }
      }
      mapRef.current?.flyTo({ center: [target.lon, target.lat], zoom: 15.5, pitch: view3D ? 62 : 0, speed: 0.85 });
      setRouteInfo({ target });
      setNotice("Destination found. Use your location to calculate a route from where you are.");
    } catch (error) {
      setNotice(error.name === "TimeoutError" || error.name === "AbortError"
        ? "The map service took too long to respond. Please try again."
        : error.message || "Could not find that destination.");
    } finally {
      setBusy(false);
    }
  }

  const fmtDistance = (metres) => metres >= 1000 ? (metres / 1000).toFixed(1) + " km" : Math.round(metres) + " m";
  const fmtDuration = (seconds) => {
    const mins = Math.round(seconds / 60);
    return mins >= 60 ? Math.floor(mins / 60) + " hr " + (mins % 60) + " min" : mins + " min";
  };
  const openGoogle = (kind) => {
    const query = destination.trim() || (location ? location.lat + "," + location.lon : "Nigeria");
    const url = kind === "streetview"
      ? "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + encodeURIComponent(location ? location.lat + "," + location.lon : query)
      : "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(location ? location.lat + "," + location.lon : "Nigeria") + "&destination=" + encodeURIComponent(destination.trim() || query);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return <section className="utility-page aurora-maps-page aurora-maps-immersive">
    <div className="maps-heading">
      <div>
        <p className="panel-eyebrow"><MapPinned size={14}/> AURORA EARTH & NAVIGATION</p>
        <h1>Maps<span>.</span></h1>
        <p className="utility-intro">One continuous Earth-to-street map. Zoom, tilt, rotate and explore.</p>
      </div>
      <span className={"maps-live-badge " + (tracking ? "is-live" : "")}><i/>{tracking ? "LOCATION LIVE" : "3D MAP READY"}</span>
    </div>
    <div className="maps-workspace">
      <aside className="maps-controls">
        <form className="maps-search" onSubmit={searchDestination}>
          <Search size={18}/>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Search a place, address or landmark" aria-label="Destination"/>
          <button type="submit" disabled={busy} aria-label="Search destination">{busy ? <span className="mini-loader"/> : <Navigation size={17}/>}</button>
        </form>
        <button type="button" className="maps-action" onClick={useCurrentLocation}>
          <LocateFixed size={17}/><span><strong>Use my location</strong><small>Fly to this device's GPS position</small></span>
        </button>
        <button type="button" className={"maps-action " + (tracking ? "maps-action-active" : "")} onClick={toggleTracking}>
          <span className="maps-pulse-dot"/><span><strong>{tracking ? "Stop live location" : "Live location tracking"}</strong><small>{tracking ? "Updates while this page is open" : "Requires location permission"}</small></span>
        </button>
        <p className="maps-layer-label"><Layers3 size={14}/> MAP LAYERS</p>
        <div className="maps-layer-grid">
          <button type="button" className={mode === "street" ? "maps-layer-active" : ""} onClick={() => setMode("street")}><MapPinned size={16}/>Street</button>
          <button type="button" className={mode === "satellite" ? "maps-layer-active" : ""} onClick={() => setMode("satellite")}><Satellite size={16}/>Satellite</button>
          <button type="button" className={mode === "hybrid" ? "maps-layer-active" : ""} onClick={() => setMode("hybrid")}><Layers3 size={16}/>Hybrid</button>
          <button type="button" className={mode === "terrain" ? "maps-layer-active" : ""} onClick={() => { setMode("terrain"); setView3D(true); }}><Mountain size={16}/>Terrain</button>
        </div>
        <button type="button" className={"maps-action maps-3d-toggle " + (view3D ? "maps-action-active" : "")} onClick={() => setView3D((current) => !current)}>
          {view3D ? <Box size={18}/> : <Globe2 size={18}/>}
          <span><strong>{view3D ? "3D perspective ON" : "Switch to 3D perspective"}</strong><small>{view3D ? "Angled camera, raised terrain and buildings" : "Tilt the same map into 3D"}</small></span>
        </button>
        <button type="button" className="maps-action" onClick={() => openGoogle("streetview")}><ExternalLink size={17}/><span><strong>Street-level imagery</strong><small>Open Google imagery where available</small></span><ArrowLeft size={14} style={{transform:"rotate(135deg)"}}/></button>
        <button type="button" className="maps-action" onClick={() => openGoogle("directions")}><Route size={17}/><span><strong>Google Maps directions</strong><small>Optional external navigation</small></span><ExternalLink size={14}/></button>
        {routeInfo && <div className="maps-route-card">
          <p className="panel-eyebrow">DESTINATION</p><strong>{routeInfo.target.label}</strong>
          {routeInfo.distance != null && <div className="maps-route-stats"><span><Route size={15}/>{fmtDistance(routeInfo.distance)}</span><span><Clock3 size={15}/>{fmtDuration(routeInfo.duration)}</span></div>}
          <small>Routing uses a public demo service and may be limited or unavailable.</small>
        </div>}
        <p className="maps-note" role="status">{notice}</p>
      </aside>
      <div className="maps-map-frame maps-3d-frame">
        <div ref={mapNodeRef} className="maps-leaflet-map maps-maplibre-map" aria-label="Interactive 3D Earth map"/>
        {!mapReady && !mapError && <div className="maps-loading"><span className="mini-loader"/> Loading AURORA's 3D Earth map…</div>}
        {mapError && <div className="maps-error">{mapError}<button type="button" className="outline-action" onClick={() => window.location.reload()}>Reload map</button></div>}
        <div className="maps-map-caption">{mode === "street" ? "Street" : mode === "satellite" ? "Satellite" : mode === "terrain" ? "3D terrain" : "Satellite + labels"} · {view3D ? "3D perspective" : "2D view"}</div>
        <div className="maps-map-hint"><Globe2 size={13}/> Pinch to zoom · Two fingers to tilt · Drag to rotate</div>
      </div>
    </div>
    <div className="maps-disclaimer">
      AURORA uses one MapLibre camera and map surface for globe-to-street exploration. Satellite imagery is supplied by Esri and subject to its service terms; terrain uses Mapzen Terrain Tiles hosted on AWS Open Data. Building shapes and heights come from OpenStreetMap and coverage varies by location. This is not live video or live satellite footage. Location tracking runs only while this page is active.
    </div>
  </section>;
}
