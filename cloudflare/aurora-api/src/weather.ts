interface WeatherEnv {
  AURORA_ALLOWED_ORIGIN?: string;
}

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Drizzle",
  55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain",
  67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
  77: "Snow grains", 80: "Light rain showers", 81: "Rain showers",
  82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail"
};

function weatherHeaders(request: Request, env: WeatherEnv): Headers {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set([
    new URL(request.url).origin,
    "https://localhost", "http://localhost", "capacitor://localhost",
    "ionic://localhost", "https://aurora-ten-gold.vercel.app",
    ...(env.AURORA_ALLOWED_ORIGIN || "").split(",").map(value => value.trim().replace(/\/+$/, "")).filter(Boolean)
  ]);
  let preview = false;
  try {
    const parsed = new URL(origin);
    preview = parsed.protocol === "https:" && /^aurora-[a-z0-9-]+-smart-bm\.vercel\.app$/i.test(parsed.hostname);
  } catch {}
  const headers = new Headers({
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    "Content-Type": "application/json; charset=utf-8"
  });
  if (origin && (allowed.has(origin) || preview)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function response(body: unknown, headers: Headers, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleWeather(request: Request, env: WeatherEnv): Promise<Response> {
  const headers = weatherHeaders(request, env);
  const origin = request.headers.get("Origin") || "";
  if (origin && !headers.has("Access-Control-Allow-Origin")) {
    return response({ error: "Origin not allowed." }, headers, 403);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") {
    headers.set("Allow", "GET, OPTIONS");
    return response({ error: "Use GET." }, headers, 405);
  }

  const rawCity = new URL(request.url).searchParams.get("city")?.trim() || "";
  if (!rawCity || rawCity.length > 100 || /[\u0000-\u001f\u007f]/.test(rawCity)) {
    return response({ error: "Enter a city or town (up to 100 characters)." }, headers, 400);
  }

  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.search = new URLSearchParams({ name: rawCity, count: "1", language: "en", format: "json" }).toString();
    const geoResponse = await fetch(geoUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!geoResponse.ok) throw new Error("Location lookup failed.");
    const geoData: any = await geoResponse.json();
    const place = geoData?.results?.[0];
    if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
      return response({ error: "I couldn't find that place. Try a nearby city or a more specific name." }, headers, 404);
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "auto",
      forecast_days: "3"
    }).toString();
    const weatherResponse = await fetch(weatherUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000)
    });
    if (!weatherResponse.ok) throw new Error("Weather provider returned an error.");
    const data: any = await weatherResponse.json();
    const now = data.current || {};
    const daily = data.daily || {};
    const forecast = (Array.isArray(daily.time) ? daily.time : []).map((date: string, index: number) => ({
      date,
      description: WEATHER_CODES[daily.weather_code?.[index]] || "Conditions unavailable",
      high: daily.temperature_2m_max?.[index] ?? null,
      low: daily.temperature_2m_min?.[index] ?? null,
      rainChance: daily.precipitation_probability_max?.[index] ?? null
    }));
    const location = [place.name, place.admin1, place.country]
      .filter(Boolean).filter((item: string, index: number, arr: string[]) => arr.indexOf(item) === index).join(", ");
    return response({
      location,
      current: {
        temperature: now.temperature_2m ?? null,
        apparentTemperature: now.apparent_temperature ?? null,
        humidity: now.relative_humidity_2m ?? null,
        windSpeed: now.wind_speed_10m ?? null,
        precipitation: now.precipitation ?? null,
        description: WEATHER_CODES[now.weather_code] || "Conditions unavailable"
      },
      units: {
        temperature: data.current_units?.temperature_2m || "°C",
        wind: data.current_units?.wind_speed_10m || "km/h"
      },
      forecast,
      updatedAt: now.time || null
    }, headers);
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return response({
      error: timedOut ? "Weather lookup timed out. Please try again shortly." : "Weather is temporarily unavailable. Please try again shortly."
    }, headers, 502);
  }
}
