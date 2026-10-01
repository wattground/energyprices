(() => {
  'use strict';
  const data = window.SPOT_PRICE_DATA;
  const DAY = 86400000;
  const $ = id => document.getElementById(id);
  const trendDays = () => Math.max(1, Number(window.MARKET_TREND_WINDOW) || 30);
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const dateMs = s => Date.parse(`${s}T00:00:00Z`);
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const label = s => new Intl.DateTimeFormat('en-GB', {day:'2-digit', month:'short', timeZone:'UTC'}).format(new Date(dateMs(s)));
  const fmt = x => finite(x) ? x.toLocaleString('en-GB', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '—';

  function dailyRows(country) {
    const rows = [];
    for (const yd of Object.values(data.series[country].years)) {
      for (const [month, md] of Object.entries(yd.months)) {
        for (const d of md.days) rows.push({
          date:`${month}-${String(d.day).padStart(2, '0')}`,
          tb1:d.spreadIndexes?.[0],
          // The stored TB2 spread is the total for two hours. The dashboard
          // reports the average spread per MWh, matching the top-left card.
          tb2:finite(d.spreadIndexes?.[1]) ? d.spreadIndexes[1] / 2 : null
        });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  function frame(values, labels) {
    const w = 620, h = 290, l = 53, r = 22, t = 22, b = 42;
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    if (!finite(min) || !finite(max)) { min = 0; max = 1; }
    if (min === max) max = min + 1;
    const pad = (max - min) * .13; min -= pad; max += pad;
    const x = i => l + (w - l - r) * i / Math.max(1, labels.length - 1);
    const y = v => t + (h - t - b) * (max - v) / (max - min);
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily TB spread chart">`;
    for (let i = 0; i <= 4; i++) { const v = min + (max - min) * i / 4; svg += `<line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" stroke="#e9ede6"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#6c7871">${Math.round(v)}</text>`; }
    [...new Set([0, Math.round((labels.length-1)/3), Math.round((labels.length-1)*2/3), labels.length-1])].forEach(i => { svg += `<text x="${x(i)}" y="${h-15}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}" font-size="10" fill="#6c7871">${labels[i]}</text>`; });
    return {svg, x, y};
  }

  function path(points, key, color, f, dash = '') {
    let d = '', open = false;
    points.forEach((p, i) => { if (!finite(p[key])) { open = false; return; } d += `${open ? 'L' : 'M'}${f.x(i)},${f.y(p[key])} `; open = true; });
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${dash ? 1.7 : 2.4}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}" stroke-opacity=".78"` : ''}/>`;
  }

  function draw(rows, end, key, target, datesTarget, coverageTarget, color, title) {
    const days = trendDays(), threshold = Math.ceil(days * .9);
    const map = new Map(rows.map(r => [r.date, r]));
    const points = Array.from({length:days}, (_, i) => {
      const date = iso(dateMs(end) - (days - 1 - i) * DAY);
      const windowRows = Array.from({length:days}, (_, j) => map.get(iso(dateMs(date) - j * DAY))).filter(r => finite(r?.[key]));
      const values = windowRows.map(r => r[key]);
      return {date, value: map.get(date)?.[key], min: values.length >= threshold ? Math.min(...values) : null, max: values.length >= threshold ? Math.max(...values) : null, average: values.length >= threshold ? values.reduce((a, b) => a + b, 0) / values.length : null};
    });
    const values = points.flatMap(p => [p.value, p.min, p.max, p.average]).filter(finite);
    if (!values.length) { $(target).innerHTML = '<div class="empty">No TB data available</div>'; return; }
    const f = frame(values, points.map(p => label(p.date)));
    let svg = f.svg;
    const bandPoints = points.filter(p => finite(p.min) && finite(p.max));
    if (bandPoints.length > 1) { const up = bandPoints.map(p => `${f.x(points.indexOf(p))},${f.y(p.max)}`), down = bandPoints.slice().reverse().map(p => `${f.x(points.indexOf(p))},${f.y(p.min)}`); svg += `<polygon points="${up.concat(down).join(' ')}" fill="#b8bfc2" fill-opacity=".32"><title>Trailing ${days}-day minimum–maximum</title></polygon>`; }
    svg += path(points, 'average', '#899b90', f, '4 5') + path(points, 'value', color, f);
    const actual = points.filter(p => finite(p.value));
    actual.forEach(p => { const i = points.indexOf(p); svg += `<circle cx="${f.x(i)}" cy="${f.y(p.value)}" r="3" fill="${color}"><title>${p.date} · ${title}: ${fmt(p.value)} €/MWh</title></circle>`; });
    $(target).innerHTML = svg + '</svg>';
    $(datesTarget).textContent = `${label(points[0].date)} – ${label(end)} · daily values with trailing ${days}-day statistics`;
    const latest = points.at(-1), n = points.filter(p => finite(p.value)).length;
    const prefix = key;
    $(`${prefix}Latest`).textContent = fmt(latest.value);
    $(`${prefix}Min`).textContent = fmt(latest.min);
    $(`${prefix}Max`).textContent = fmt(latest.max);
    $(`${prefix}Average`).textContent = fmt(latest.average);
    $(coverageTarget).textContent = `${n}/${days} daily observations.`;
  }

  function update() {
    const country = $('countrySelect').value, rows = dailyRows(country), end = $('priceDate').value || rows.filter(r => finite(r.tb1) || finite(r.tb2)).at(-1)?.date;
    if (!end) return;
    draw(rows, end, 'tb1', 'tb1Chart', 'tb1Dates', 'tb1Coverage', '#c49b36', 'TB1');
    draw(rows, end, 'tb2', 'tb2Chart', 'tb2Dates', 'tb2Coverage', '#8b63b6', 'TB2');
  }

  function init() {
    if (!data?.countries?.length) return;
    data.countries.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => $('countrySelect').add(new Option(`${c.name} (${c.iso3})`, c.name)));
    if (data.series.Germany) $('countrySelect').value = 'Germany';
    $('countrySelect').addEventListener('change', update); $('priceDate').addEventListener('change', update); $('latestDay').addEventListener('click', update);
    window.addEventListener('market-trend-window-change', update);
    setTimeout(update, 0);
  }
  init();
})();
