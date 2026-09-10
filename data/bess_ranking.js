(() => {
  const dataset = window.SPOT_PRICE_DATA;
  if (!dataset) return;

  const metrics = {
    tb1: { label: "TB1 – Top/Bottom 1 hour", index: 0 },
    tb2: { label: "TB2 – Top/Bottom 2 hours", index: 1 },
    tb4: { label: "TB4 – Top/Bottom 4 hours", index: 2 },
    bess1: { label: "BESS 2h – up to 1 cycle", index: 3 },
    bess2: { label: "BESS 2h – up to 2 cycles", index: 4 },
  };

  const metricSelect = document.querySelector("#metricSelect");
  const granularitySelect = document.querySelector("#granularitySelect");
  const yearSelect = document.querySelector("#yearSelect");
  const monthSelect = document.querySelector("#monthSelect");
  const daySelect = document.querySelector("#daySelect");
  const unitSelect = document.querySelector("#unitSelect");
  const rankingTitle = document.querySelector("#rankingTitle");
  const unitLabel = document.querySelector("#unitLabel");
  const valueHeader = document.querySelector("#valueHeader");
  const tableBody = document.querySelector("#tableBody");
  const leaderValue = document.querySelector("#leaderValue");
  const medianValue = document.querySelector("#medianValue");
  const medianLabel = document.querySelector("#medianLabel");
  const marketsValue = document.querySelector("#marketsValue");

  const formatValue = value => value === null || Number.isNaN(value)
    ? "-"
    : Math.round(value).toLocaleString("en-US");
  const formatMonth = key => {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
  };
  const uniqueSorted = values => [...new Set(values)].sort();
  const unit = () => unitSelect.value === "year" ? "EUR/MW/year" : "EUR/MW/day";
  const scale = value => value * (unitSelect.value === "year" ? 365 : 1);

  function populateMetrics() {
    Object.entries(metrics).forEach(([key, metric]) => metricSelect.add(new Option(metric.label, key)));
  }

  function availableYears() {
    return uniqueSorted(dataset.countries.flatMap(country => Object.keys(dataset.series[country.name].years)));
  }

  function populateYears() {
    const years = availableYears();
    yearSelect.innerHTML = "";
    years.forEach(year => yearSelect.add(new Option(year, year)));
    yearSelect.value = years.at(-1);
  }

  function populateMonths() {
    const months = uniqueSorted(dataset.countries.flatMap(country => {
      const year = dataset.series[country.name].years[yearSelect.value];
      return year ? Object.keys(year.months) : [];
    }));
    monthSelect.innerHTML = "";
    months.forEach(month => monthSelect.add(new Option(formatMonth(month).replace(` ${yearSelect.value}`, ""), month)));
    monthSelect.value = months.at(-1);
  }

  function populateDays() {
    const days = uniqueSorted(dataset.countries.flatMap(country => {
      const month = dataset.series[country.name].years[yearSelect.value]?.months[monthSelect.value];
      return month ? month.days.filter(day => day.observations > 0).map(day => day.day) : [];
    })).sort((a, b) => a - b);
    daySelect.innerHTML = "";
    days.forEach(day => daySelect.add(new Option(String(day), String(day))));
    daySelect.value = String(days.at(-1) || "");
  }

  function valueFor(countryName) {
    const year = dataset.series[countryName].years[yearSelect.value];
    if (!year) return null;
    const metric = metrics[metricSelect.value];
    const granularity = granularitySelect.value;
    if (granularity === "year") {
      return { value: year.averageSpreadIndexes?.[metric.index], coverage: `${year.spreadDays || 0} days` };
    }
    const month = year.months[monthSelect.value];
    if (!month) return null;
    if (granularity === "month") {
      return { value: month.averageSpreadIndexes?.[metric.index], coverage: `${month.spreadDays || 0} days` };
    }
    const day = month.days.find(item => String(item.day) === daySelect.value);
    return day ? { value: day.spreadIndexes?.[metric.index], coverage: `${day.observations} hours` } : null;
  }

  function periodLabel() {
    if (granularitySelect.value === "year") return yearSelect.value;
    if (granularitySelect.value === "month") return formatMonth(monthSelect.value);
    return `${daySelect.value} ${formatMonth(monthSelect.value)}`;
  }

  function render() {
    const granularity = granularitySelect.value;
    monthSelect.disabled = granularity === "year";
    daySelect.disabled = granularity !== "day";
    const rows = dataset.countries.map(country => {
      const result = valueFor(country.name);
      return result && result.value !== null && result.value !== undefined
        ? { ...country, ...result, value: scale(result.value) }
        : null;
    }).filter(row => row && row.value !== null && row.value !== undefined)
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));

    rankingTitle.textContent = `${metrics[metricSelect.value].label} ranking — ${periodLabel()}`;
    unitLabel.textContent = unit();
    valueHeader.textContent = `Value · ${unit()}`;
    medianLabel.textContent = `Median ${unit()}`;
    tableBody.innerHTML = "";
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="rank">${index + 1}</td>
        <td class="country-cell"><strong>${row.name}</strong><span>${row.iso3}</span></td>
        <td class="value-cell">${formatValue(row.value)}</td>
        <td>${row.coverage}</td>`;
      tableBody.append(tr);
    });

    const ordered = rows.map(row => row.value).sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const median = ordered.length ? (ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2) : null;
    leaderValue.textContent = rows.length ? `${rows[0].name} · ${formatValue(rows[0].value)}` : "-";
    medianValue.textContent = formatValue(median);
    marketsValue.textContent = String(rows.length);
  }

  populateMetrics();
  populateYears();
  populateMonths();
  populateDays();
  render();

  metricSelect.addEventListener("change", render);
  granularitySelect.addEventListener("change", render);
  yearSelect.addEventListener("change", () => { populateMonths(); populateDays(); render(); });
  monthSelect.addEventListener("change", () => { populateDays(); render(); });
  daySelect.addEventListener("change", render);
  unitSelect.addEventListener("change", render);
})();
