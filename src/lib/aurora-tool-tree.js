// AURORA's shared capability tree. The main chat routes clear tool requests here
// before calling the AI, then supplies the real tool output as grounded context.
import { auroraApiUrl } from "./aurora-native";

function formatPlace(address = {}) {
  return [
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village || address.county,
    address.state,
    address.country
  ].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(", ");
}

async function getDeviceLocation() {
  if (!globalThis.navigator?.geolocation) {
    throw new Error("This device or browser does not support location access.");
  }
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      const message = error.code === 1
        ? "Location permission was denied. Allow location access for AURORA in your browser or Android app settings, then ask again."
        : error.code === 3
          ? "The location request timed out. Turn on your phone's location/GPS and try again."
          : "AURORA couldn't get your location. Check that location/GPS is enabled and try again.";
      reject(new Error(message));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  });
  const { latitude, longitude, accuracy } = position.coords;
  let place = "";
  try {
    const response = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + encodeURIComponent(latitude) + "&lon=" + encodeURIComponent(longitude), { headers: { Accept: "application/json" } });
    if (response.ok) {
      const data = await response.json();
      place = formatPlace(data.address || {}) || data.display_name || "";
    }
  } catch {}
  return { latitude, longitude, accuracy, place };
}

function locationContext(location) {
  return [
    "Tool: device_location (fresh device/browser geolocation explicitly requested by the user).",
    "Latitude: " + location.latitude,
    "Longitude: " + location.longitude,
    "Reported accuracy: approximately " + Math.round(location.accuracy) + " metres.",
    location.place ? "Resolved place: " + location.place : "Reverse geocoding did not return a readable place name.",
    "Answer using these actual coordinates/place details. Be clear that GPS accuracy varies."
  ].join("\n");
}

const capabilityTools = [
  {
    id: "device_location",
    description: "Current GPS location and place lookup.",
    matches: (text) => /\b(where am i|my current location|current location|where are we|locate me|show where i am|my position|where am i right now)\b/i.test(text),
    run: async () => ({ context: locationContext(await getDeviceLocation()) })
  },
  {
    id: "weather",
    description: "Live weather and short forecast from a city, or the user's location when they ask about weather here.",
    matches: (text) => /\b(weather|forecast|temperature outside|is it raining|will it rain|rain today)\b/i.test(text),
    run: async (text) => {
      const match = text.match(/\b(?:weather|forecast|temperature outside|is it raining|will it rain|rain today)\b(?:\s+(?:like\s+)?(?:in|for|at)\s+([^?.!,]+))?/i);
      let city = match?.[1]?.trim() || "";
      let location;
      if (!city || /^(here|my location|where i am|outside|today|now)$/i.test(city)) {
        location = await getDeviceLocation();
        city = location.place || "";
      }
      if (!city) throw new Error("I got your coordinates but couldn't identify a town for weather. Ask for weather in a named city, such as Benin City.");
      const response = await fetch(auroraApiUrl("/api/weather?city=") + encodeURIComponent(city));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Weather could not be loaded.");
      const current = data.current || {};
      const forecast = Array.isArray(data.forecast) ? data.forecast : [];
      return { context: [
        "Tool: live_weather. Location: " + (data.location || city),
        "Current temperature: " + (current.temperature ?? "unavailable") + (data.units?.temperature || "°C"),
        "Feels like: " + (current.apparentTemperature ?? "unavailable") + (data.units?.temperature || "°C"),
        "Conditions: " + (current.description || "unavailable"),
        "Humidity: " + (current.humidity ?? "unavailable") + "%",
        "Wind: " + (current.windSpeed ?? "unavailable") + " " + (data.units?.wind || "km/h"),
        ...forecast.map(day => day.date + ": " + day.description + ", high " + day.high + (data.units?.temperature || "°C") + ", low " + day.low + (data.units?.temperature || "°C") + ", rain chance " + (day.rainChance ?? "unavailable") + "%"),
        "Weather data timestamp: " + (data.updatedAt || "not provided")
      ].join("\n") };
    }
  },
  {
    id: "web_search",
    description: "Search the web for current facts, sources, news, and requested lookups.",
    matches: (text) => /\b(search (?:the web )?for|look up|find online|search online|latest news|news today|what's happening in|what is happening in)\b/i.test(text),
    run: async (text) => {
      const query = text.replace(/^\s*(?:aurora[, ]*)?(?:please\s+)?(?:search (?:the web )?for|look up|find online|search online)\s*/i, "").trim()
        || text.trim();
      const response = await fetch(auroraApiUrl("/api/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Web search could not complete.");
      const results = Array.isArray(data.results) ? data.results.slice(0, 6) : [];
      if (!results.length) return { context: "Tool: web_search. No matching results were returned for: " + query };
      return { context: "Tool: web_search. Query: " + query + "\n" + results.map((item, index) =>
        (index + 1) + ". " + (item.title || "Untitled source") + "\n" +
        (item.snippet || "No snippet supplied.") + "\nURL: " + (item.url || "unavailable")
      ).join("\n\n") + "\nUse these search results as sources; distinguish source claims from established facts." };
    }
  },
  {
    id: "maps_navigation",
    description: "Create map, satellite, destination, or route links from a destination; use GPS when directions start from the user's current location.",
    matches: (text) => /\b(directions to|route to|navigate to|how do i get to|take me to|show (?:me )?(?:the )?map|open (?:google )?maps|satellite view|street view|where is)\b/i.test(text),
    run: async (text) => {
      const destinationMatch = text.match(/\b(?:directions to|route to|navigate to|how do i get to|take me to|where is)\s+([^?.!,]+)/i);
      const destination = destinationMatch?.[1]?.trim() || "";
      const wantsSatellite = /\bsatellite\b/i.test(text);
      const wantsStreetView = /\bstreet view\b/i.test(text);
      let origin = "";
      if (/\b(from here|from my location|from where i am|current location|where i am)\b/i.test(text)) {
        const location = await getDeviceLocation();
        origin = location.latitude + "," + location.longitude;
      }
      const encodedDestination = encodeURIComponent(destination || "my current location");
      const directionsUrl = origin
        ? "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(origin) + "&destination=" + encodedDestination + "&travelmode=driving"
        : "https://www.google.com/maps/dir/?api=1&destination=" + encodedDestination;
      const viewUrl = "https://www.google.com/maps/search/?api=1&query=" + encodedDestination + (wantsSatellite ? "&basemap=satellite" : "");
      const streetUrl = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + encodeURIComponent(origin || destination || "Nigeria");
      return { context: [
        "Tool: maps_navigation.",
        destination ? "Destination requested: " + destination : "No named destination was supplied; ask a follow-up if the user needs a route to somewhere specific.",
        origin ? "Starting coordinates: " + origin : "No GPS starting point was requested or supplied.",
        "Google Maps search/map: " + viewUrl,
        "Google Maps directions: " + directionsUrl,
        wantsStreetView ? "Google Maps Street View: " + streetUrl : "",
        "These links open Google Maps; satellite/Street View availability depends on coverage and the Google Maps app/browser."
      ].filter(Boolean).join("\n") };
    }
  }
];

export async function runAuroraToolTree(userText) {
  const text = String(userText || "");
  const tool = capabilityTools.find((candidate) => candidate.matches(text));
  if (!tool) return null;
  try {
    const result = await tool.run(text);
    return { tool: tool.id, ...result };
  } catch (error) {
    return { tool: tool.id, error: error?.message || "The requested tool could not complete." };
  }
}

export function getAuroraToolTree() {
  return capabilityTools.map(({ id, description }) => ({ id, description }));
}
