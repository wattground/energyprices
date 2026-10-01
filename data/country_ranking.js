(() => {
  'use strict';
  const data = window.SPOT_PRICE_DATA;
  const DAY = 86400000;
  const countries = ['Belgium', 'Germany', 'Italy', 'Romania', 'United Kingdom'];
  const $ = id => document.getElementById(id);
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const days = () => Math.max(1, Number(window.MARKET_TREND_WINDOW) || 30);
  const dateMs = s => Date.parse(`${s}T00:00:00Z`);
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const dateLabel = s => new Intl.DateTimeFormat('en-GB', {day:'2-digit', month:'short', year:'numeric', timeZone:'UTC'}).format(new Date(dateMs(s)));
  const fmt = x => finite(x) ? x.toLocaleString('en-GB', {minimumFractionDigits:1, maximumFractionDigits:1}) : '—';

  function rows(country) {
    const out = [];
    for (const yd of Object.values(data.series[country].years)) {
      for (const [month, md] of Object.entries(yd.months)) {
        for (const d of md.days) out.push({date:`${month}-${String(d.day).padStart(2, '0')}`, tb1:d.spreadIndexes?.[0], tb2:finite(d.spreadIndexes?.[1]) ? d.spreadIndexes[1] / 2 : null});
      }
    }
    return out;
  }

  function average(country, end, key) {
    const map = new Map(rows(country).map(row => [row.date, row]));
    const values = Array.from({length:days()}, (_, i) => map.get(iso(dateMs(end) - i * DAY))?.[key]).filter(finite);
    return {average:values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count:values.length};
  }

  function render(target, noteTarget, key, end) {
    const windowSize = days();
    const ranking = countries.map(country => ({country, ...average(country, end, key)})).sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity));
    const max = Math.max(...ranking.map(item => item.average || 0), 1);
    const barClass = key === 'tb2' ? ' tb2' : '';
    $(target).innerHTML = ranking.map(item => {
      const height = finite(item.average) ? Math.max(3, item.average / max * 100) : 0;
      return `<div class="ranking-bar-item"><div class="ranking-bar-value">${fmt(item.average)}</div><div class="ranking-bar-wrap"><div class="ranking-bar${barClass}" style="--bar-height:${height}%" title="${item.country}: ${fmt(item.average)} €/MWh"></div></div><div class="ranking-bar-country">${item.country}</div></div>`;
    }).join('');
    $(noteTarget).textContent = `Average of available daily values from the selected date backwards ${windowSize} days.`;
  }

  function update() {
    if (!data?.series) return;
    const selected = $('priceDate')?.value;
    const fallback = rows('Germany').filter(row => finite(row.tb1) || finite(row.tb2)).at(-1)?.date;
    const end = selected || fallback;
    if (!end) return;
    const windowSize = days();
    $('rankingPeriod').textContent = `${windowSize}-day average ending ${dateLabel(end)}`;
    $('tb1RankingTitle').textContent = `TB1 average · ${windowSize} days`;
    $('tb2RankingTitle').textContent = `TB2 average · ${windowSize} days`;
    render('tb1Ranking', 'tb1RankingNote', 'tb1', end);
    render('tb2Ranking', 'tb2RankingNote', 'tb2', end);
  }

  if (data?.series) {
    $('countrySelect')?.addEventListener('change', update);
    $('priceDate')?.addEventListener('change', update);
    $('latestDay')?.addEventListener('click', update);
    window.addEventListener('market-trend-window-change', update);
    setTimeout(update, 0);
  }
})();
