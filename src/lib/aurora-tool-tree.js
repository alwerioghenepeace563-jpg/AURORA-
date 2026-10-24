// AURORA's shared capability tree: one orchestrator can combine local memory,
// device context, weather, web/news, and navigation for a single useful answer.
import { auroraApiUrl, requestAuroraContactsPermission, searchAuroraContacts, openAuroraDialer } from "./aurora-native";

function formatPlace(address = {}) {
  return [address.road, address.suburb || address.neighbourhood,
    address.city || address.town || address.village || address.county,
    address.state, address.country]
    .filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(", ");
}

function readLocalMemory(query, limit = 8) {
  if (typeof localStorage === "undefined") return [];
  const q = String(query || "").toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter(word => word.length > 3);
  const records = [];
  const add = (kind, label, text, date = "") => {
    const body = String(text || "").trim();
    if (!body) return;
    const haystack = (label + " " + body).toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    if (score || /journey|visit|travel|presentation|meeting|appointment|route|trip|destination|event|project/i.test(q)) {
      records.push({ kind, label: String(label || kind).slice(0, 100), text: body.slice(0, 500), date, score });
    }
  };
  try {
    const sessions = JSON.parse(localStorage.getItem("aurora-chat-sessions") || "[]");
    for (const session of (Array.isArray(sessions) ? sessions : []).slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0, 40)) {
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const matching = messages.filter(m => m && typeof m.content === "string" && /user|assistant/.test(m.role))
        .filter(m => {
          const t = m.content.toLowerCase();
          return terms.some(term => t.includes(term)) ||
            (/journey|visit|travel|presentation|meeting|appointment|route|trip|destination|event/i.test(q) &&
             /went to|visited|travelled|traveled|presentation|meeting|appointment|journey|trip|route|destination|tomorrow|today/i.test(t));
        }).slice(-3);
      for (const m of matching) add("previous_conversation", session.title || "Previous chat", m.role.toUpperCase() + ": " + m.content, session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : "");
    }
  } catch {}
  for (const [key, kind] of [["aurora-notes","saved_note"],["aurora-tasks","saved_task"],["aurora-calendar-events","calendar_event"],["aurora-reminders","reminder"]]) {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      for (const item of (Array.isArray(items) ? items : []).slice(0, 80)) {
        add(kind, item.title || item.name || item.label || kind,
          [item.title, item.text, item.content, item.description, item.note, item.instruction, item.location, item.destination, item.status].filter(Boolean).join(" — "),
          item.date || item.startAt || item.dueAt || "");
      }
    } catch {}
  }
  return records.sort((a,b)=>b.score-a.score).slice(0, limit);
}

async function getDeviceLocation({ fresh = false } = {}) {
  if (!globalThis.navigator?.geolocation) throw new Error("This device or browser does not support location access.");
  // Prefer a recent cached/coarse fix first: high-accuracy GPS can take a long
  // time to lock on budget Android phones and inside WebViews.
  const getPosition = (options) => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
  let position;
  try {
    position = await getPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: fresh ? 0 : 120000 });
  } catch (firstError) {
    if (firstError?.code === 1) {
      throw new Error("Location permission was denied. Allow location access for AURORA in Android app settings, then ask again.");
    }
    try {
      position = await getPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: fresh ? 0 : 120000 });
    } catch (error) {
      const message = error?.code === 1
        ? "Location permission was denied. Allow location access for AURORA in Android app settings, then ask again."
        : error?.code === 3
          ? "AURORA couldn't get a GPS fix after waiting. Turn on Location, enable Google Location Accuracy if available, and try near a window or outdoors. You can also name your town."
          : "AURORA couldn't get your location. Check Location permission and GPS, or tell AURORA your town.";
      throw new Error(message);
    }
  }
  const { latitude, longitude, accuracy } = position.coords;
  let place = "";
  try {
    const response = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + latitude + "&lon=" + longitude, { headers: { Accept: "application/json" } });
    if (response.ok) { const data = await response.json(); place = formatPlace(data.address || {}) || data.display_name || ""; }
  } catch {}
  return { latitude, longitude, accuracy, place };
}

async function searchWeb(query) {
  const response = await fetch(auroraApiUrl("/api/search"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Web search could not complete.");
  return { source: data.source || "web search", results: Array.isArray(data.results) ? data.results.slice(0, 5) : [] };
}

async function getWeather(city) {
  const response = await fetch(auroraApiUrl("/api/weather?city=") + encodeURIComponent(city));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Weather could not be loaded.");
  const current = data.current || {};
  return {
    location: data.location || city,
    current: current.description + ", " + current.temperature + (data.units?.temperature || "°C"),
    feelsLike: current.apparentTemperature,
    humidity: current.humidity,
    wind: current.windSpeed,
    forecast: (data.forecast || []).map(day => day.date + ": " + day.description + ", high " + day.high + "°, low " + day.low + "°, rain chance " + day.rainChance + "%"),
    updatedAt: data.updatedAt
  };
}

function findDestination(text) {
  const patterns = [
    /\b(?:should i go|do you think i should go|plan (?:a )?(?:trip|journey) to|travel to|visit|go to|head to|journey to|trip to|route to|directions to|navigate to|take me to)\s+(.+?)(?:\s+(?:today|tomorrow|this morning|this afternoon|tonight|now|later|next week)\b|[?.!,]|$)/i,
    /\b(?:presentation|meeting|appointment|event)\s+(?:at|in|near)\s+(.+?)(?:[?.!,]|$)/i
  ];
  for (const pattern of patterns) { const m = text.match(pattern); if (m?.[1]) return m[1].trim().replace(/\b(the|there|today|tomorrow)$/i, "").trim(); }
  return "";
}

async function journeyBrief(text) {
  let destination = findDestination(text);
  const memory = readLocalMemory(destination || text, 10);
  // Resolve vague references such as "that place" from the user's own saved context.
  const vagueDestination = /\b(that place|the place i (?:mentioned|told you about)|where i (?:said|told you)|there|that destination)\b/i.test(text);
  if (!destination || vagueDestination) {
    for (const record of memory) {
      const inferred = findDestination(record.text);
      if (inferred) { destination = inferred; break; }
    }
  }
  const sections = ["Tool: journey_decision_brief. Combined travel context; this is guidance, not a guarantee."];
  sections.push("User's request: " + text);
  if (destination) sections.push("Likely destination: " + destination);
  if (memory.length) sections.push("RELEVANT AURORA ON-DEVICE MEMORY (past chats, saved notes, tasks, reminders and calendar events; may contain incomplete references):\n" +
    memory.map((m,i)=>(i+1)+". ["+m.kind+"] "+m.label+(m.date ? " ("+m.date+")" : "")+": "+m.text).join("\n"));
  else sections.push("No clearly matching saved AURORA memory was found. Do not pretend to know whether the user has visited before; ask or state that no record was found.");

  let location = null;
  try {
    location = await getDeviceLocation();
    sections.push("CURRENT DEVICE LOCATION: "+(location.place || "coordinates available")+"; coordinates "+location.latitude+","+location.longitude+"; estimated accuracy "+Math.round(location.accuracy)+"m.");
  } catch (error) {
    sections.push("CURRENT DEVICE LOCATION unavailable: "+error.message+". Do not invent an origin or town.");
  }

  // If no destination was named, still check local conditions when location is available.
  const contextPlace = destination || location?.place || "";
  if (contextPlace) {
    const jobs = [];
    jobs.push(getWeather(contextPlace).then(weather => ({kind:"weather",value:weather})).catch(error=>({kind:"weather_error",value:error.message})));
    jobs.push(searchWeb(contextPlace+" traffic road closures events incidents today").then(result=>({kind:"local_conditions_and_traffic",value:result})).catch(error=>({kind:"search_error",value:error.message})));
    jobs.push(searchWeb(contextPlace+" latest local news events happening today").then(result=>({kind:"local_news_and_events",value:result})).catch(error=>({kind:"news_error",value:error.message})));
    const results = await Promise.all(jobs);
    for (const item of results) {
      if (item.kind === "weather") sections.push("DESTINATION/LOCAL WEATHER: "+JSON.stringify(item.value));
      else if (item.kind === "local_conditions_and_traffic" || item.kind === "local_news_and_events") {
        sections.push(item.kind.toUpperCase().replace(/_/g," ")+": "+(item.value.results.length ? item.value.results.map((r,i)=>(i+1)+". "+r.title+" — "+r.snippet+" Source: "+r.url).join("\n") : "No useful results returned."));
      } else sections.push(item.kind.toUpperCase()+": "+item.value);
    }
  } else {
    sections.push("Weather and local-news checks could not run because location permission is unavailable and no town/destination was named. Ask the user for their town or destination; do not claim the checks were completed.");
  }

  if (destination) {
    const dest = encodeURIComponent(destination);
    const origin = location ? "&origin="+encodeURIComponent(location.latitude+","+location.longitude) : "";
    sections.push("GOOGLE MAPS ROUTE: https://www.google.com/maps/dir/?api=1&destination="+dest+origin+"&travelmode=driving");
    sections.push("GOOGLE MAPS DESTINATION: https://www.google.com/maps/search/?api=1&query="+dest);
  } else {
    sections.push("DESTINATION NEEDED FOR ROUTING: The user asked about travel but did not specify where they are going. Ask for the destination. Do not invent one. Local weather/news may still be useful if location was available.");
  }
  sections.push("DECISION RULES: Explain what is known vs unknown. Consider weather, current dated news/events, traffic/road incidents, route/ETA (if a provider supplied it), calendar/task conflicts and prior notes. Recommend a departure window only when evidence supports it; public search results are not guaranteed live traffic. Never claim to have checked a past visit unless memory actually shows it. Be clear if a check failed. Use links in the answer when helpful.");
  return { context: sections.join("\n\n") };
}

const capabilityTools = [
  {
    id: "journey_decision_brief",
    description: "Combines prior AURORA memory, current location, destination weather, news/events, traffic/road incident searches and Google Maps route links for go/no-go and departure timing.",
    matches: text => /\b(should i go|do you think i should go|should i travel|should we travel|help me decide whether i should travel|before i travel|before travelling|before traveling|journey|trip|travel plan|visit there|go there|head there|traffic|road closure|presentation|meeting|appointment|what have i done before|did i visit|have i been there|things i have done|what happened last time)\b/i.test(text) && /\b(today|tomorrow|there|journey|trip|travel|go|visit|destination|presentation|meeting|appointment|traffic|before|last time|plan|place|weather|news|route)\b/i.test(text),
    run: journeyBrief
  },
  {
    id: "device_location",
    description: "Current GPS location and place lookup.",
    matches: text => /\b(where am i|my current location|current location|where are we|locate me|show where i am|my position|where am i right now)\b/i.test(text) && !/\b(?:google\s+)?maps?\b|\bopen (?:the )?map\b|\bshow (?:me )?(?:my )?(?:current )?location on\b/i.test(text),
    run: async () => {
      const location = await getDeviceLocation();
      return { context: ["Tool: device_location.", "Place: "+(location.place || "unresolved"), "Latitude: "+location.latitude, "Longitude: "+location.longitude, "Accuracy: approximately "+Math.round(location.accuracy)+"m. GPS accuracy varies."].join("\n") };
    }
  },
  {
    id: "weather",
    description: "Current weather and forecast; resolves 'here' using the device location.",
    matches: text => /\b(weather|forecast|temperature outside|is it raining|will it rain|rain today)\b/i.test(text),
    run: async text => {
      const match = text.match(/\b(?:weather|forecast|temperature outside|is it raining|will it rain|rain today)\b(?:\s+(?:like\s+)?(?:in|for|at)\s+([^?.!,]+))?/i);
      let city = match?.[1]?.trim() || "";
      if (!city || /^(here|my location|where i am|outside|today|now)$/i.test(city)) city = (await getDeviceLocation()).place;
      if (!city) throw new Error("I couldn't identify your town. Ask for weather in a named city, such as Benin City.");
      return { context: "Tool: live_weather. "+JSON.stringify(await getWeather(city)) };
    }
  },
  {
    id: "web_search",
    description: "Search current web facts, news, events and sources.",
    matches: text => /\b(search (?:the web )?for|look up|find online|search online|latest news|news today|what's happening in|what is happening in)\b/i.test(text),
    run: async text => {
      const query = text.replace(/^\s*(?:aurora[, ]*)?(?:please\s+)?(?:search (?:the web )?for|look up|find online|search online)\s*/i, "").trim() || text.trim();
      const result = await searchWeb(query);
      return { context: "Tool: web_search. Query: "+query+"; source: "+result.source+"\n"+result.results.map((item,i)=>(i+1)+". "+item.title+"\n"+item.snippet+"\nURL: "+item.url).join("\n\n") };
    }
  },
  {
    id: "maps_navigation",
    description: "Destination map, route, satellite and Street View links.",
    matches: text => /\b(directions to|route to|navigate to|how do i get to|take me to|show (?:me )?(?:the )?map|open (?:google )?maps|satellite view|street view|where is)\b/i.test(text),
    run: async text => {
      const destination = findDestination(text) || "";
      const asksForCurrentPosition = /\b(?:my\s+)?(?:current|present|live|fresh)\s+(?:gps\s+)?(?:device\s+)?location\b|\bwhere am i(?: right now)?\b|\bwhere i am\b|\bmy position\b|\bmy location\b/i.test(text);
      let location = null;
      if (asksForCurrentPosition || /\b(from here|from my location|from where i am|current location|where i am)\b/i.test(text)) {
        location = await getDeviceLocation({ fresh: /\b(refresh|fresh|latest|right now|current)\b/i.test(text) });
      }
      // For a "show my current location" request, use actual coordinates in the
      // Maps URL instead of the literal words "my current location".
      const mapTarget = destination || (location ? location.latitude+","+location.longitude : "my current location");
      const query = encodeURIComponent(mapTarget);
      const origin = location ? "&origin="+encodeURIComponent(location.latitude+","+location.longitude) : "";
      const mapUrl = "https://www.google.com/maps/search/?api=1&query="+query;
      const directionsUrl = destination
        ? "https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(destination)+origin+"&travelmode=driving"
        : mapUrl;
      return { context: ["Tool: maps_navigation.",
        asksForCurrentPosition && location
          ? "ACTION REQUIRED: The user asked to show their current location. Give them the direct clickable Google Maps link below, not generic instructions. Explain it is centered on the fresh GPS coordinates AURORA just obtained. Do not claim inability to read GPS because coordinates are present."
          : "ACTION REQUIRED: Provide the relevant direct Google Maps link below. If the user asked to refresh current location but GPS failed, state the real tool error and do not give generic Google Maps instructions.",
        "Destination: "+(destination || (location ? (location.place || "current GPS position") : "not specified")),
        location ? "GPS coordinates: "+location.latitude+","+location.longitude+" (estimated accuracy "+Math.round(location.accuracy)+"m)." : "",
        "Open Google Maps at this location: "+mapUrl,
        destination ? "Google Maps directions: "+directionsUrl : "",
        /\bsatellite\b/i.test(text) ? "Satellite: https://www.google.com/maps/search/?api=1&query="+query+"&basemap=satellite" : "",
        /\bstreet view\b/i.test(text) ? "Street View: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint="+encodeURIComponent(destination || mapTarget) : "",
        "Do not merely tell the user how to search manually when a direct Maps link is available. Satellite/Street View coverage varies by place."].filter(Boolean).join("\n") };
    }
  },
  {
    id: "aurora_memory",
    description: "Searches locally saved AURORA conversations, notes, tasks, reminders and calendar events to recall relevant past work and preferences.",
    matches: text => /\b(remember|what did i|what have i|did i ever|have i ever|last time|before|previous|presentation|project i did|things i did|what was my)\b/i.test(text),
    run: async text => {
      const memory = readLocalMemory(text, 12);
      return { context: "Tool: aurora_memory. Search scope: this device's saved AURORA chat sessions, notes, tasks, reminders and calendar events.\n" +
        (memory.length ? memory.map((m,i)=>(i+1)+". ["+m.kind+"] "+m.label+(m.date ? " ("+m.date+")" : "")+": "+m.text).join("\n") :
        "No matching saved record found. Be transparent; don't invent a memory.") };
    }
  }
];

export async function runAuroraToolTree(userText) {
  const contactCallMatch = String(userText || "").match(/^\\s*(?:hey\\s+aurora[, ]*)?(?:please\\s+)?(?:call|phone|ring|dial)\\s+(?:my\\s+)?(.+?)\\s*[?.!]*\\s*$/i);
  if (contactCallMatch) {
    const requestedName = contactCallMatch[1].trim().replace(/\\s+(?:now|please|for me)$/i, "").trim();
    if (!requestedName) {
      return { tool: "call_contact", context: "Please say the contact name, for example: call Mom." };
    }
    try {
      const permission = await requestAuroraContactsPermission();
      if (!permission.granted) {
        return { tool: "call_contact", context: "AURORA needs Contacts permission to find that person. Allow Contacts permission, then try again." };
      }
      const found = await searchAuroraContacts(requestedName);
      const unique = [];
      const seen = new Set();
      for (const contact of found) {
        const key = String(contact.number || "").replace(/[^0-9+]/g, "");
        if (!key) continue;
        const identity = (contact.name || "").toLowerCase() + "|" + key;
        if (!seen.has(identity)) {
          seen.add(identity);
          unique.push({ ...contact, number: contact.number });
        }
      }
      if (!unique.length) {
        return { tool: "call_contact", context: 'I could not find a phone number for "' + requestedName + '". Check the saved contact name and try again.' };
      }
      if (unique.length > 1) {
        const choices = unique.slice(0, 5).map(c => (c.name || "Unknown contact") + " â€” " + c.number).join("; ");
        return { tool: "call_contact", context: "I found more than one matching contact/number. Please say the exact name or choose one: " + choices };
      }
      const contact = unique[0];
      await openAuroraDialer(contact.number);
      return { tool: "call_contact", context: "I opened the phone dialler for " + (contact.name || requestedName) + " (" + contact.number + "). Review the number and tap Call when ready." };
    } catch (error) {
      return { tool: "call_contact", context: "I could not complete the contact lookup: " + (error?.message || "unknown error") + ". You can still open Contacts and try again." };
    }
  }


  const text = String(userText || "");
  const tool = capabilityTools.find(candidate => candidate.matches(text));
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
