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
  fuel: "diesel",
  brand: "all"
};

const GENERIC_STATION_LOGO = "assets/station-logos/generic-fuel-pump.png";
const FEATURED_BRANDS = [
  {key: "eko", label: "ЕКО", logo: "assets/station-logos/eko-card-logo.png"},
  {key: "lukoil", label: "Лукойл", logo: "assets/station-logos/lukoil-card-logo.jpg"},
  {key: "insa", label: "Инса", logo: "assets/station-logos/insa-card-logo.png"},
  {key: "petrol", label: "Петрол", logo: "assets/station-logos/petrol-logo.jpg"},
  {key: "omv", label: "ОМВ", logo: "assets/station-logos/omv-logo.jpg"}
];
const BRAND_LOGOS = [
  {match: ["ECO PETROL", "ЕКО ПЕТРОЛ"], src: "assets/station-logos/ecopetrol.svg"},
  {match: ["POWER OIL", "POWERОIL", "ПАУЪР ОЙЛ"], src: "assets/station-logos/power-oil.png"},
  {match: ["ТОПЛИВО", "TOPLIVO"], src: "assets/station-logos/toplivo-logo.png"},
  {match: ["ПЕГАС", "PEGAS"], src: "assets/station-logos/pegas-logo.png"},
  {match: ["ROMPETROL", "РОМПЕТРОЛ"], src: "assets/station-logos/rompetrol-logo.png"},
  {match: ["PETROL", "ПЕТРОЛ"], src: "assets/station-logos/petrol-logo.jpg"},
  {match: ["INSA", "ИНСА"], src: "assets/station-logos/insa-card-logo.png"},
  {match: ["OMV", "ОМВ"], src: "assets/station-logos/omv-logo.jpg"},
  {match: ["SHELL", "ШЕЛ"], src: "assets/station-logos/shell-logo.png"},
  {match: ["LUKOIL", "ЛУКОЙЛ"], src: "assets/station-logos/lukoil-card-logo.jpg"},
  {match: ["KRUIZ", "CRUISE", "КРУИЗ"], src: "assets/station-logos/kruiz-logo.png"},
  {match: ["BULMARKET", "БУЛМАРКЕТ"], src: "assets/station-logos/bulmarket.svg"},
  {match: ["HIMOIL", "CHIMOIL", "ХИМОЙЛ"], src: "assets/station-logos/himoil-logo.png"},
  {match: ["DIESELOR", "DISELOR", "DIESELER", "ДИЗЕЛОР"], src: "assets/station-logos/diselor.svg"},
  {match: ["BENITA", "БЕНИТА"], src: "assets/station-logos/benita.svg"}
];

function normalizeBrand(value) {
  return String(value || "").trim().toLocaleUpperCase("bg-BG");
}

function logoForBrand(brand) {
  const normalized = normalizeBrand(brand);
  const matched = BRAND_LOGOS.find(item => item.match.some(token => normalized.includes(token)));

  if (matched) return matched.src;

  const name = String(brand || "");
  const isEkoOil = /(?:^|[^\p{L}\p{N}])(?:eko|еко)[\s\-–—_.\/]*(?:oil|ойл)(?=$|[^\p{L}\p{N}])/iu.test(name);
  const hasEkoToken = /(^|[^\p{L}\p{N}])(?:eko|еко)(?=$|[^\p{L}\p{N}])/iu.test(name);

  return hasEkoToken && !isEkoOil
    ? "assets/station-logos/eko-card-logo.png"
    : GENERIC_STATION_LOGO;
}

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
const brandButtons = document.getElementById("brand-buttons");
const brandFilterCount = document.getElementById("brand-filter-count");

let snapshot = null;
let selectedBrand = "all";

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

function createBrandButton(key, label, logo, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "brand-button";
  button.classList.toggle("is-all", key === "all");
  button.dataset.brand = key;
  button.classList.toggle("is-active", selectedBrand === key);
  button.setAttribute("aria-pressed", String(selectedBrand === key));
  button.disabled = disabled;

  if (logo) {
    const image = document.createElement("img");
    image.src = logo;
    image.alt = "";
    image.addEventListener("error", () => {
      image.src = GENERIC_STATION_LOGO;
    }, {once: true});
    button.appendChild(image);
  }

  const copy = document.createElement("span");
  if (key === "all") {
    copy.append(
      document.createTextNode("Всички"),
      document.createElement("br"),
      document.createTextNode("бензиностанции")
    );
  } else {
    copy.textContent = label;
  }
  button.appendChild(copy);

  if (!disabled) {
    button.addEventListener("click", async () => {
      selectedBrand = key;
      await saveSettings();
      render();
    });
  }

  return button;
}

function renderBrandButtons(stats) {
  const brands = Array.isArray(stats?.brands) ? stats.brands : [];
  const featured = FEATURED_BRANDS.map(brand => ({
    ...brand,
    stats: brands.find(item => item.key === brand.key) || null
  }));

  if (selectedBrand !== "all" && !featured.some(brand => brand.key === selectedBrand && brand.stats)) {
    selectedBrand = "all";
  }

  brandButtons.replaceChildren();
  brandButtons.appendChild(
    createBrandButton("all", "Всички бензиностанции", GENERIC_STATION_LOGO)
  );

  featured.forEach(brand => {
    brandButtons.appendChild(
      createBrandButton(
        brand.key,
        brand.label,
        brand.logo,
        !brand.stats
      )
    );
  });

  brandFilterCount.textContent = "5 вериги";
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

    const logo = document.createElement("img");
    logo.className = "top-item-logo";
    logo.src = logoForBrand(item.brand);
    logo.alt = "";
    logo.addEventListener("error", () => {
      logo.src = GENERIC_STATION_LOGO;
    }, {once: true});

    copy.append(brand, location);
    row.append(logo, copy, price);
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
    renderBrandButtons(null);
    emptyState.hidden = false;
    setMessage("Няма заредени данни за " + city.label + ".", snapshot.stale);
    return;
  }

  const stats = cityData.fuels[fuel.key];

  if (!stats) {
    renderBrandButtons(null);
    emptyState.hidden = false;
    setMessage(
      "Последни налични данни за " + city.label + ": " + formatDateKey(cityData.date),
      snapshot.stale
    );
    return;
  }

  renderBrandButtons(stats);
  const activeStats = selectedBrand === "all"
    ? stats
    : stats.brands.find(brand => brand.key === selectedBrand);

  if (!activeStats) {
    emptyState.hidden = false;
    return;
  }

  summaryCard.hidden = false;
  summaryTitle.textContent = selectedBrand === "all"
    ? fuel.label
    : fuel.label + " · " + activeStats.label;
  averageValue.textContent = formatPrice(activeStats.average, fuel.unit);
  minimumValue.textContent = formatPrice(activeStats.minimum, fuel.unit);
  maximumValue.textContent = formatPrice(activeStats.maximum, fuel.unit);
  stationCount.textContent = String(activeStats.count);
  rangeText.textContent =
    "Диапазон: " +
    formatPrice(activeStats.minimum, fuel.unit) +
    " – " +
    formatPrice(activeStats.maximum, fuel.unit);

  renderTop(activeStats.top || [], fuel.unit);

  const freshness = snapshot.stale ? " (кеширани данни)" : "";
  setMessage(
    "Последни налични данни за " + city.label + ": " + formatDateKey(cityData.date) + freshness,
    snapshot.stale
  );
}

async function saveSettings() {
  await chrome.storage.sync.set({
    city: citySelect.value,
    fuel: fuelSelect.value,
    brand: selectedBrand
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
  selectedBrand = typeof settings.brand === "string" ? settings.brand : "all";
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
  selectedBrand = "all";
  await saveSettings();
  render();
});

fuelSelect.addEventListener("change", async () => {
  selectedBrand = "all";
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
