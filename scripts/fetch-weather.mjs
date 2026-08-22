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

  // Multi-day outlook: pair each daytime period with the period that
  // immediately follows it (its overnight) — index-parity-free, so this
  // works whether the run happens in the morning (periods[0] = "Today")
  // or the evening (periods[0] = "Tonight"). Skips the first day (already
  // covered by tempF/highF/lowF above) and caps at 3 days out.
  const dayPairs = [];
  for (let i = 0; i < periods.length; i++) {
    if (!periods[i].isDaytime) continue;
    const n = periods[i + 1];
    dayPairs.push({ d: periods[i], n: n && !n.isDaytime ? n : null });
  }
  const outlook = dayPairs.slice(1, 4).map(({ d, n }) => ({
    dayLabel: d.name.replace(/ Night$/, ""),
    highF: d.temperature,
    lowF: n ? n.temperature : null,
    condition: d.shortForecast,
  }));

  const data = {
    _note: "Auto-refreshed from the NWS API (api.weather.gov, ILN/Wilmington office).",
    location: "Waynesville, OH",
    tempF: now.temperature,
    condition: now.shortForecast,
    highF: day.temperature,
    lowF: night.temperature,
    outlook,
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
