(() => {
  const config = window.SPREAD_DASHBOARD_CONFIG;
  const dataset = window.SPOT_PRICE_DATA;
  if (!config || !dataset) return;

  const countrySelect = document.querySelector("#countrySelect");
  const metricSelect = document.querySelector("#metricSelect");
  const yearSelect = document.querySelector("#yearSelect");
  const monthSelect = document.querySelector("#monthSelect");
  const granularitySelect = document.querySelector("#granularitySelect");
  const unitSelect = document.querySelector("#unitSelect");
  const chartTitle = document.querySelector("#chartTitle");
  const coverageHeader = document.querySelector("#coverageHeader");
  const valueHeader = document.querySelector("#valueHeader");
  const unitLabel = document.querySelector("#unitLabel");
  const periodAverage = document.querySelector("#periodAverage");
  const chart = document.querySelector("#chart");
  const tableBody = document.querySelector("#tableBody");
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  document.body.append(tooltip);

  const formatValue = value => value === null || Number.isNaN(value)
    ? "-"
    : Math.round(value).toLocaleString("en-US");
  const formatMonth = (key, style = "long") => {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("en", { month: style, year: "numeric" })
      .format(new Date(year, month - 1, 1));
  };
  const metric = () => config.metrics[metricSelect.value];
  const unit = () => unitSelect.value === "year" ? "EUR/MW/year" : "EUR/MW/day";
  const scale = value => value * (unitSelect.value === "year" ? 365 : 1);

  function populateCountries() {
    countrySelect.innerHTML = "";
    dataset.countries.forEach(country => {
      const option = document.createElement("option");
      option.value = country.name;
      option.textContent = `${country.name} (${country.iso3})`;
      countrySelect.append(option);
    });
    if (dataset.series.Germany) countrySelect.value = "Germany";
  }

  function populateMetrics() {
    metricSelect.innerHTML = "";
    Object.entries(config.metrics).forEach(([key, item]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = item.label;
      metricSelect.append(option);
    });
  }

  function yearsFor(country) {
    return Object.keys(dataset.series[country].years).sort();
  }

  function populateYears() {
    const years = yearsFor(countrySelect.value);
    yearSelect.innerHTML = "";
    years.forEach(year => yearSelect.add(new Option(year, year)));
    yearSelect.value = years.at(-1);
  }

  function populateMonths() {
    const yearData = dataset.series[countrySelect.value].years[yearSelect.value];
    const months = Object.keys(yearData.months).sort();
    monthSelect.innerHTML = "";
    months.forEach(month => monthSelect.add(new Option(formatMonth(month).replace(` ${yearSelect.value}`, ""), month)));
    monthSelect.value = months.at(-1);
  }

  function selectedRows() {
    const countryData = dataset.series[countrySelect.value].years;
    const item = metric();
    const granularity = granularitySelect.value;
    if (granularity === "day") {
      return countryData[yearSelect.value].months[monthSelect.value].days
        .filter(day => day.spreadIndexes?.[item.index] !== null && day.spreadIndexes?.[item.index] !== undefined)
        .map(day => ({ label: String(day.day), value: day.spreadIndexes[item.index], coverage: `${day.observations} hours` }));
    }
    if (granularity === "month") {
      return Object.entries(countryData[yearSelect.value].months)
        .sort(([left], [right]) => left.localeCompare(right))
        .filter(([, month]) => month.averageSpreadIndexes?.[item.index] !== null && month.averageSpreadIndexes?.[item.index] !== undefined)
        .map(([key, month]) => ({ label: formatMonth(key, "short"), value: month.averageSpreadIndexes[item.index], coverage: `${month.spreadDays || 0} days` }));
    }
    return Object.entries(countryData)
      .sort(([left], [right]) => left.localeCompare(right))
      .filter(([, year]) => year.averageSpreadIndexes?.[item.index] !== null && year.averageSpreadIndexes?.[item.index] !== undefined)
      .map(([key, year]) => ({ label: key, value: year.averageSpreadIndexes[item.index], coverage: `${year.spreadDays || 0} days` }));
  }

  function selectedPeriodAverage() {
    const years = dataset.series[countrySelect.value].years;
    const index = metric().index;
    if (granularitySelect.value === "day") {
      return years[yearSelect.value].months[monthSelect.value].averageSpreadIndexes?.[index] ?? null;
    }
    if (granularitySelect.value === "month") {
      return years[yearSelect.value].averageSpreadIndexes?.[index] ?? null;
    }
    let weightedTotal = 0;
    let validDays = 0;
    Object.values(years).forEach(year => {
      const value = year.averageSpreadIndexes?.[index];
      const days = year.spreadDays || 0;
      if (value !== null && value !== undefined && days > 0) {
        weightedTotal += value * days;
        validDays += days;
      }
    });
    return validDays ? weightedTotal / validDays : null;
  }

  function svgElement(name, attrs = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  }

  function drawChart(rows) {
    chart.innerHTML = "";
    tooltip.style.display = "none";
    const width = 1100;
    const height = 500;
    const margin = { top: 38, right: 28, bottom: 70, left: 74 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const values = rows.map(row => scale(row.value));
    const baseStep = unitSelect.value === "year" ? 50000 : 50;
    const rawMax = Math.max(baseStep, ...values);
    const stepMultiple = Math.max(1, Math.ceil(rawMax / (baseStep * 8)));
    const tickStep = baseStep * stepMultiple;
    const maxValue = Math.ceil(rawMax / tickStep) * tickStep;
    const tickCount = Math.round(maxValue / tickStep);
    const y = value => margin.top + (1 - value / maxValue) * innerHeight;
    const step = innerWidth / Math.max(1, rows.length);
    const barWidth = Math.max(7, Math.min(34, step * 0.62));

    for (let i = 0; i <= tickCount; i += 1) {
      const gridY = margin.top + innerHeight * i / tickCount;
      const value = maxValue - tickStep * i;
      chart.append(svgElement("line", { class: "grid", x1: margin.left, y1: gridY, x2: width - margin.right, y2: gridY }));
      chart.append(svgElement("text", { class: "tick", x: 12, y: gridY + 4 }, formatValue(value)));
    }
    chart.append(svgElement("line", { class: "axis", x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom }));
    chart.append(svgElement("line", { class: "axis", x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom }));

    rows.forEach((row, index) => {
      const displayValue = scale(row.value);
      const center = margin.left + step * index + step / 2;
      const top = y(displayValue);
      const tooltipText = `${row.label}: ${formatValue(displayValue)} ${unit()}`;
      const bar = svgElement("rect", {
        class: "bar", x: center - barWidth / 2, y: top,
        width: barWidth, height: height - margin.bottom - top, rx: 3,
        tabindex: 0, role: "img", "aria-label": tooltipText,
      });
      bar.append(svgElement("title", {}, tooltipText));
      bar.addEventListener("pointerenter", event => {
        tooltip.textContent = tooltipText;
        tooltip.style.display = "block";
        const left = Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
        const topPosition = Math.max(8, event.clientY - tooltip.offsetHeight - 12);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${topPosition}px`;
      });
      bar.addEventListener("pointermove", event => {
        tooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8)}px`;
        tooltip.style.top = `${Math.max(8, event.clientY - tooltip.offsetHeight - 12)}px`;
      });
      bar.addEventListener("pointerleave", () => { tooltip.style.display = "none"; });
      chart.append(bar);
      if (rows.length <= 40 || index % Math.ceil(rows.length / 18) === 0) {
        chart.append(svgElement("text", {
          class: "tick", x: center, y: height - 34, "text-anchor": "middle",
          transform: rows.length > 18 ? `rotate(-45 ${center} ${height - 34})` : "",
        }, row.label));
      }
    });
    chart.append(svgElement("text", { class: "axis-label", x: 12, y: 20 }, unit()));
  }

  function renderTable(rows) {
    tableBody.innerHTML = "";
    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.label}</td><td class="value-cell">${formatValue(scale(row.value))}</td><td>${row.coverage}</td>`;
      tableBody.append(tr);
    });
  }

  function render() {
    const granularity = granularitySelect.value;
    yearSelect.disabled = granularity === "year";
    monthSelect.disabled = granularity !== "day";
    const rows = selectedRows();
    const period = granularity === "day" ? formatMonth(monthSelect.value) : granularity === "month" ? yearSelect.value : "all years";
    chartTitle.textContent = `${countrySelect.value}: ${metric().label}, ${period}`;
    coverageHeader.textContent = granularity === "day" ? "Observed periods" : "Valid days";
    unitLabel.textContent = unit();
    valueHeader.textContent = `${metric().label} · ${unit()}`;
    const averageValue = selectedPeriodAverage();
    periodAverage.textContent = `Average: ${averageValue === null ? "-" : formatValue(scale(averageValue))} ${unit()}`;
    drawChart(rows);
    renderTable(rows);
  }

  populateCountries();
  populateMetrics();
  populateYears();
  populateMonths();
  render();

  countrySelect.addEventListener("change", () => { populateYears(); populateMonths(); render(); });
  metricSelect.addEventListener("change", render);
  yearSelect.addEventListener("change", () => { populateMonths(); render(); });
  monthSelect.addEventListener("change", render);
  granularitySelect.addEventListener("change", render);
  unitSelect.addEventListener("change", render);
})();
