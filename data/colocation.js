(async () => {
  const profileData = window.GENERATION_PROFILE_DATA;
  const solarProfiles = profileData?.technologies?.solar_pv?.countries;
  if (!solarProfiles) return;

  const elements = {
    country: document.querySelector("#countrySelect"),
    period: document.querySelector("#periodSelect"),
    year: document.querySelector("#yearSelect"),
    month: document.querySelector("#monthSelect"),
    yield: document.querySelector("#yieldInput"),
    gridRatio: document.querySelector("#gridRatioInput"),
    bessRatio: document.querySelector("#bessRatioInput"),
    duration: document.querySelector("#durationSelect"),
    efficiency: document.querySelector("#efficiencyInput"),
    source: document.querySelector("#sourceSelect"),
    run: document.querySelector("#runButton"),
    optimize: document.querySelector("#optimizeButton"),
    pvRevenue: document.querySelector("#pvRevenue"),
    hybridRevenue: document.querySelector("#hybridRevenue"),
    uplift: document.querySelector("#revenueUplift"),
    recovered: document.querySelector("#curtailmentRecovered"),
    coverage: document.querySelector("#coverageLabel"),
    comparison: document.querySelector("#comparisonBody"),
    chart: document.querySelector("#dispatchChart"),
    chartTitle: document.querySelector("#dispatchTitle"),
    optimalSizing: document.querySelector("#optimalSizing"),
    optimalRevenue: document.querySelector("#optimalRevenue"),
    efficientSizing: document.querySelector("#efficientSizing"),
    efficientRevenue: document.querySelector("#efficientRevenue"),
    configurations: document.querySelector("#configurationsTested"),
    heatmap: document.querySelector("#heatmapWrap"),
  };
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  document.body.append(tooltip);

  const priceCache = new Map();
  const pvScaleCache = new Map();
  let countryData = null;
  const stateSteps = 12;
  const money = value => `${Math.round(value).toLocaleString("en-US")} EUR`;
  const energy = value => `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} MWh`;
  const percent = value => `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  const monthLabel = key => new Intl.DateTimeFormat("en", { month: "long" })
    .format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
  const daysInMonth = (year, month) => new Date(Number(year), Number(month), 0).getDate();

  function svgElement(name, attrs = {}, text = "") {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  }

  function attachTooltip(node, text) {
    node.append(svgElement("title", {}, text));
    node.addEventListener("pointerenter", event => {
      tooltip.textContent = text;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - tooltip.offsetHeight - 12)}px`;
    });
    node.addEventListener("pointermove", event => {
      tooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - tooltip.offsetHeight - 12)}px`;
    });
    node.addEventListener("pointerleave", () => { tooltip.style.display = "none"; });
  }

  function loadCountryPrices(iso3) {
    if (priceCache.has(iso3)) return Promise.resolve(priceCache.get(iso3));
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `data/colocation_prices/${iso3}.js`;
      script.onload = () => {
        const loaded = window.COLOCATION_PRICE_DATA;
        if (!loaded || loaded.iso3 !== iso3) {
          reject(new Error(`Invalid colocation data for ${iso3}`));
          return;
        }
        priceCache.set(iso3, loaded);
        script.remove();
        resolve(loaded);
      };
      script.onerror = () => reject(new Error(`Could not load colocation prices for ${iso3}`));
      document.head.append(script);
    });
  }

  function populateCountries() {
    elements.country.innerHTML = "";
    Object.values(solarProfiles)
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach(country => elements.country.add(new Option(`${country.name} (${country.iso3})`, country.iso3)));
    if (solarProfiles.DEU) elements.country.value = "DEU";
  }

  function populatePeriods() {
    const years = Object.keys(countryData.years).sort();
    const preferredYear = elements.year.value;
    elements.year.innerHTML = "";
    years.forEach(year => elements.year.add(new Option(year, year)));
    elements.year.value = years.includes(preferredYear) ? preferredYear : years.at(-1);
    populateMonths();
  }

  function populateMonths() {
    const months = Object.keys(countryData.years[elements.year.value].months).sort();
    const preferredMonth = elements.month.value;
    elements.month.innerHTML = "";
    months.forEach(month => elements.month.add(new Option(monthLabel(month), month)));
    elements.month.value = months.includes(preferredMonth) ? preferredMonth : months.at(-1);
    elements.month.disabled = elements.period.value === "year";
  }

  function selectedDays() {
    const year = elements.year.value;
    const months = countryData.years[year].months;
    const selectedMonths = elements.period.value === "month" ? [elements.month.value] : Object.keys(months).sort();
    return selectedMonths.flatMap(monthKey => months[monthKey].map(([day, rows]) => ({ monthKey, day, rows })));
  }

  function inputs(overrides = {}) {
    return {
      annualYield: Number(elements.yield.value),
      grid: overrides.grid ?? Number(elements.gridRatio.value),
      power: overrides.power ?? Number(elements.bessRatio.value),
      duration: Number(elements.duration.value),
      efficiency: Number(elements.efficiency.value) / 100,
      source: elements.source.value,
    };
  }

  function pvScale(year, annualYield) {
    const cacheKey = `${elements.country.value}-${year}-${annualYield}`;
    if (pvScaleCache.has(cacheKey)) return pvScaleCache.get(cacheKey);
    const rawMonths = solarProfiles[elements.country.value].rawMonths;
    let relativeAnnualYield = 0;
    for (let month = 1; month <= 12; month += 1) {
      const key = String(month).padStart(2, "0");
      relativeAnnualYield += rawMonths[key].reduce((sum, value) => sum + value, 0) * daysInMonth(year, month);
    }
    const scale = relativeAnnualYield ? annualYield / relativeAnnualYield : 0;
    pvScaleCache.set(cacheKey, scale);
    return scale;
  }

  function pvGeneration(monthKey, hour, params) {
    const raw = solarProfiles[elements.country.value].rawMonths[monthKey.slice(5, 7)][hour] || 0;
    return raw * pvScale(monthKey.slice(0, 4), params.annualYield);
  }

  function idleFlow(pv, price, grid) {
    const exported = price > 0 ? Math.min(grid, pv) : 0;
    return { revenue: exported * price, pv, exported, imported: 0, chargedPv: 0, chargedGrid: 0, discharged: 0, curtailed: pv - exported };
  }

  function transitionFlow(pv, price, currentSoc, nextSoc, params) {
    const eta = Math.sqrt(params.efficiency);
    const delta = nextSoc - currentSoc;
    const epsilon = 1e-9;
    if (Math.abs(delta) < epsilon) return idleFlow(pv, price, params.grid);

    if (delta > 0) {
      const charged = delta / eta;
      if (charged > params.power + epsilon) return null;
      let chargedPv = 0;
      let chargedGrid = 0;
      let exported = 0;
      let imported = 0;
      if (params.source === "pv") {
        if (charged > pv + epsilon) return null;
        chargedPv = charged;
        exported = price > 0 ? Math.min(params.grid, pv - chargedPv) : 0;
      } else if (price < 0) {
        chargedGrid = Math.min(charged, params.grid);
        chargedPv = charged - chargedGrid;
        if (chargedPv > pv + epsilon) return null;
        imported = chargedGrid;
      } else {
        chargedPv = Math.min(charged, pv);
        chargedGrid = charged - chargedPv;
        if (chargedGrid > params.grid + epsilon) return null;
        imported = chargedGrid;
        exported = Math.min(params.grid, pv - chargedPv);
      }
      return {
        revenue: (exported - imported) * price,
        pv,
        exported,
        imported,
        chargedPv,
        chargedGrid,
        discharged: 0,
        curtailed: Math.max(0, pv - chargedPv - exported),
      };
    }

    const discharged = -delta * eta;
    if (discharged > params.power + epsilon || discharged > params.grid + epsilon) return null;
    const exported = price > 0 ? Math.min(params.grid, pv + discharged) : discharged;
    const curtailed = price > 0 ? Math.min(pv, Math.max(0, pv + discharged - params.grid)) : pv;
    return {
      revenue: exported * price,
      pv,
      exported,
      imported: 0,
      chargedPv: 0,
      chargedGrid: 0,
      discharged,
      curtailed,
    };
  }

  function simulateDay(day, params, collect) {
    if (params.power <= 0) {
      const flows = day.rows.map(([hour, price]) => ({ hour, ...idleFlow(pvGeneration(day.monthKey, hour, params), price, params.grid) }));
      return { revenue: flows.reduce((sum, flow) => sum + flow.revenue, 0), flows: collect ? flows : null };
    }
    const capacity = params.power * params.duration;
    const socStep = capacity / stateSteps;
    let values = Array(stateSteps + 1).fill(-Infinity);
    values[0] = 0;
    const history = collect ? [] : null;

    day.rows.forEach(([hour, price]) => {
      const pv = pvGeneration(day.monthKey, hour, params);
      const nextValues = Array(stateSteps + 1).fill(-Infinity);
      const pointers = collect ? Array(stateSteps + 1).fill(null) : null;
      for (let current = 0; current <= stateSteps; current += 1) {
        if (!Number.isFinite(values[current])) continue;
        for (let next = 0; next <= stateSteps; next += 1) {
          const flow = transitionFlow(pv, price, current * socStep, next * socStep, params);
          if (!flow) continue;
          const candidate = values[current] + flow.revenue;
          if (candidate > nextValues[next] + 1e-9) {
            nextValues[next] = candidate;
            if (collect) pointers[next] = { previous: current, flow: { hour, ...flow } };
          }
        }
      }
      values = nextValues;
      if (collect) history.push(pointers);
    });

    if (!collect) return { revenue: values[0], flows: null };
    const flows = [];
    let state = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const pointer = history[index][state];
      if (!pointer) return { revenue: -Infinity, flows: [] };
      flows.push(pointer.flow);
      state = pointer.previous;
    }
    flows.reverse();
    return { revenue: values[0], flows };
  }

  function blankMetrics() {
    return {
      revenue: 0, pv: 0, exported: 0, imported: 0, chargedPv: 0,
      chargedGrid: 0, discharged: 0, curtailed: 0, days: 0,
      hourly: Array.from({ length: 24 }, () => ({ pv: 0, charge: 0, discharge: 0, exported: 0 })),
    };
  }

  function addFlow(metrics, flow) {
    ["revenue", "pv", "exported", "imported", "chargedPv", "chargedGrid", "discharged", "curtailed"]
      .forEach(key => { metrics[key] += flow[key]; });
    const hour = metrics.hourly[flow.hour];
    hour.pv += flow.pv;
    hour.charge += flow.chargedPv + flow.chargedGrid;
    hour.discharge += flow.discharged;
    hour.exported += flow.exported;
  }

  function simulatePv(days, params) {
    const metrics = blankMetrics();
    days.forEach(day => {
      metrics.days += 1;
      day.rows.forEach(([hour, price]) => addFlow(metrics, { hour, ...idleFlow(pvGeneration(day.monthKey, hour, params), price, params.grid) }));
    });
    return metrics;
  }

  function simulateHybrid(days, params, collect = true) {
    if (!collect) return days.reduce((sum, day) => sum + simulateDay(day, params, false).revenue, 0);
    const metrics = blankMetrics();
    days.forEach(day => {
      const result = simulateDay(day, params, true);
      if (!Number.isFinite(result.revenue)) return;
      metrics.days += 1;
      result.flows.forEach(flow => addFlow(metrics, flow));
    });
    return metrics;
  }

  function renderSummary(pv, hybrid) {
    const uplift = hybrid.revenue - pv.revenue;
    const recovered = Math.max(0, pv.curtailed - hybrid.curtailed);
    elements.pvRevenue.textContent = money(pv.revenue);
    elements.hybridRevenue.textContent = money(hybrid.revenue);
    elements.uplift.textContent = `${money(uplift)} (${percent(pv.revenue ? uplift / Math.abs(pv.revenue) * 100 : 0)})`;
    elements.recovered.textContent = energy(recovered);
    elements.coverage.textContent = `${hybrid.days.toLocaleString("en-US")} market days`;

    const rows = [
      ["Merchant revenue", pv.revenue, hybrid.revenue, hybrid.revenue - pv.revenue, money],
      ["PV generation", pv.pv, hybrid.pv, hybrid.pv - pv.pv, energy],
      ["Grid export", pv.exported, hybrid.exported, hybrid.exported - pv.exported, energy],
      ["Grid import", pv.imported, hybrid.imported, hybrid.imported - pv.imported, energy],
      ["PV curtailment", pv.curtailed, hybrid.curtailed, hybrid.curtailed - pv.curtailed, energy],
      ["BESS charge from PV", 0, hybrid.chargedPv, hybrid.chargedPv, energy],
      ["BESS charge from grid", 0, hybrid.chargedGrid, hybrid.chargedGrid, energy],
      ["BESS discharge", 0, hybrid.discharged, hybrid.discharged, energy],
      ["Revenue / PV generation", pv.pv ? pv.revenue / pv.pv : 0, hybrid.pv ? hybrid.revenue / hybrid.pv : 0, hybrid.pv && pv.pv ? hybrid.revenue / hybrid.pv - pv.revenue / pv.pv : 0, value => `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} EUR/MWh`],
    ];
    elements.comparison.innerHTML = rows.map(([label, left, right, difference, formatter]) =>
      `<tr><td>${label}</td><td>${formatter(left)}</td><td class="value-cell">${formatter(right)}</td><td>${difference > 0 ? "+" : ""}${formatter(difference)}</td></tr>`
    ).join("");
  }

  function renderDispatch(metrics) {
    const chart = elements.chart;
    chart.innerHTML = "";
    tooltip.style.display = "none";
    const width = 1100;
    const height = 470;
    const margin = { top: 28, right: 28, bottom: 60, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const daily = metrics.hourly.map(hour => ({
      pv: hour.pv / Math.max(1, metrics.days),
      charge: hour.charge / Math.max(1, metrics.days),
      discharge: hour.discharge / Math.max(1, metrics.days),
      exported: hour.exported / Math.max(1, metrics.days),
    }));
    const rawMax = Math.max(0.25, ...daily.flatMap(hour => Object.values(hour)));
    const tickStep = Math.max(0.1, Math.ceil(rawMax / 5 * 10) / 10);
    const maxValue = tickStep * 5;
    const y = value => margin.top + (1 - value / maxValue) * innerHeight;
    const hourStep = innerWidth / 24;
    const barWidth = Math.min(9, hourStep * 0.2);
    const series = [["pv", "pv-bar", "PV"], ["charge", "charge-bar", "Charge"], ["discharge", "discharge-bar", "Discharge"], ["exported", "export-bar", "Export"]];

    for (let tick = 0; tick <= 5; tick += 1) {
      const value = maxValue - tick * tickStep;
      const gridY = margin.top + innerHeight * tick / 5;
      chart.append(svgElement("line", { class: "grid", x1: margin.left, y1: gridY, x2: width - margin.right, y2: gridY }));
      chart.append(svgElement("text", { class: "tick", x: 10, y: gridY + 4 }, value.toFixed(1)));
    }
    chart.append(svgElement("line", { class: "axis", x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom }));
    chart.append(svgElement("line", { class: "axis", x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom }));
    daily.forEach((hour, hourIndex) => {
      const center = margin.left + hourStep * hourIndex + hourStep / 2;
      series.forEach(([key, className, label], seriesIndex) => {
        const value = hour[key];
        const top = y(value);
        const tooltipText = `${String(hourIndex).padStart(2, "0")}:00 · ${label}: ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} MWh`;
        const bar = svgElement("rect", {
          class: className,
          x: center + (seriesIndex - 2) * barWidth,
          y: top,
          width: barWidth - 1,
          height: height - margin.bottom - top,
          rx: 2,
          tabindex: 0,
          role: "img",
          "aria-label": tooltipText,
        });
        attachTooltip(bar, tooltipText);
        chart.append(bar);
      });
      chart.append(svgElement("text", { class: "tick", x: center, y: height - 31, "text-anchor": "middle" }, String(hourIndex).padStart(2, "0")));
    });
    chart.append(svgElement("text", { class: "axis-label", x: 10, y: 18 }, "MWh"));
    chart.append(svgElement("text", { class: "axis-label", x: width / 2, y: height - 5, "text-anchor": "middle" }, "Local hour"));
  }

  function periodDescription() {
    return elements.period.value === "month" ? `${monthLabel(elements.month.value)} ${elements.year.value}` : elements.year.value;
  }

  async function runBenchmark() {
    elements.run.disabled = true;
    elements.run.textContent = "Calculating...";
    await new Promise(resolve => setTimeout(resolve, 0));
    const days = selectedDays();
    const params = inputs();
    const pv = simulatePv(days, params);
    const hybrid = simulateHybrid(days, params, true);
    renderSummary(pv, hybrid);
    renderDispatch(hybrid);
    elements.chartTitle.textContent = `${countryData.country}: average daily operation, ${periodDescription()}`;
    elements.run.disabled = false;
    elements.run.textContent = "Run revenue benchmark";
  }

  function renderHeatmap(results, gridRatios, bessRatios, best) {
    const revenues = results.map(result => result.revenue);
    const minimum = Math.min(...revenues);
    const maximum = Math.max(...revenues);
    const range = Math.max(1, maximum - minimum);
    const byKey = new Map(results.map(result => [`${result.grid}-${result.power}`, result]));
    const header = `<tr><th>BESS / Grid</th>${gridRatios.map(grid => `<th>${grid.toFixed(2)}x</th>`).join("")}</tr>`;
    const rows = bessRatios.map(power => `<tr><th>${power.toFixed(2)}x</th>${gridRatios.map(grid => {
      const result = byKey.get(`${grid}-${power}`);
      const intensity = (result.revenue - minimum) / range;
      const background = `rgba(31, 138, 112, ${0.08 + intensity * 0.72})`;
      const bestClass = result === best ? "best-cell" : "";
      return `<td class="${bestClass}" style="background:${background}" title="Grid ${grid.toFixed(2)}x, BESS ${power.toFixed(2)}x: ${money(result.revenue)}">${Math.round(result.revenue).toLocaleString("en-US")}</td>`;
    }).join("")}</tr>`).join("");
    elements.heatmap.innerHTML = `<table class="heatmap"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
  }

  async function optimizeSizing() {
    elements.optimize.disabled = true;
    const originalText = elements.optimize.textContent;
    const days = selectedDays();
    const gridRatios = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
    const bessRatios = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];
    const results = [];
    for (let gridIndex = 0; gridIndex < gridRatios.length; gridIndex += 1) {
      const grid = gridRatios[gridIndex];
      elements.optimize.textContent = `Testing ${gridIndex + 1}/${gridRatios.length}...`;
      await new Promise(resolve => setTimeout(resolve, 0));
      for (const power of bessRatios) {
        results.push({ grid, power, revenue: simulateHybrid(days, inputs({ grid, power }), false) });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    const best = results.reduce((winner, result) => result.revenue > winner.revenue ? result : winner);
    const threshold = best.revenue * 0.99;
    const efficient = results
      .filter(result => result.revenue >= threshold)
      .sort((left, right) => (left.grid + left.power) - (right.grid + right.power) || right.revenue - left.revenue)[0];
    elements.optimalSizing.textContent = `Grid ${best.grid.toFixed(2)}x · BESS ${best.power.toFixed(2)}x`;
    elements.optimalRevenue.textContent = `${money(best.revenue)} for ${periodDescription()}`;
    elements.efficientSizing.textContent = `Grid ${efficient.grid.toFixed(2)}x · BESS ${efficient.power.toFixed(2)}x`;
    const efficientShare = best.revenue ? efficient.revenue / best.revenue * 100 : 100;
    elements.efficientRevenue.textContent = `${money(efficient.revenue)} · ${efficientShare.toFixed(1)}% of maximum`;
    elements.configurations.textContent = results.length.toLocaleString("en-US");
    renderHeatmap(results, gridRatios, bessRatios, best);
    elements.optimize.disabled = false;
    elements.optimize.textContent = originalText;
  }

  async function changeCountry() {
    elements.run.disabled = true;
    elements.optimize.disabled = true;
    countryData = await loadCountryPrices(elements.country.value);
    populatePeriods();
    elements.run.disabled = false;
    elements.optimize.disabled = false;
    await runBenchmark();
  }

  populateCountries();
  elements.country.addEventListener("change", changeCountry);
  elements.period.addEventListener("change", () => { elements.month.disabled = elements.period.value === "year"; });
  elements.year.addEventListener("change", populateMonths);
  elements.run.addEventListener("click", runBenchmark);
  elements.optimize.addEventListener("click", optimizeSizing);
  await changeCountry();
})().catch(error => {
  const title = document.querySelector("#dispatchTitle");
  if (title) title.textContent = `Unable to load colocation data: ${error.message}`;
  console.error(error);
});
