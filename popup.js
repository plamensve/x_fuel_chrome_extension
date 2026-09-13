const CITIES = [
  {key: "sofia", label: "София", url: "https://goriva.online/cities/sofia/"},
  {key: "plovdiv", label: "Пловдив", url: "https://goriva.online/cities/plovdiv/"},
  {key: "varna", label: "Варна", url: "https://goriva.online/cities/varna/"},
  {key: "burgas", label: "Бургас", url: "https://goriva.online/cities/burgas/"},
  {key: "ruse", label: "Русе", url: "https://goriva.online/cities/ruse/"},
  {key: "stara-zagora", label: "Стара Загора", url: "https://goriva.online/cities/stara-zagora/"}
];

const FUELS = [
  {key: "a95", label: "A95", unit: "€/л"},
  {key: "diesel", label: "Дизел", unit: "€/л"},
  {key: "lpg", label: "LPG", unit: "€/л"},
  {key: "a100", label: "A100", unit: "€/л"},
  {key: "diesel_plus", label: "Дизел +", unit: "€/л"},
  {key: "methane", label: "Метан", unit: "€/кг"}
];

const DEFAULT_SETTINGS = {
  city: "sofia",
  fuel: "diesel"
};

const citySelect = document.getElementById("city-select");
const fuelSelect = document.getElementById("fuel-select");
const refreshButton = document.getElementById("refresh-button");
const retryButton = document.getElementById("retry-button");
const brandLink = document.getElementById("brand-link");
const dataStatus = document.getElementById("data-status");
const summaryCard = document.getElementById("summary-card");
const summaryTitle = document.getElementById("summary-title");
const fuelUnit = document.getElementById("fuel-unit");
const averageValue = document.getElementById("average-value");
const minimumValue = document.getElementById("minimum-value");
const maximumValue = document.getElementById("maximum-value");
const stationCount = document.getElementById("station-count");
const rangeText = document.getElementById("range-text");
const topSection = document.getElementById("top-section");
const topList = document.getElementById("top-list");
const emptyState = document.getElementById("empty-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");
const openCityLink = document.getElementById("open-city-link");

let snapshot = null;

function getCity() {
  return CITIES.find(city => city.key === citySelect.value) || CITIES[0];
}

function getFuel() {
  return FUELS.find(fuel => fuel.key === fuelSelect.value) || FUELS[1];
}

function formatPrice(value, unit) {
  if (!Number.isFinite(Number(value))) return "—";

  return Number(value).toLocaleString("bg-BG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + unit;
}

function formatDateKey(value) {
  if (!value) return "няма дата";

  const date = new Date(value + "T12:00:00Z");
  const parts = new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).formatToParts(date);

  const values = {};
  parts.forEach(part => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return values.day + " " + values.month + " " + values.year + " г.";
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.classList.toggle("is-loading", isLoading);
}

function setMessage(message, stale) {
  dataStatus.textContent = message;
  dataStatus.classList.toggle("is-stale", Boolean(stale));
}

function clearView() {
  summaryCard.hidden = true;
  topSection.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  topList.replaceChildren();
}

function renderTop(top, unit) {
  topList.replaceChildren();

  top.forEach(item => {
    const row = document.createElement("li");

    const copy = document.createElement("div");
    copy.className = "top-item-copy";

    const brand = document.createElement("strong");
    brand.className = "top-item-brand";
    brand.textContent = item.brand || "Бензиностанция";

    const location = document.createElement("span");
    location.className = "top-item-location";
    location.textContent = item.location || "Неуточнен обект";

    const price = document.createElement("strong");
    price.className = "top-item-price";
    price.textContent = formatPrice(item.price, unit);

    copy.append(brand, location);
    row.append(copy, price);
    topList.appendChild(row);
  });

  topSection.hidden = top.length === 0;
}

function render() {
  if (!snapshot) return;

  const city = getCity();
  const fuel = getFuel();
  const cityData = snapshot.cities.find(item => item.key === city.key);

  clearView();
  summaryTitle.textContent = fuel.label;
  fuelUnit.textContent = fuel.unit;
  openCityLink.href = city.url;

  if (!cityData || cityData.error) {
    emptyState.hidden = false;
    setMessage("Няма заредени данни за " + city.label + ".", snapshot.stale);
    return;
  }

  const stats = cityData.fuels[fuel.key];

  if (!stats) {
    emptyState.hidden = false;
    setMessage(
      "Последни налични данни за " + city.label + ": " + formatDateKey(cityData.date),
      snapshot.stale
    );
    return;
  }

  summaryCard.hidden = false;
  averageValue.textContent = formatPrice(stats.average, fuel.unit);
  minimumValue.textContent = formatPrice(stats.minimum, fuel.unit);
  maximumValue.textContent = formatPrice(stats.maximum, fuel.unit);
  stationCount.textContent = String(stats.count);
  rangeText.textContent =
    "Диапазон: " +
    formatPrice(stats.minimum, fuel.unit) +
    " – " +
    formatPrice(stats.maximum, fuel.unit);

  renderTop(stats.top || [], fuel.unit);

  const freshness = snapshot.stale ? " (кеширани данни)" : "";
  setMessage(
    "Последни налични данни за " + city.label + ": " + formatDateKey(cityData.date) + freshness,
    snapshot.stale
  );
}

async function saveSettings() {
  await chrome.storage.sync.set({
    city: citySelect.value,
    fuel: fuelSelect.value
  });
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  if (CITIES.some(city => city.key === settings.city)) {
    citySelect.value = settings.city;
  }

  if (FUELS.some(fuel => fuel.key === settings.fuel)) {
    fuelSelect.value = settings.fuel;
  }
}

async function requestSnapshot(force) {
  clearView();
  setLoading(true);
  setMessage("Зареждане на актуалните цени…", false);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "get-price-snapshot",
      force: Boolean(force)
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Неуспешно зареждане.");
    }

    snapshot = response.snapshot;
    render();
  } catch (error) {
    errorState.hidden = false;
    errorMessage.textContent = "Опитай отново. " + (error.message || "");
    setMessage("Временно няма връзка с източника на цените.", false);
  } finally {
    setLoading(false);
  }
}

citySelect.addEventListener("change", async () => {
  await saveSettings();
  render();
});

fuelSelect.addEventListener("change", async () => {
  await saveSettings();
  render();
});

refreshButton.addEventListener("click", () => requestSnapshot(true));
retryButton.addEventListener("click", () => requestSnapshot(true));

brandLink.addEventListener("click", event => {
  event.preventDefault();
  chrome.tabs.create({url: brandLink.href});
});

openCityLink.addEventListener("click", event => {
  event.preventDefault();
  chrome.tabs.create({url: openCityLink.href});
});

(async function init() {
  await loadSettings();
  await requestSnapshot(false);
})();
