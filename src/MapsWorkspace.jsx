import "./maps.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Compass, Crosshair, Globe2, LocateFixed, MapPinned, Navigation, Pause, Play, RotateCcw, Satellite, Search, Sparkles, ZoomIn, ZoomOut } from "lucide-react";

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const EARTH_TEXTURE = "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg";
const EARTH_NORMAL = "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg";
const EARTH_LIGHTS = "https://threejs.org/examples/textures/planets/earth_lights_2048.png";

function latLonVector(THREE, lat, lon, radius = 2.015) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

export default function MapsWorkspace() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const watchRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);
  const [notice, setNotice] = useState("Drag the Earth to explore. Search for a destination or enable GPS.");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let renderer, frame, resizeObserver, controls;
    let earth, earthMaterial, scene, camera, THREE;
    const markerGroup = { current: null };
    const routeGroup = { current: null };
    const host = hostRef.current;
    if (!host) return undefined;

    (async () => {
      try {
        const module = await import(/* @vite-ignore */ THREE_URL);
        if (cancelled) return;
        THREE = module;
        scene = new THREE.Scene();
        scene.background = new THREE.Color("#020712");
        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 8.1);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(host.clientWidth, host.clientHeight);
        renderer.domElement.className = "cosmos-canvas";
        renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional Earth. Drag to rotate and use zoom controls.");
        host.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0x9bb9e9, 1.45));
        const sun = new THREE.DirectionalLight(0xffffff, 2.1);
        sun.position.set(-5, 2, 6);
        scene.add(sun);

        const starsGeometry = new THREE.BufferGeometry();
        const starPositions = [];
        for (let i = 0; i < 1600; i++) {
          const radius = 14 + Math.random() * 35;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          starPositions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
        }
        starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xa9d9ff, size: 0.055, transparent: true, opacity: 0.82 }));
        scene.add(stars);

        const group = new THREE.Group();
        scene.add(group);
        const geometry = new THREE.SphereGeometry(2, 96, 96);
        const grid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(2.008, 24, 16)), new THREE.LineBasicMaterial({ color: 0x51dfff, transparent: true, opacity: 0.26 }));
        grid.visible = !satellite;
        group.add(grid);
        earthMaterial = new THREE.MeshPhongMaterial({ color: 0x8ba7c8, shininess: 12, specular: new THREE.Color(0x244a70) });
        earth = new THREE.Mesh(geometry, earthMaterial);
        group.add(earth);

        const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.075, 64, 64), new THREE.MeshBasicMaterial({ color: 0x2c9cff, transparent: true, opacity: 0.105, side: THREE.BackSide }));
        group.add(atmosphere);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(2.13, 48, 48), new THREE.MeshBasicMaterial({ color: 0x2379ff, transparent: true, opacity: 0.035, side: THREE.BackSide }));
        group.add(glow);
        markerGroup.current = new THREE.Group();
        routeGroup.current = new THREE.Group();
        group.add(routeGroup.current, markerGroup.current);

        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin("anonymous");
        const texture = await new Promise((resolve, reject) => textureLoader.load(EARTH_TEXTURE, resolve, undefined, reject));
        if (cancelled) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        earthMaterial.map = texture;
        earthMaterial.color.set(0xffffff);
        earthMaterial.needsUpdate = true;
        setReady(true);

        textureLoader.load(EARTH_NORMAL, (normal) => {
          if (cancelled) { normal.dispose(); return; }
          earthMaterial.bumpMap = normal;
          earthMaterial.bumpScale = 0.035;
          earthMaterial.needsUpdate = true;
        });
        textureLoader.load(EARTH_LIGHTS, (lights) => {
          if (cancelled) { lights.dispose(); return; }
          lights.colorSpace = THREE.SRGBColorSpace;
          earthMaterial.emissiveMap = lights;
          earthMaterial.emissive = new THREE.Color(0x243b60);
          earthMaterial.emissiveIntensity = 0.32;
          earthMaterial.needsUpdate = true;
        });

        let pointer = null, lastX = 0, lastY = 0, velocityX = 0, velocityY = 0;
        const onDown = (event) => { pointer = event.pointerId; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(pointer); };
        const onMove = (event) => {
          if (pointer !== event.pointerId) return;
          const dx = event.clientX - lastX, dy = event.clientY - lastY;
          group.rotation.y += dx * 0.005;
          group.rotation.x = Math.max(-1.1, Math.min(1.1, group.rotation.x + dy * 0.004));
          velocityX = dx * 0.00045; velocityY = dy * 0.00035;
          lastX = event.clientX; lastY = event.clientY;
          setAutoRotate(false);
        };
        const onUp = (event) => { if (pointer === event.pointerId) pointer = null; };
        const onWheel = (event) => { event.preventDefault(); camera.position.z = Math.max(4.4, Math.min(12, camera.position.z + event.deltaY * 0.006)); setZoom(Math.round(810 / camera.position.z) / 100); };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerup", onUp);
        renderer.domElement.addEventListener("pointercancel", onUp);
        renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
        controls = () => {
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointermove", onMove);
          renderer.domElement.removeEventListener("pointerup", onUp);
          renderer.domElement.removeEventListener("pointercancel", onUp);
          renderer.domElement.removeEventListener("wheel", onWheel);
        };

        resizeObserver = new ResizeObserver(() => {
          if (!renderer || !camera) return;
          const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
          camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
        });
        resizeObserver.observe(host);
        const animate = () => {
          if (cancelled) return;
          frame = requestAnimationFrame(animate);
          if (autoRotateRef.current && pointer === null) group.rotation.y += 0.0008;
          else if (pointer === null) { group.rotation.y += velocityX; group.rotation.x = Math.max(-1.1, Math.min(1.1, group.rotation.x + velocityY)); velocityX *= 0.94; velocityY *= 0.94; }
          stars.rotation.y -= 0.00006;
          renderer.render(scene, camera);
        };
        animate();
        sceneRef.current = { THREE, group, camera, renderer, earthMaterial, grid, markerGroup: markerGroup.current, routeGroup: routeGroup.current, host };
      } catch (cause) {
        if (!cancelled) setError(cause?.message || "The 3D Earth could not load. Check your internet connection and WebGL support.");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.();
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      scene?.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      sceneRef.current = null;
    };
  }, []);

  const updateMarker = useCallback((point, kind) => {
    const state = sceneRef.current;
    if (!state || !point) return;
    const { THREE, markerGroup } = state;
    const old = markerGroup.getObjectByName(kind);
    if (old) markerGroup.remove(old);
    const position = latLonVector(THREE, point.lat, point.lon, 2.035);
    const color = kind === "current-location" ? 0x43e8ff : 0xffc86b;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(kind === "current-location" ? 0.045 : 0.05, 16, 16), new THREE.MeshBasicMaterial({ color }));
    pin.position.copy(position); pin.name = kind; markerGroup.add(pin);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.065, 0.09, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.position.copy(position.clone().multiplyScalar(1.006)); ring.lookAt(position.clone().multiplyScalar(2)); markerGroup.add(ring); ring.name = kind + "-ring";
  }, []);

  useEffect(() => { updateMarker(location, "current-location"); }, [location, updateMarker]);
  useEffect(() => { updateMarker(destination, "destination"); }, [destination, updateMarker]);
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.grid.visible = !satellite;
    if (satellite) {
      state.earthMaterial.map?.dispose?.();
      new state.THREE.TextureLoader().load(EARTH_TEXTURE, (texture) => {
        if (sceneRef.current !== state) { texture.dispose(); return; }
        texture.colorSpace = state.THREE.SRGBColorSpace;
        state.earthMaterial.map = texture; state.earthMaterial.color.set(0xffffff); state.earthMaterial.needsUpdate = true;
      });
    } else {
      state.earthMaterial.map = null; state.earthMaterial.color.set(0x17466b); state.earthMaterial.emissive.set(0x071b35); state.earthMaterial.needsUpdate = true;
    }
  }, [satellite, ready]);

  const flyTo = useCallback((point) => {
    const state = sceneRef.current;
    if (!state || !point) return;
    const vector = latLonVector(state.THREE, point.lat, point.lon, 2);
    const direction = vector.clone().normalize();
    const target = new state.THREE.Quaternion().setFromUnitVectors(direction, new state.THREE.Vector3(0, 0, 1));
    state.group.quaternion.slerp(target, 0.8);
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setNotice("This device or browser does not support GPS."); return; }
    setNotice("Requesting GPS permission…");
    navigator.geolocation.getCurrentPosition((position) => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude };
      setLocation(point); flyTo(point);
      setNotice("GPS position received. Your location marker is now on the Earth.");
    }, (cause) => setNotice(cause.code === 1 ? "Location permission was denied. Enable it in device settings." : "GPS unavailable. Check location services and try again."), { enableHighAccuracy: true, timeout: 18000, maximumAge: 5000 });
  }

  function toggleTracking() {
    if (tracking) {
      if (watchRef.current != null) navigator.geolocation?.clearWatch(watchRef.current);
      watchRef.current = null; setTracking(false); setNotice("Live GPS tracking stopped."); return;
    }
    if (!navigator.geolocation) { setNotice("Live GPS is not supported on this device."); return; }
    watchRef.current = navigator.geolocation.watchPosition((position) => {
      setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
    }, (cause) => { setTracking(false); setNotice(cause.code === 1 ? "GPS permission denied." : "Live GPS update failed."); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 18000 });
    setTracking(true); setNotice("Live GPS updates are active while AURORA Maps is open.");
  }

  async function searchDestination(event) {
    event?.preventDefault();
    const value = query.trim();
    if (!value) { setNotice("Type a place, address or destination first."); return; }
    setBusy(true); setRouteInfo(null); setNotice("Searching the world for " + value + "…");
    try {
      const response = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" + encodeURIComponent(value), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Place search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length) throw new Error("No matching place found. Try adding a city or country.");
      const point = { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
      setDestination(point); flyTo(point);
      if (location) {
        const routeResponse = await fetch("https://router.project-osrm.org/route/v1/driving/" + location.lon + "," + location.lat + ";" + point.lon + "," + point.lat + "?overview=full&geometries=geojson", { signal: AbortSignal.timeout(15000) });
        if (routeResponse.ok) {
          const data = await routeResponse.json(), route = data.routes?.[0];
          if (route && sceneRef.current) {
            const { THREE, routeGroup } = sceneRef.current;
            routeGroup.clear();
            const coordinates = route.geometry.coordinates;
            const points = coordinates.filter((_, index) => index % Math.max(1, Math.floor(coordinates.length / 500)) === 0).map(([lon, lat]) => latLonVector(THREE, lat, lon, 2.012));
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x54eaff, transparent: true, opacity: 0.95 }));
            routeGroup.add(line);
            setRouteInfo({ label: point.label, distance: route.distance, duration: route.duration });
            setNotice("Route preview drawn on the globe. Road routing is an estimate from a public demo service.");
            return;
          }
        }
      }
      setNotice("Destination located on Earth. Add your GPS position to request a road route.");
    } catch (cause) {
      setNotice(cause.name === "TimeoutError" || cause.name === "AbortError" ? "The place search took too long. Try again." : cause.message || "Could not search for that destination.");
    } finally { setBusy(false); }
  }

  function changeZoom(delta) {
    const state = sceneRef.current; if (!state) return;
    state.camera.position.z = Math.max(4.4, Math.min(12, state.camera.position.z + delta));
    setZoom(Math.round(810 / state.camera.position.z) / 100);
  }
  function resetView() {
    const state = sceneRef.current; if (!state) return;
    state.group.rotation.set(0, 0, 0); state.group.quaternion.identity(); state.camera.position.set(0, 0, 8.1); setZoom(1);
    setNotice("Earth view reset.");
  }

  return <section className="utility-page aurora-maps-page aurora-cosmos-page">
    <header className="maps-heading cosmos-heading">
      <div><p className="panel-eyebrow"><Globe2 size={14}/> AURORA COSMOS · PLANETARY NAVIGATION</p><h1>Cosmic Earth<span>.</span></h1><p className="utility-intro">Explore our planet in an interactive 3D space.</p></div>
      <span className={"maps-live-badge " + (tracking ? "is-live" : "")}><i/>{tracking ? "GPS LIVE" : ready ? "3D SYSTEM ONLINE" : "INITIALISING"}</span>
    </header>
    <div className="cosmos-shell">
      <div className="cosmos-viewport">
        <div className="cosmos-star-glow"/>
        <div ref={hostRef} className="cosmos-globe-host"/>
        {!ready && !error && <div className="cosmos-loading"><span className="mini-loader"/> Initialising planetary engine…</div>}
        {error && <div className="cosmos-loading cosmos-error"><Globe2 size={28}/><strong>Cosmic Earth unavailable</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Reload map</button></div>}
        <div className="cosmos-hud cosmos-hud-top"><span><Activity size={13}/> PLANETARY VIEW</span><span>EARTH · 3D</span></div>
        <div className="cosmos-hud cosmos-hud-bottom"><span><i/> {satellite ? "GLOBAL EARTH IMAGERY TEXTURE" : "HOLOGRAPHIC GRID MODE"}</span><span>ZOOM {zoom.toFixed(2)}×</span></div>
        <div className="cosmos-globe-controls">
          <button type="button" onClick={() => changeZoom(-0.7)} aria-label="Zoom in"><ZoomIn size={17}/></button>
          <button type="button" onClick={() => changeZoom(0.7)} aria-label="Zoom out"><ZoomOut size={17}/></button>
          <button type="button" onClick={resetView} aria-label="Reset globe view"><RotateCcw size={16}/></button>
        </div>
        <div className="cosmos-compass"><Compass size={17}/><span>N</span></div>
      </div>
      <aside className="cosmos-console">
        <div className="cosmos-console-title"><span><Sparkles size={16}/></span><div><strong>Mission control</strong><small>EARTH INTERFACE</small></div></div>
        <form className="maps-search cosmos-search" onSubmit={searchDestination}><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any place on Earth…" aria-label="Search destination"/><button type="submit" disabled={busy} aria-label="Search">{busy ? <span className="mini-loader"/> : <ArrowUpRight size={17}/>}</button></form>
        <button type="button" className="maps-action" onClick={useCurrentLocation}><LocateFixed size={17}/><span><strong>Locate my position</strong><small>Place GPS marker on Earth</small></span></button>
        <button type="button" className={"maps-action " + (tracking ? "maps-action-active" : "")} onClick={toggleTracking}><Crosshair size={17}/><span><strong>{tracking ? "Stop live GPS" : "Enable live GPS"}</strong><small>{tracking ? "Updating while page is open" : "Requires location permission"}</small></span></button>
        <button type="button" className={"maps-action " + (satellite ? "cosmos-layer-active" : "")} onClick={() => setSatellite((value) => !value)}><Satellite size={17}/><span><strong>{satellite ? "Earth imagery texture" : "Holographic grid mode"}</strong><small>Switch between imagery and holographic grid</small></span></button>
        <button type="button" className="maps-action" onClick={() => setAutoRotate((value) => !value)}>{autoRotate ? <Pause size={17}/> : <Play size={17}/>}<span><strong>{autoRotate ? "Pause Earth rotation" : "Resume Earth rotation"}</strong><small>Drag the globe to rotate manually</small></span></button>
        {routeInfo && <div className="maps-route-card"><p className="panel-eyebrow">ROUTE PREVIEW</p><strong>{routeInfo.label}</strong>{routeInfo.distance != null && <div className="maps-route-stats"><span><Navigation size={14}/>{(routeInfo.distance / 1000).toFixed(1)} km</span><span>{Math.round(routeInfo.duration / 60)} min</span></div>}<small>Public routing preview. Follow road signs and local guidance.</small></div>}
        <p className="maps-note" role="status">{notice}</p>
        {location && <div className="cosmos-coordinate"><span>GPS COORDINATES</span><strong>{location.lat.toFixed(5)}°, {location.lon.toFixed(5)}°</strong></div>}
        {destination && <div className="cosmos-coordinate"><span>SELECTED DESTINATION</span><strong>{destination.lat.toFixed(4)}°, {destination.lon.toFixed(4)}°</strong></div>}
      </aside>
    </div>
    <footer className="maps-disclaimer">3D Earth uses a global planetary texture, not live satellite video. GPS requires your permission. Search and road-route data use public OpenStreetMap community services and may be delayed or unavailable; routing is a preview, not emergency navigation.</footer>
  </section>;
}
