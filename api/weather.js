const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Drizzle",
  55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain",
  67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  77: "Snow grains", 80: "Light rain showers", 81: "Rain showers",
  82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail"
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET." });
  }
  const rawCity = typeof req.query?.city === "string" ? req.query.city.trim() : "";
  if (!rawCity || rawCity.length > 100) return res.status(400).json({ error: "Enter a city or town (up to 100 characters)." });
  try {
    const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(rawCity) + "&count=1&language=en&format=json";
    const geoResponse = await fetch(geoUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!geoResponse.ok) throw new Error("Location lookup failed.");
    const geoData = await geoResponse.json();
    const place = geoData?.results?.[0];
    if (!place) return res.status(404).json({ error: "I couldn't find that place. Try a nearby city or a more specific name." });

    const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(place.latitude) +
      "&longitude=" + encodeURIComponent(place.longitude) +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=3";
    const weatherResponse = await fetch(weatherUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!weatherResponse.ok) throw new Error("Weather provider returned an error.");
    const data = await weatherResponse.json();
    const now = data.current || {};
    const daily = data.daily || {};
    const forecast = (daily.time || []).map((date, index) => ({
      date,
      description: WEATHER_CODES[daily.weather_code?.[index]] || "Conditions unavailable",
      high: daily.temperature_2m_max?.[index] ?? null,
      low: daily.temperature_2m_min?.[index] ?? null,
      rainChance: daily.precipitation_probability_max?.[index] ?? null
    }));
    const location = [place.name, place.admin1, place.country].filter(Boolean).filter((item, index, arr) => arr.indexOf(item) === index).join(", ");
    return res.status(200).json({
      location,
      current: {
        temperature: now.temperature_2m ?? null,
        apparentTemperature: now.apparent_temperature ?? null,
        humidity: now.relative_humidity_2m ?? null,
        windSpeed: now.wind_speed_10m ?? null,
        precipitation: now.precipitation ?? null,
        description: WEATHER_CODES[now.weather_code] || "Conditions unavailable"
      },
      units: { temperature: data.current_units?.temperature_2m || "°C", wind: data.current_units?.wind_speed_10m || "km/h" },
      forecast,
      updatedAt: now.time || null
    });
  } catch (error) {
    console.error("AURORA weather route failed:", error?.message || "Unknown error");
    return res.status(502).json({ error: "Weather is temporarily unavailable. Please try again shortly." });
  }
}