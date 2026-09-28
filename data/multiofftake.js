/* Browser-only UI: no fetch, upload, analytics, storage or third-party dependencies. */
(() => {
  'use strict';
  const C = window.MultiOfftake, $ = id => document.getElementById(id);
  const escape = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const pct = (d, base) => Math.abs(base) < 1e-9 ? '—' : fmt(d / Math.abs(base) * 100, 1) + '%';
  const colors = { merchant: '#9cabb4', floor: '#d8922b', swap: '#5686b5', toll: '#1f8a70' };
  let serial = 0, daily = [], merchantMeta = null, merchantRaw = null, tbRaw = null, customTB = new Map(), customTBUnit = 'index', customTBHours = 4, result = null;
  const make = (type, share, extra = {}) => ({ id: ++serial, name: { merchant: 'Merchant', floor: 'Revenue floor', swap: 'Merchant + TB4 swap', toll: 'Fixed toll' }[type], type, share, price: type === 'floor' ? 70000 : 90000, unit: 'year', frequency: type === 'floor' ? 'year' : 'month', upside: 80, multiplier: 1, ...extra });
  let components = [make('merchant', 100)];
  const siteTB = new Map();
  const years = window.SPOT_PRICE_DATA?.series?.Germany?.years || {};
  for (const yd of Object.values(years)) for (const [month, md] of Object.entries(yd.months)) for (const day of md.days) {
    const v = day.spreadIndexes?.[2];
    if (typeof v === 'number' && Number.isFinite(v)) siteTB.set(`${month}-${String(day.day).padStart(2, '0')}`, v);
  }
  const siteDates = [...siteTB.keys()].sort();
  $('siteCoverage').textContent = siteDates.length ? `${fmt(siteDates.length)} valid daily observations · ${siteDates[0]} to ${siteDates.at(-1)} · €/MW/day` : 'Site TB4 unavailable. Import a daily CSV to use a variable swap.';
  function currentTB() { return $('tbSource').value === 'site' ? siteTB : customTB; }
  function tbFactor() { return $('tbSource').value === 'csv' && customTBUnit === 'mwh' ? customTBHours : 1; }
  function tbLabel() { return $('tbSource').value === 'csv' && customTBUnit === 'mwh' ? `€/MWh average spread × ${customTBHours} contracted MWh/MW` : '€/MW/day cumulative TB4 index'; }
  function selectOptions(options, value) { return options.map(([v, name]) => `<option value="${escape(v)}"${String(v) === String(value) ? ' selected' : ''}>${escape(name)}</option>`).join(''); }
  function field(label, key, value, attrs = '') { return `<label>${label}<input data-key="${key}" type="number" value="${escape(value)}" step="any" ${attrs}></label>`; }
  function unitSelect(c) { return `<label>Price unit<select data-key="unit">${selectOptions([['year', '€/MW/year'], ['month', '€/MW/month'], ['day', '€/MW/day']], c.unit)}</select></label>`; }
  function frequency(c) { return `<label>Settlement<select data-key="frequency">${selectOptions(c.type === 'floor' ? [['month', 'Calendar month'], ['year', 'Calendar year']] : [['day', 'Daily'], ['month', 'Calendar month'], ['year', 'Calendar year']], c.frequency)}</select></label>`; }
  function renderEditor() {
    $('components').innerHTML = components.map(c => `<article class="component" data-id="${c.id}" style="border-top:3px solid ${colors[c.type]}">
      <div class="component-head"><input aria-label="Component name" data-key="name" value="${escape(c.name)}"><button type="button" data-remove="${c.id}" aria-label="Remove ${escape(c.name)}">×</button></div>
      <div class="fields"><label>Structure<select data-key="type">${selectOptions([['merchant', 'Merchant'], ['floor', 'Floor'], ['swap', 'Day-Ahead / TB4 swap'], ['toll', 'Partial toll']], c.type)}</select></label>${field('Physical capacity · %', 'share', c.share, 'min="0" max="100"')}</div>
      ${c.type !== 'merchant' ? `<div class="fields">${field(c.type === 'floor' ? 'Guaranteed minimum' : c.type === 'swap' ? 'Fixed leg payment' : 'Fixed toll payment', 'price', c.price, c.type === 'floor' ? 'min="0"' : '')}${unitSelect(c)}</div>` : ''}
      ${c.type === 'floor' ? `<div class="fields">${frequency(c)}${field('Owner share above floor · %', 'upside', c.upside, 'min="0" max="100"')}</div><p class="hint">Owner = floor + owner share × max(merchant − floor, 0). Applied to this tranche per settlement bucket.</p>` : ''}
      ${c.type === 'swap' ? `<div class="fields">${frequency(c)}${field('Index multiplier / cycles', 'multiplier', c.multiplier, 'min="0"')}</div><p class="hint">Overlay on this card's merchant capacity, still physically optimized. Settlement = fixed − reference × multiplier. Reference: ${escape(tbLabel())}. Multiplier 1 is an editable contractual assumption, not a dispatch estimate.</p>` : ''}
      ${c.type === 'toll' ? '<p class="hint">Replaces merchant revenue on this tranche. All optimization value is assigned to the offtaker.</p>' : ''}
      </article>`).join('');
    updateAllocation();
  }
  function updateAllocation() {
    const sum = components.reduce((s, c) => s + (Number.isFinite(c.share) ? c.share : 0), 0);
    $('allocation').innerHTML = `<div class="allocation-bar">${components.map(c => `<span style="width:${Math.max(0, c.share || 0)}%;background:${colors[c.type]}" title="${escape(c.name)}: ${fmt(c.share, 1)}%"></span>`).join('')}</div><div class="allocation-text${sum > 100 ? ' negative' : ''}">${fmt(sum, 1)}% allocated · ${fmt(Math.max(0, 100 - sum), 1)}% residual merchant</div>`;
  }
  const colOptions = (p, selected) => selectOptions(p.headers.map((h, i) => [i, h]), selected);
  function preview(p) { return `<div class="preview"><table><thead><tr>${p.headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${p.rows.slice(0, 5).map(r => `<tr>${r.map(v => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="hint">${fmt(p.rows.length)} source rows · first 5 shown. Column detection is a suggestion; check selections before applying.</p>`; }
  function commonMapping(p, prefix) {
    let dateCol = p.headers.findIndex(h => /date|datum|time|period/i.test(h)); if (dateCol < 0) dateCol = 0;
    return `<div class="fields"><label>Date column<select id="${prefix}Date">${colOptions(p, dateCol)}</select></label><label>Date format<select id="${prefix}Format"><option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option></select></label><label>Decimal separator<select id="${prefix}Decimal"><option value=".">Dot · 1,234.56</option><option value=",">Comma · 1.234,56</option></select></label></div>`;
  }
  function merchantMapping(p) {
    const modo = ['FCR', 'Intraday Continuous', 'Day-Ahead Energy'].every(h => p.headers.includes(h));
    let dc = p.headers.findIndex(h => /date|datum|time|period/i.test(h)); if (dc < 0) dc = 0;
    const total = p.headers.findIndex(h => /^(total|total revenue|merchant revenue|revenue)$/i.test(h));
    $('merchantMapping').hidden = false;
    $('merchantMapping').innerHTML = `<div class="mapping">${preview(p)}${commonMapping(p, 'm')}
      <label>Revenue columns · selected values are summed</label><div class="checks">${p.headers.map((h, i) => `<label><input type="checkbox" name="merchantValue" value="${i}"${i !== dc && (total >= 0 ? i === total : modo && /^(FCR|Intraday Continuous|Intraday Auction|Day-Ahead Energy|aFRR Capacity positive|aFRR Capacity negative|aFRR Energy positive|aFRR Energy negative)$/.test(h)) ? ' checked' : ''}>${escape(h)}</label>`).join('')}</div>
      <p class="hint">Avoid selecting a total together with its underlying components. Negative values are retained.</p>
      <div class="fields"><label>Source units<select id="mUnit"><option value="mw-year">€/MW/year · annualized</option><option value="mw-period">€/MW per observation period</option><option value="mw-day">€/MW/day</option><option value="total-year">Total €/year · annualized</option><option value="total-period">Total € per observation period</option><option value="total-day">Total €/day</option></select></label><label>Observation coverage<select id="mCadence"><option value="week">Weekly · 7 days</option><option value="day">Daily</option><option value="month">Calendar month</option><option value="year">Calendar year</option><option value="custom">Custom number of days</option></select></label>
      <label id="sourceMWField" hidden>Source asset MW<input id="mSourceMW" type="number" value="1" min="0.001" step="any"></label><label id="customDaysField" hidden>Days per observation<input id="mDays" type="number" value="7" min="1" step="1"></label>
      <label>Final covered day · inclusive<input id="mLastEnd" type="date"></label><label>Data classification<select id="mNature"><option value="index"${modo ? ' selected' : ''}>Index · underlying methodology unverified</option><option value="simulated">Simulated revenues · user confirmed</option><option value="realized">Realized revenues · user confirmed</option><option value="unknown"${modo ? '' : ' selected'}>Unspecified · verify before interpretation</option></select></label></div>
      <label>Methodology / source notes<input id="mNotes" type="text" value="${modo ? 'Modo Energy ME vBESS DE (4H); units confirmed by user as €/MW/year. CSV has no methodology metadata.' : ''}" placeholder="Source, asset duration, fees, optimization assumptions…"></label>
      <p class="hint">Blank final coverage uses one full selected observation period. For the supplied Modo file this means 29 June–5 July 2026. Adjust if the final observation covers fewer days. Classifications are declarations, not independently verified methodology.</p>
      <button id="applyMerchant" type="button">Apply merchant data & mapping</button></div>`;
    $('mUnit').onchange = () => { $('sourceMWField').hidden = !$('mUnit').value.startsWith('total'); markPending('Merchant mapping changed. Apply it to recalculate.'); };
    $('mCadence').onchange = () => { $('customDaysField').hidden = $('mCadence').value !== 'custom'; };
    $('applyMerchant').onclick = applyMerchant;
  }
  function tbMapping(p) {
    let v = p.headers.findIndex(h => /tb4|spread/i.test(h)); if (v < 0) v = Math.min(1, p.headers.length - 1);
    $('tbMapping').hidden = false;
    $('tbMapping').innerHTML = `<div class="mapping">${preview(p)}${commonMapping(p, 't')}<div class="fields"><label>Daily reference column<select id="tValue">${colOptions(p, v)}</select></label><label>Reference unit<select id="tUnit"><option value="index">€/MW/day · cumulative TB4</option><option value="mwh">€/MWh · average top-bottom spread</option></select></label><label id="tbHoursField" hidden>Contracted volume · MWh/MW<input id="tHours" type="number" value="4" min="0.001" step="any"></label></div><p class="hint">Daily dates only. Cumulative TB4 already sums four one-hour prices: do not multiply it by four again. Average spreads in €/MWh require an explicit contracted energy volume.</p><button id="applyTB">Apply TB4 mapping</button></div>`;
    $('tUnit').onchange = () => { $('tbHoursField').hidden = $('tUnit').value !== 'mwh'; };
    $('applyTB').onclick = () => {
      try {
        const hours = +$('tHours').value; if (!(hours > 0)) throw Error('Enter a positive contracted volume.');
        customTB = C.tb(tbRaw, { date: +$('tDate').value, value: +$('tValue').value, format: $('tFormat').value, decimal: $('tDecimal').value });
        customTBUnit = $('tUnit').value; customTBHours = hours; $('importMessage').textContent = 'TB4 mapping applied.'; $('importMessage').className = ''; renderEditor(); update();
      } catch (e) { importError(e); }
    };
  }
  function markPending(message) { $('importMessage').textContent = message; $('importMessage').className = ''; }
  function importError(e) { $('importMessage').textContent = e.message; $('importMessage').className = 'error'; }
  async function readFile(input, kind) {
    const file = input.files[0]; if (!file) return;
    try {
      const p = C.csv(await file.text());
      if (kind === 'merchant') { merchantRaw = p; merchantMapping(p); }
      else { tbRaw = p; tbMapping(p); }
      markPending(`${file.name} loaded for inspection. Apply the mapping to use it; current results still use the previously applied data.`);
    } catch (e) { importError(e); }
  }
  function applyMerchant() {
    try {
      const options = { date: +$('mDate').value, values: [...document.querySelectorAll('[name=merchantValue]:checked')].map(x => +x.value), format: $('mFormat').value, decimal: $('mDecimal').value, unit: $('mUnit').value, cadence: $('mCadence').value, sourceMW: +$('mSourceMW').value, days: +$('mDays').value, lastEnd: $('mLastEnd').value };
      const converted = C.merchant(merchantRaw, options);
      daily = converted;
      merchantMeta = { ...options, name: $('merchantFile').files[0]?.name || 'Imported CSV', nature: $('mNature').selectedOptions[0].textContent, notes: $('mNotes').value, columns: options.values.map(i => merchantRaw.headers[i]), rows: merchantRaw.rows.length };
      $('from').value = daily[0].date; $('through').value = daily.at(-1).date;
      $('dataSummary').textContent = `${merchantMeta.rows} observations · ${daily[0].date} → ${daily.at(-1).date} · ${merchantMeta.nature}`;
      $('importMessage').textContent = 'Merchant data applied. Inspect coverage below, then adjust contract terms.'; $('importMessage').className = ''; update();
    } catch (e) { importError(e); }
  }
  function audit(selected) {
    if (!daily.length) return;
    const tb = currentTB(), missing = selected.filter(r => !tb.has(r.date)).map(r => r.date), merchantDates = new Set(selected.map(r => r.date));
    const start = $('from').value || daily[0].date, end = $('through').value || daily.at(-1).date;
    const gaps = []; for (let t = C.time(start); t <= C.time(end) && gaps.length < 100000; t += C.DAY) { const s = C.iso(t); if (!merchantDates.has(s)) gaps.push(s); }
    const unused = [...tb.keys()].filter(s => s >= start && s <= end && !merchantDates.has(s));
    const outside = [...tb.keys()].filter(s => s < start || s > end).length;
    const details = (title, values) => values.length ? `<details><summary>${fmt(values.length)} ${title}</summary><div class="date-list">${values.map(escape).join(', ')}</div></details>` : '';
    $('dataAudit').innerHTML = `<strong>${escape(merchantMeta.nature)}</strong><br>${escape(merchantMeta.name)} · ${escape(merchantMeta.unit)} · ${merchantMeta.rows} source observations<br>${escape(merchantMeta.notes || 'No methodology notes provided.')}<br><strong>${fmt(selected.length)} merchant days selected · ${fmt(selected.length - missing.length)} matched TB4 days</strong>${details('merchant days without TB4', missing)}${details('days without merchant coverage (excluded)', gaps)}${details('TB4 days without matching merchant coverage in the selected window', unused)}<br>${fmt(outside)} TB4 dates outside the selected window. Applied reference: ${escape(tbLabel())}.`;
  }
  function formula(c) {
    const p = `${fmt(c.price, 2)} €/MW/${c.unit}`, q = `${fmt(c.share, 2)}%`;
    if (c.type === 'merchant') return `${q} × historical merchant revenue`;
    if (c.type === 'toll') return `${q} × accrued fixed toll (${p}); merchant on this share = 0`;
    if (c.type === 'floor') return `M = ${q} × merchant; F = ${q} × accrued guarantee (${p}); owner = F + ${fmt(c.upside, 1)}% × max(M − F, 0); floor adjustment = owner − M; settlement: ${c.frequency}`;
    return `${q} × merchant + ${q} × [accrued fixed leg (${p}) − Σ daily reference × ${fmt(tbFactor(), 3)} volume factor × ${fmt(c.multiplier, 3)} multiplier]; settlement: ${c.frequency}`;
  }
  function update() {
    updateAllocation(); result = null; $('export').disabled = true;
    const selected = daily.filter(r => (!$('from').value || r.date >= $('from').value) && (!$('through').value || r.date <= $('through').value));
    audit(selected);
    try {
      if (!($('assetMW').valueAsNumber > 0) || !($('duration').valueAsNumber > 0)) throw Error('Asset power and duration must be positive.');
      if ($('from').value && $('through').value && $('from').value > $('through').value) throw Error('The start date must be on or before the end date.');
      result = C.calculate(selected, components, currentTB(), { tbFactor: tbFactor() });
      const annual = C.aggregate(result.rows, 'year'), complete = annual.filter(g => g.days === g.expected);
      $('status').className = 'notice';
      $('status').textContent = `${selected[0].date} → ${selected.at(-1).date} · ${fmt(selected.length)} covered days · ${merchantMeta.nature}. ${annual.filter(g => g.days !== g.expected).length} incomplete calendar year(s); fixed payments and floors prorated to observed days. ${complete.length < 2 ? 'Annual variability unavailable: at least two complete years are required.' : 'Annual risk indicators use complete years only.'} ${result.missing.length ? `${result.missing.length} TB4 days missing; no active variable swap uses them.` : ''}`;
      $('resultBody').hidden = false; $('export').disabled = false; renderResults(annual, complete);
    } catch (e) {
      $('resultBody').hidden = true; $('status').textContent = e.message; $('status').className = daily.length ? 'notice error' : 'notice';
    }
  }
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  function renderResults(annual, complete) {
    const rows = result.rows, mw = $('assetMW').valueAsNumber, base = sum(rows, 'merchant'), scenario = sum(rows, 'scenario'), delta = scenario - base;
    const min = complete.length ? Math.min(...complete.map(g => g.scenario)) : NaN;
    const mean = complete.length ? sum(complete, 'scenario') / complete.length : NaN;
    const sd = complete.length >= 2 ? Math.sqrt(complete.reduce((s, g) => s + (g.scenario - mean) ** 2, 0) / complete.length) : NaN;
    const kpi = (name, value, sub, cls = '') => `<div class="kpi ${cls}"><span class="label">${name}</span><strong>${value}</strong><small>${sub}</small></div>`;
    $('kpis').innerHTML = kpi('Scenario · cumulative €/MW', fmt(scenario), `${fmt(scenario * mw)} € total · ${fmt(mw)} MW`, 'primary') + kpi('Fully merchant · cumulative €/MW', fmt(base), `${fmt(base * mw)} € total · same covered dates`) + kpi('Difference · cumulative €/MW', (delta >= 0 ? '+' : '') + fmt(delta), `${fmt(delta * mw)} € total · ${pct(delta, base)} vs merchant`) + kpi('Minimum complete-year revenue · €/MW', fmt(min), complete.length ? `${fmt(min * mw)} € total · ${complete.length} complete year(s)` : 'Unavailable · no complete calendar year') + kpi('Annual variability · σ in €/MW', fmt(sd), Number.isFinite(sd) ? `Population standard deviation · ${fmt(sd * mw)} € total` : 'Requires at least 2 complete calendar years') + kpi('Capacity with fixed toll payments', fmt(result.fixedCapacity, 1) + '%', `${fmt(result.floorCapacity, 1)}% additionally floor-protected. Swap fixed legs are offset by a variable obligation.`);
    const frequency = $('granularity').value, groups = C.aggregate(rows, frequency), factor = $('displayUnit').value === 'total' ? mw : 1, unit = factor === mw && $('displayUnit').value === 'total' ? '€ total' : '€/MW';
    $('periodTitle').textContent = `${frequency === 'month' ? 'Monthly' : 'Annual'} owner revenue · ${unit}`;
    $('revenueChart').innerHTML = lineChart(groups.map(g => ({ label: g.period, a: g.merchant * factor, b: g.scenario * factor })), unit, false);
    $('cumulativeChart').innerHTML = lineChart(rows.map(r => ({ label: r.date, a: r.baselineCum * factor, b: r.scenarioCum * factor })), unit, true);
    $('distributionTitle').textContent = `Distribution of ${frequency === 'month' ? 'monthly' : 'annual'} revenue`;
    const fullGroups = groups.filter(g => g.days === g.expected);
    $('distributionChart').innerHTML = histogram(fullGroups, factor, unit) + `<p class="chart-note">Complete ${frequency === 'month' ? 'months' : 'years'} only · ${fullGroups.length} observations. Historical frequencies, not probabilities of future returns.</p>`;
    $('breakdown').innerHTML = `<div class="composition">${[['physical', 'Physical merchant'], ['toll', 'Fixed toll'], ['floor', 'Floor / upside adjustment'], ['swap', 'Swap settlement']].map(([key, name]) => `<div>${name}<strong>${fmt(sum(rows, key))} €/MW</strong>${fmt(sum(rows, key) * mw)} € total</div>`).join('')}</div>`;
    $('formulas').innerHTML = result.totals.map(c => `<div class="formula"><strong>${escape(c.name)} · ${fmt(c.share, 1)}% · ${fmt(c.total)} €/MW of whole asset</strong><br>Physical merchant: ${fmt(c.physical)} €/MW · contractual adjustment/payment: ${fmt(c.adjustment)} €/MW<code>${escape(formula(c))}</code></div>`).join('') + (result.residual ? `<div class="formula"><strong>Residual merchant · ${fmt(result.residual, 1)}%</strong><code>${fmt(result.residual, 2)}% × merchant = ${fmt(base * result.residual / 100)} €/MW</code></div>` : '') + '<p class="hint">All contributions above are normalized per MW of the whole asset. Floor adjustments may be negative when part of the upside is ceded to the offtaker. Partial buckets use prorated guarantees.</p>';
    $('annualTable').innerHTML = annual.map(g => `<tr><td>${g.period} · ${g.days}/${g.expected} days${g.days < g.expected ? ' · partial' : ''}</td><td>${fmt(g.merchant)}</td><td>${fmt(g.scenario)}</td><td>${fmt(g.scenario * mw)}</td><td>${fmt(g.delta)}</td><td>${fmt(g.delta * mw)}</td><td>${pct(g.delta, g.merchant)}</td></tr>`).join('');
    $('ledgerCount').textContent = `${fmt(rows.length)} days`;
    $('dailyTable').innerHTML = rows.slice(0, 100).map(r => `<tr><td>${r.date}</td>${['merchant', 'tb', 'physical', 'toll', 'floor', 'swap', 'scenario'].map(k => `<td>${fmt(r[k], 2)}</td>`).join('')}</tr>`).join('');
    $('tbLedgerUnit').textContent = '* Reference: ' + tbLabel() + '. Source observation values and per-component settlements are included in the CSV export.';
  }
  function lineChart(points, unit, compact) {
    const w = compact ? 480 : 920, h = compact ? 240 : 280, left = 64, right = 15, top = 16, bottom = 42;
    let low = points.reduce((v, p) => Math.min(v, p.a, p.b), 0), high = points.reduce((v, p) => Math.max(v, p.a, p.b), 0);
    if (high === low) high = low + 1;
    const range = high - low; high += range * .08; if (low < 0) low -= range * .08;
    const x = i => left + (w - left - right) * (points.length === 1 ? .5 : i / (points.length - 1)), y = v => top + (h - top - bottom) * (high - v) / (high - low);
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape((compact ? 'Cumulative' : 'Period') + ' historical merchant and scenario revenue, ' + unit)}">`;
    for (let i = 0; i <= 4; i++) { const v = low + (high - low) * i / 4; svg += `<line x1="${left}" y1="${y(v)}" x2="${w - right}" y2="${y(v)}" stroke="#e8ece7"/><text x="${left - 9}" y="${y(v) + 4}" text-anchor="end" fill="#68726b" font-size="10">${axis(v)}</text>`; }
    if (low < 0) svg += `<line x1="${left}" y1="${y(0)}" x2="${w - right}" y2="${y(0)}" stroke="#b8c6bd"/>`;
    for (const [key, color] of [['a', '#9cabb4'], ['b', '#1f8a70']]) {
      svg += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points.map((p, i) => `${x(i)},${y(p[key])}`).join(' ')}"/>`;
      points.forEach((p, i) => { svg += `<circle cx="${x(i)}" cy="${y(p[key])}" r="${points.length > 400 ? 1 : 3}" fill="${color}"><title>${escape(p.label)} · ${key === 'a' ? 'Merchant' : 'Scenario'}: ${fmt(p[key], 2)} ${unit}</title></circle>`; });
    }
    const indices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    indices.forEach(i => svg += `<text x="${x(i)}" y="${h - 15}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}" font-size="10" fill="#68726b">${escape(points[i].label)}</text>`);
    return svg + '</svg>';
  }
  function axis(v) { return Math.abs(v) >= 1e6 ? fmt(v / 1e6, 1) + 'm' : Math.abs(v) >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v); }
  function histogram(groups, factor, unit) {
    if (!groups.length) return '<div class="empty-chart">No complete periods in the selected window.</div>';
    const all = groups.flatMap(g => [g.merchant * factor, g.scenario * factor]); let min = Math.min(...all), max = Math.max(...all); if (min === max) { min -= 1; max += 1; }
    const n = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(groups.length)))), bins = Array.from({ length: n }, () => [0, 0]), step = (max - min) / n;
    groups.forEach(g => ['merchant', 'scenario'].forEach((k, j) => bins[Math.min(n - 1, Math.floor((g[k] * factor - min) / step))][j]++));
    const peak = Math.max(...bins.flat()), width = 390 / n;
    let svg = '<svg viewBox="0 0 480 240" role="img" aria-label="Frequency distribution of historical merchant and scenario period revenues"><text x="45" y="17" font-size="10" fill="#68726b">Period count</text>';
    for (let t = 0; t <= peak; t += Math.max(1, Math.ceil(peak / 4))) svg += `<text x="35" y="${204 - t / peak * 165}" text-anchor="end" font-size="10" fill="#68726b">${t}</text>`;
    bins.forEach((b, i) => b.forEach((count, j) => { const height = count / peak * 165; svg += `<rect x="${45 + i * width + j * width * .42}" y="${200 - height}" width="${width * .38}" height="${height}" rx="2" fill="${j ? '#1f8a70' : '#9cabb4'}"><title>${j ? 'Scenario' : 'Merchant'} · ${fmt(min + i * step)} to ${fmt(min + (i + 1) * step)} ${unit}: ${count} periods</title></rect>`; }));
    return svg + `<text x="45" y="223" font-size="10" fill="#68726b">${axis(min)}</text><text x="435" y="223" text-anchor="end" font-size="10" fill="#68726b">${axis(max)} ${unit}</text></svg>`;
  }
  function exportCSV() {
    if (!result) return;
    const mw = $('assetMW').valueAsNumber;
    const headers = ['date', 'source_date', 'source_csv_row', 'source_value_sum', 'source_units', 'source_covered_days', 'source_asset_mw', 'merchant_classification', 'methodology_notes', 'asset_mw', 'asset_duration_hours', 'tb_source', 'tb_reference_unit', 'tb_reference_raw', 'tb_volume_factor', 'baseline_eur_mw', 'physical_merchant_eur_mw', 'toll_eur_mw', 'floor_adjustment_eur_mw', 'swap_fixed_eur_mw', 'swap_variable_eur_mw', 'swap_net_eur_mw', 'scenario_eur_mw', 'delta_eur_mw', 'delta_percent', 'baseline_total_eur', 'scenario_total_eur', 'delta_total_eur', 'baseline_cumulative_eur_mw', 'scenario_cumulative_eur_mw'];
    for (const c of components) headers.push(...['name', 'type', 'capacity_percent', 'price', 'price_unit', 'owner_upside_percent', 'swap_multiplier', 'settlement_period', 'physical_eur_mw', 'toll_eur_mw', 'floor_eur_mw', 'swap_fixed_eur_mw', 'swap_variable_eur_mw', 'swap_net_eur_mw', 'owner_eur_mw', 'owner_total_eur', 'formula'].map(k => `component_${c.id}_${k}`));
    const rows = result.rows.map(r => {
      const a = [r.date, r.sourceDate, r.sourceRow, r.sourceValue, merchantMeta.unit, r.sourceDays, merchantMeta.sourceMW, merchantMeta.nature, merchantMeta.notes, mw, $('duration').value, $('tbSource').value, tbLabel(), r.tb ?? '', tbFactor(), r.merchant, r.physical, r.toll, r.floor, r.swapFixed, r.swapVariable, r.swap, r.scenario, r.delta, Math.abs(r.merchant) < 1e-9 ? '' : r.delta / Math.abs(r.merchant) * 100, r.merchant * mw, r.scenario * mw, r.delta * mw, r.baselineCum, r.scenarioCum];
      r.components.forEach((l, i) => { const c = components[i]; a.push(c.name, c.type, c.share, c.type === 'merchant' ? '' : c.price, c.type === 'merchant' ? '' : c.unit, c.type === 'floor' ? c.upside : '', c.type === 'swap' ? c.multiplier : '', l.settlement, l.physical, l.toll, l.floor, l.swapFixed, l.swapVariable, l.swap, l.total, l.total * mw, formula(c)); });
      return a;
    });
    const safe = v => { let s = String(v); if (typeof v === 'string' && /^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const content = '\uFEFF' + [headers, ...rows].map(row => row.map(safe).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'bess-multiofftake-historical-comparison.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('merchantFile').onchange = () => readFile($('merchantFile'), 'merchant');
  $('tbFile').onchange = () => readFile($('tbFile'), 'tb');
  $('merchantMapping').addEventListener('input', () => markPending('Merchant mapping changed. Apply it to recalculate; results still use the previously applied mapping.'));
  $('tbMapping').addEventListener('input', () => markPending('TB4 mapping changed. Apply it to recalculate; results still use the previously applied mapping.'));
  $('tbSource').onchange = () => { $('tbUpload').hidden = $('tbSource').value !== 'csv'; renderEditor(); update(); };
  $('components').addEventListener('input', e => {
    const card = e.target.closest('[data-id]'), key = e.target.dataset.key;
    if (!card || !key) return;
    const c = components.find(c => c.id === +card.dataset.id);
    if (key === 'type') { const replacement = make(e.target.value, c.share); Object.assign(c, replacement, { id: +card.dataset.id }); renderEditor(); }
    else c[key] = ['name', 'unit', 'frequency'].includes(key) ? e.target.value : e.target.value === '' ? NaN : +e.target.value;
    update();
  });
  $('components').addEventListener('click', e => { const id = e.target.dataset.remove; if (id) { components = components.filter(c => c.id !== +id); renderEditor(); update(); } });
  $('addComponent').onclick = () => { components.push(make('merchant', Math.max(0, 100 - components.reduce((s, c) => s + c.share, 0)))); renderEditor(); update(); };
  $('example').onchange = () => {
    const key = $('example').value;
    components = key === 'mixed' ? [make('toll', 40), make('swap', 30), make('merchant', 30)] : key === 'floor' ? [make('floor', 50), make('merchant', 50)] : key === 'toll' ? [make('toll', 100)] : [make('merchant', 100)];
    renderEditor(); update();
  };
  for (const id of ['assetMW', 'duration', 'from', 'through', 'granularity', 'displayUnit']) $(id).addEventListener('input', update);
  $('export').onclick = exportCSV;
  renderEditor();
})();
