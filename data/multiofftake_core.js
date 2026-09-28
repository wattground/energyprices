/* Pure calculation engine. Calendar dates are UTC labels, not dispatch timestamps. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const time = s => Date.parse(s + 'T00:00:00Z');
  const yearDays = s => (Date.UTC(+s.slice(0, 4) + 1, 0, 1) - Date.UTC(+s.slice(0, 4), 0, 1)) / DAY;
  const monthDays = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).getUTCDate();
  function date(s, format = 'iso') {
    s = String(s).trim();
    let a;
    if (format === 'iso') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('Expected YYYY-MM-DD date: ' + s);
    } else {
      a = s.split(/[/.\-]/);
      if (a.length !== 3 || !/^\d{4}$/.test(a[2])) throw Error('Invalid date: ' + s);
      s = `${a[2]}-${String(a[format === 'dmy' ? 1 : 0]).padStart(2, '0')}-${String(a[format === 'dmy' ? 0 : 1]).padStart(2, '0')}`;
    }
    if (!Number.isFinite(time(s)) || iso(time(s)) !== s) throw Error('Invalid calendar date: ' + s);
    return s;
  }
  function csv(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0];
    const delimiter = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (quoted) throw Error('CSV contains an unclosed quoted field.');
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    if (rows.length < 2) throw Error('CSV needs a header and at least one data row.');
    const headers = rows.shift();
    if (new Set(headers).size !== headers.length || headers.some(x => !x)) throw Error('Column names must be unique and non-empty.');
    if (rows.some(r => r.length !== headers.length)) throw Error('Inconsistent CSV column count. Check the delimiter and quoting.');
    return { headers, rows, delimiter };
  }
  function number(value, decimal = '.') {
    let s = String(value).trim().replace(/[\s\u00a0]/g, '');
    if (decimal === ',') s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    if (!s || !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s) || !Number.isFinite(+s)) throw Error('Invalid or missing numeric value: ' + value);
    return +s;
  }
  function nextPeriod(s, cadence, days) {
    const d = new Date(time(s));
    if (cadence === 'month') return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    if (cadence === 'year') return `${d.getUTCFullYear() + 1}-01-01`;
    return iso(time(s) + DAY * (cadence === 'day' ? 1 : cadence === 'week' ? 7 : days));
  }
  function merchant(parsed, o) {
    if (!o.values.length) throw Error('Select at least one merchant revenue column.');
    if (o.values.includes(o.date)) throw Error('The date column cannot also be a revenue column.');
    if (!(o.sourceMW > 0) || !(o.days > 0 && Number.isInteger(o.days))) throw Error('Source MW and custom period days must be positive.');
    const rows = parsed.rows.map((r, i) => {
      try { return { date: date(r[o.date], o.format), value: o.values.reduce((s, k) => s + number(r[k], o.decimal), 0), row: i + 2 }; }
      catch (e) { throw Error(`CSV row ${i + 2}: ${e.message}`); }
    }).sort((a, b) => a.date.localeCompare(b.date));
    const daily = []; let previousEnd = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (o.cadence === 'month' && r.date.slice(8) !== '01') throw Error('Monthly dates must identify the first day of the month.');
      if (o.cadence === 'year' && r.date.slice(5) !== '01-01') throw Error('Annual dates must identify January 1.');
      let end = nextPeriod(r.date, o.cadence, o.days);
      if (i === rows.length - 1 && o.lastEnd) end = iso(time(date(o.lastEnd)) + DAY);
      if (end <= r.date) throw Error('The final coverage date must be on or after the final observation.');
      if (previousEnd && r.date < previousEnd) throw Error(`Duplicate or overlapping merchant periods at ${r.date}. Check cadence.`);
      const n = (time(end) - time(r.date)) / DAY;
      if (n > 3660 || daily.length + n > 100000) throw Error('Check period dates: unusually long coverage. Split long source periods into smaller observations.');
      for (let t = time(r.date); t < time(end); t += DAY) {
        const s = iso(t), perMW = r.value / (o.unit.startsWith('total') ? o.sourceMW : 1);
        const v = o.unit.endsWith('year') ? perMW / yearDays(s) : o.unit.endsWith('day') ? perMW : perMW / n;
        daily.push({ date: s, merchant: v, sourceValue: r.value, sourceDate: r.date, sourceDays: n, sourceRow: r.row });
      }
      previousEnd = end;
    }
    return daily;
  }
  function tb(parsed, o) {
    const map = new Map();
    if (o.date === o.value) throw Error('Choose different date and TB4 columns.');
    for (let i = 0; i < parsed.rows.length; i++) {
      const r = parsed.rows[i];
      try {
        const s = date(r[o.date], o.format);
        if (map.has(s)) throw Error('Duplicate TB4 date: ' + s);
        map.set(s, number(r[o.value], o.decimal));
      } catch (e) { throw Error(`CSV row ${i + 2}: ${e.message}`); }
    }
    return map;
  }
  function rate(price, unit, s) { return price / (unit === 'year' ? yearDays(s) : unit === 'month' ? monthDays(s) : 1); }
  const bucket = (s, frequency) => s.slice(0, frequency === 'year' ? 4 : frequency === 'month' ? 7 : 10);
  function calculate(daily, components, tbMap, opts = {}) {
    if (!daily.length) throw Error('Import and apply a merchant dataset first.');
    let sum = 0;
    for (const c of components) {
      if (!['merchant', 'floor', 'swap', 'toll'].includes(c.type)) throw Error('Unknown component.');
      if (!Number.isFinite(c.share) || c.share < 0 || c.share > 100) throw Error('Capacity shares must be between 0% and 100%.');
      sum += c.share;
      if (c.type !== 'merchant' && !Number.isFinite(c.price)) throw Error('Enter a valid contract price.');
      if (c.type !== 'merchant' && !['year', 'month', 'day'].includes(c.unit)) throw Error('Invalid contract price unit.');
      if (c.type === 'floor' && (c.price < 0 || !Number.isFinite(c.upside) || c.upside < 0 || c.upside > 100)) throw Error('Floor must be non-negative; owner upside must be 0–100%.');
      if (c.type === 'swap' && (!Number.isFinite(c.multiplier) || c.multiplier < 0)) throw Error('Swap multiplier must be non-negative.');
    }
    if (sum > 100 + 1e-8) throw Error(`Physical allocation is ${sum.toFixed(2)}%. Reduce shares to 100% or less; swap shares already include their merchant physical allocation.`);
    const swaps = components.filter(c => c.type === 'swap' && c.share > 0 && c.multiplier > 0);
    const missing = daily.filter(d => !tbMap.has(d.date)).map(d => d.date);
    if (swaps.length && missing.length) throw Error(`Swap cannot be calculated: TB4 is missing on ${missing.length} merchant days (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}). Import complete TB4 data or choose a fully covered date range. Missing values are never zero-filled.`);
    const residual = Math.max(0, 100 - sum);
    const rows = daily.map(d => ({ ...d, tb: tbMap.has(d.date) ? tbMap.get(d.date) : null, physical: d.merchant * residual / 100, toll: 0, floor: 0, swap: 0, swapFixed: 0, swapVariable: 0, components: [] }));
    const totals = [];
    for (const c of components) {
      const q = c.share / 100, ledger = rows.map(r => ({ date: r.date, physical: c.type === 'toll' ? 0 : r.merchant * q, toll: 0, floor: 0, swap: 0, swapFixed: 0, swapVariable: 0, settlement: bucket(r.date, c.frequency || 'month') }));
      if (c.type === 'floor') {
        const groups = new Map();
        ledger.forEach((l, i) => { const k = l.settlement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
        for (const indices of groups.values()) {
          const m = indices.reduce((s, i) => s + ledger[i].physical, 0);
          const f = indices.reduce((s, i) => s + q * rate(c.price, c.unit, rows[i].date), 0);
          const adjustment = f + c.upside / 100 * Math.max(m - f, 0) - m;
          indices.forEach(i => ledger[i].floor = adjustment / indices.length);
        }
      }
      ledger.forEach((l, i) => {
        const r = rows[i];
        if (c.type === 'toll') l.toll = q * rate(c.price, c.unit, r.date);
        if (c.type === 'swap') {
          l.swapFixed = q * rate(c.price, c.unit, r.date);
          l.swapVariable = q * (c.multiplier === 0 ? 0 : r.tb * (opts.tbFactor || 1) * c.multiplier);
          l.swap = l.swapFixed - l.swapVariable;
        }
        for (const key of ['physical', 'toll', 'floor', 'swap', 'swapFixed', 'swapVariable']) r[key] += l[key];
        l.total = l.physical + l.toll + l.floor + l.swap;
        r.components.push({ id: c.id, name: c.name, ...l });
      });
      totals.push({ ...c, total: ledger.reduce((s, l) => s + l.total, 0), physical: ledger.reduce((s, l) => s + l.physical, 0), adjustment: ledger.reduce((s, l) => s + l.floor + l.swap + l.toll, 0) });
    }
    let baselineCum = 0, scenarioCum = 0;
    rows.forEach(r => { r.scenario = r.physical + r.toll + r.floor + r.swap; r.delta = r.scenario - r.merchant; r.baselineCum = baselineCum += r.merchant; r.scenarioCum = scenarioCum += r.scenario; });
    return { rows, totals, residual, missing, fixedCapacity: components.filter(c => c.type === 'toll').reduce((s, c) => s + c.share, 0), floorCapacity: components.filter(c => c.type === 'floor').reduce((s, c) => s + c.share, 0) };
  }
  function aggregate(rows, frequency) {
    const groups = new Map();
    for (const r of rows) {
      const key = bucket(r.date, frequency);
      if (!groups.has(key)) groups.set(key, { period: key, days: 0, merchant: 0, scenario: 0, physical: 0, toll: 0, floor: 0, swap: 0, delta: 0 });
      const g = groups.get(key); g.days++;
      for (const k of ['merchant', 'scenario', 'physical', 'toll', 'floor', 'swap', 'delta']) g[k] += r[k];
    }
    return Array.from(groups.values()).map(g => ({ ...g, expected: frequency === 'year' ? yearDays(g.period + '-01-01') : frequency === 'month' ? monthDays(g.period + '-01') : 1 }));
  }
  root.MultiOfftake = { DAY, iso, time, date, csv, number, merchant, tb, rate, calculate, aggregate, yearDays };
})(typeof window === 'undefined' ? globalThis : window);
