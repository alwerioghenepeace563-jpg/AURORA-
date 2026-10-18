// AURORA capability tree: a small, extensible registry for tools that chat can invoke
// automatically when a message clearly needs live device or web data.
const capabilityTools = [
  {
    id: "device_location",
    description: "Get the user's current location when they ask where they are or ask for directions from their current position.",
    matches: (text) => /\b(where am i|my current location|current location|where are we|locate me|show where i am|my position)\b/i.test(text),
    run: async () => {
      if (!globalThis.navigator?.geolocation) {
        return { error: "This device or browser does not support location access." };
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
          const address = data.address || {};
          place = [address.road, address.suburb || address.neighbourhood, address.city || address.town || address.village || address.county, address.state, address.country].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(", ");
          if (!place) place = data.display_name || "";
        }
      } catch {}
      return {
        context: [
          "Tool: device_location (fresh browser/device geolocation, explicitly requested by the user).",
          "Latitude: " + latitude,
          "Longitude: " + longitude,
          "Reported accuracy: approximately " + Math.round(accuracy) + " metres.",
          place ? "Resolved place: " + place : "Reverse geocoding did not return a readable place name.",
          "Answer the user's location question using this result. Be clear that GPS accuracy varies; do not claim this is a live map view."
        ].join("\n")
      };
    }
  }
];

export async function runAuroraToolTree(userText) {
  const text = String(userText || "");
  const tool = capabilityTools.find((candidate) => candidate.matches(text));
  if (!tool) return null;
  try {
    const result = await tool.run();
    return { tool: tool.id, ...result };
  } catch (error) {
    return { tool: tool.id, error: error?.message || "The requested tool could not complete." };
  }
}

export function getAuroraToolTree() {
  return capabilityTools.map(({ id, description }) => ({ id, description }));
}
