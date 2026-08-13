// Refresh src/data/weather.json from the National Weather Service API.
// Runs in production (GitHub Actions) or locally with `npm run refresh:weather`.
// NOTE: not run inside the Cowork sandbox (its web-fetch policy blocks it) —
// it is exercised for real by the scheduled GitHub Action.
import { writeFile } from "node:fs/promises";

const LAT = 39.5287;
const LON = -84.0891; // Waynesville, OH
const headers = {
  "User-Agent": "WaynesvilleDailyBrief/1.0 (waynesville.news; editor@waynesville.news)",
  Accept: "application/geo+json",
};

async function getJSON(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const points = await getJSON(`https://api.weather.gov/points/${LAT},${LON}`);
  const forecast = await getJSON(points.properties.forecast);
  const periods = forecast.properties.periods;
  if (!periods?.length) throw new Error("no forecast periods");

  const now = periods[0];
  const day = periods.find((p) => p.isDaytime) ?? now;
  const night = periods.find((p) => !p.isDaytime) ?? now;

  const data = {
    _note: "Auto-refreshed from the NWS API (api.weather.gov, ILN/Wilmington office).",
    location: "Waynesville, OH",
    tempF: now.temperature,
    condition: now.shortForecast,
    highF: day.temperature,
    lowF: night.temperature,
    updated: new Date().toISOString(),
  };

  await writeFile(
    new URL("../src/data/weather.json", import.meta.url),
    JSON.stringify(data, null, 2) + "\n"
  );
  console.log(`weather.json updated: ${data.tempF}° ${data.condition}`);
}

main().catch((e) => {
  console.error("weather refresh failed:", e.message);
  process.exit(1);
});
