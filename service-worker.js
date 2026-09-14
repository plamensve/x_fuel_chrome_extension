const SUPABASE_URL = "https://eaqvhxfvozhzatrnbkvx.supabase.co";
const SUPABASE_KEY = "sb_publishable_u4ymkO5tFBauze0rVOkf-Q_kvbiIdwH";
const PRICE_TABLE = "fuel_prices";
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_CITY = 20;
const CACHE_KEY = "goriva_extension_snapshot_v2";
const CACHE_TTL_MS = 3 * 60 * 1000;

const CITIES = [
  {key: "sofia", label: "София", query: "София", url: "https://goriva.online/cities/sofia/"},
  {key: "plovdiv", label: "Пловдив", query: "Пловдив", url: "https://goriva.online/cities/plovdiv/"},
  {key: "varna", label: "Варна", query: "Варна", url: "https://goriva.online/cities/varna/"},
  {key: "burgas", label: "Бургас", query: "Бургас", url: "https://goriva.online/cities/burgas/"},
  {key: "ruse", label: "Русе", query: "Русе", url: "https://goriva.online/cities/ruse/"},
  {key: "stara-zagora", label: "Стара Загора", query: "Стара Загора", url: "https://goriva.online/cities/stara-zagora/"}
];

const FUELS = [
  {key: "a95", label: "A95", databaseValue: "Бензин A95", unit: "€/л"},
  {key: "diesel", label: "Дизел", databaseValue: "Дизел", unit: "€/л"},
  {key: "lpg", label: "LPG", databaseValue: "Пропан Бутан", unit: "€/л"},
  {key: "a100", label: "A100", databaseValue: "Бензин A100", unit: "€/л"},
  {key: "diesel_plus", label: "Дизел +", databaseValue: "Дизел премиум", unit: "€/л"},
  {key: "methane", label: "Метан", databaseValue: "Метан", unit: "€/кг"}
];

const FUEL_BY_DATABASE_VALUE = new Map(
  FUELS.map(fuel => [normalize(fuel.databaseValue), fuel])
);

function normalize(value) {
  return String(value || "").trim().toLocaleUpperCase("bg-BG");
}

function dateKey(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};
  parts.forEach(part => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return values.year + "-" + values.month + "-" + values.day;
}

function stationIdentity(row) {
  return normalize(row.location) || normalize(row.city) || normalize(row.station) || "НЕУТОЧНЕН ОБЕКТ";
}

async function fetchCityRows(cityName) {
  const rows = [];
  const endpoint = SUPABASE_URL + "/rest/v1/" + PRICE_TABLE;

  for (let page = 0; page < MAX_PAGES_PER_CITY; page += 1) {
    const params = new URLSearchParams({
      select: "station,city,region,location,fuel,price,created_at",
      city: "ilike." + cityName,
      order: "created_at.desc",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE)
    });

    const response = await fetch(endpoint + "?" + params.toString(), {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Supabase returned HTTP " + response.status);
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

function selectPublishedSnapshot(rows) {
  const dates = rows.map(row => dateKey(row.created_at)).filter(Boolean);
  const latestDate = dates.sort().at(-1) || "";

  const latestRows = rows.filter(row => dateKey(row.created_at) === latestDate);
  const currentEkoStations = new Set(
    latestRows
      .filter(row => normalize(row.station) === "ЕКО")
      .map(stationIdentity)
  );

  const fallback = new Map();

  rows.forEach(row => {
    if (normalize(row.station) !== "ЕКО") return;
    if (dateKey(row.created_at) === latestDate) return;

    const station = stationIdentity(row);
    if (!station || currentEkoStations.has(station)) return;

    const key = station + "|" + normalize(row.fuel);
    if (!fallback.has(key)) fallback.set(key, row);
  });

  return {
    latestDate,
    rows: latestRows.concat([...fallback.values()])
  };
}

function summarize(rows) {
  const stations = new Map();
  const valuesByFuel = new Map(FUELS.map(fuel => [fuel.key, []]));

  rows.forEach(row => {
    const fuel = FUEL_BY_DATABASE_VALUE.get(normalize(row.fuel));
    const price = Number(row.price);

    if (!fuel || !Number.isFinite(price) || price < 0) return;

    const location = String(row.location || row.station || "Бензиностанция").trim();
    const brand = String(row.station || "").trim() || "Бензиностанция";
    const stationKey = normalize(location);

    const station = stations.get(stationKey) || {
      brand,
      location,
      prices: {}
    };

    if (station.prices[fuel.key] === undefined || price < station.prices[fuel.key]) {
      station.prices[fuel.key] = price;
    }

    stations.set(stationKey, station);
    valuesByFuel.get(fuel.key).push({price, brand, location});
  });

  const fuels = {};

  FUELS.forEach(fuel => {
    const entries = valuesByFuel.get(fuel.key);

    if (!entries.length) {
      fuels[fuel.key] = null;
      return;
    }

    const summarizeEntries = selectedEntries => {
      const prices = selectedEntries.map(entry => entry.price);
      const lowestByStation = new Map();

      selectedEntries.forEach(entry => {
        const key = normalize(entry.location);
        const current = lowestByStation.get(key);

        if (!current || entry.price < current.price) {
          lowestByStation.set(key, entry);
        }
      });

      return {
        average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
        minimum: Math.min(...prices),
        maximum: Math.max(...prices),
        count: new Set(selectedEntries.map(entry => normalize(entry.location))).size,
        top: [...lowestByStation.values()]
          .sort((a, b) => a.price - b.price || a.location.localeCompare(b.location, "bg"))
          .slice(0, 5)
      };
    };

    const entriesByBrand = new Map();

    entries.forEach(entry => {
      const key = normalize(entry.brand);
      const group = entriesByBrand.get(key) || {key, label: entry.brand, entries: []};
      group.entries.push(entry);
      entriesByBrand.set(key, group);
    });

    const brands = [...entriesByBrand.values()]
      .map(group => ({
        key: group.key,
        label: group.label,
        ...summarizeEntries(group.entries)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "bg"));

    fuels[fuel.key] = {
      ...summarizeEntries(entries),
      brands
    };
  });

  return {
    recordCount: rows.length,
    stationCount: stations.size,
    fuels
  };
}

async function buildSnapshot() {
  const cities = await Promise.all(
    CITIES.map(async city => {
      try {
        const rows = await fetchCityRows(city.query);

        if (!rows.length) {
          return {
            key: city.key,
            label: city.label,
            url: city.url,
            date: "",
            recordCount: 0,
            stationCount: 0,
            fuels: {},
            error: "Няма налични записи."
          };
        }

        const selected = selectPublishedSnapshot(rows);

        return {
          key: city.key,
          label: city.label,
          url: city.url,
          date: selected.latestDate,
          ...summarize(selected.rows)
        };
      } catch (error) {
        return {
          key: city.key,
          label: city.label,
          url: city.url,
          date: "",
          recordCount: 0,
          stationCount: 0,
          fuels: {},
          error: error instanceof Error ? error.message : "Неуспешно зареждане."
        };
      }
    })
  );

  if (!cities.some(city => !city.error && city.recordCount > 0)) {
    throw new Error("Неуспешно зареждане на цените от Supabase.");
  }

  return {
    version: 1,
    fetchedAt: new Date().toISOString(),
    stale: false,
    cities
  };
}

async function readCache() {
  const stored = await chrome.storage.local.get(CACHE_KEY);
  return stored[CACHE_KEY] || null;
}

async function getSnapshot(force) {
  const cached = await readCache();

  if (
    !force &&
    cached &&
    cached.snapshot &&
    Date.now() - Number(cached.cachedAt || 0) < CACHE_TTL_MS
  ) {
    return cached.snapshot;
  }

  try {
    const snapshot = await buildSnapshot();

    await chrome.storage.local.set({
      [CACHE_KEY]: {
        cachedAt: Date.now(),
        snapshot
      }
    });

    return snapshot;
  } catch (error) {
    if (cached?.snapshot) {
      return {
        ...cached.snapshot,
        stale: true
      };
    }

    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "get-price-snapshot") return false;

  getSnapshot(Boolean(message.force))
    .then(snapshot => sendResponse({ok: true, snapshot}))
    .catch(error => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Неуспешно зареждане."
      });
    });

  return true;
});
