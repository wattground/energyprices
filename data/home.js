(() => {
  'use strict';
  const $ = id => document.getElementById(id), data = window.SPOT_PRICE_DATA;
  const DAY = 86400000, blue = '#397cc2', gold = '#c49b36';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const trendDays = () => Math.max(1, Number(window.MARKET_TREND_WINDOW) || 30);
  const fmt = x => finite(x) ? x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = s => Date.parse(s + 'T00:00:00Z');
  const iso = t => new Date(t).toISOString().slice(0,10);
  const dateLabel = (s, long = false) => new Intl.DateTimeFormat('en-GB',{ day:'2-digit',month:long?'long':'short',...(long?{year:'numeric'}:{}), timeZone:'UTC' }).format(new Date(time(s)));
  const weekdayLabel = s => new Intl.DateTimeFormat('en-GB',{ weekday:'long', timeZone:'UTC' }).format(new Date(time(s)));
  const cache = new Map(); let loadQueue = Promise.resolve(), revision = 0;
  function hourlyData(code) {
    if (cache.has(code)) return Promise.resolve(cache.get(code));
    const task = loadQueue.catch(()=>{}).then(() => {
      if (cache.has(code)) return cache.get(code);
      return new Promise((resolve,reject) => {
        const script = document.createElement('script'); script.src = `data/colocation_prices/${encodeURIComponent(code)}.js`;
        script.onload = () => { const d = window.COLOCATION_PRICE_DATA; script.remove(); if (d?.iso3 !== code) {reject(Error('Hourly dataset does not match the selected country.'));return;} cache.set(code,d);resolve(d); };
        script.onerror = () => {script.remove();reject(Error('Hourly data could not be loaded for this country.'));};
        document.head.append(script);
      });
    });
    loadQueue = task; return task;
  }
  function dailyRows(country) {
    const rows=[];
    for(const yd of Object.values(data.series[country].years)) for(const [month,md] of Object.entries(yd.months)) for(const d of md.days) rows.push({date:`${month}-${String(d.day).padStart(2,'0')}`,base:d.averagePrice,pv:d.capturedPrices?.solar_pv,observations:d.observations});
    return rows.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function trend(rows, end) {
    const days = trendDays(), threshold = Math.ceil(days * .9);
    const map=new Map(rows.map(r=>[r.date,r]));
    return Array.from({length:days},(_,i)=>{
      const t=time(end)-(days-1-i)*DAY, date=iso(t), windowRows=Array.from({length:days},(_,j)=>map.get(iso(t-j*DAY)));
      const mean=k=>{const valid=windowRows.filter(r=>r&&finite(r[k]));return valid.length>=threshold?valid.reduce((s,r)=>s+r[k],0)/valid.length:null;};
      return {date,base:mean('base'),pv:mean('pv')};
    });
  }
  function frame(values, labels, unit='€/MWh', right=22) {
    const w=620,h=290,l=53,r=right,t=22,b=42;
    let min=Math.min(0,...values),max=Math.max(0,...values); if(min===max)max=min+1;
    const pad=(max-min)*.13; max+=pad;if(min<0)min-=pad;
    const x=i=>l+(w-l-r)*i/Math.max(1,labels.length-1), y=v=>t+(h-t-b)*(max-v)/(max-min);
    let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(unit+' price chart')}"><text x="${l}" y="11" fill="#6c7871" font-size="10">${escape(unit)}</text>`;
    for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;svg+=`<line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" stroke="#e9ede6"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#6c7871">${Math.round(v)}</text>`;}
    if(min<0)svg+=`<line x1="${l}" y1="${y(0)}" x2="${w-r}" y2="${y(0)}" stroke="#aab9ae"/>`;
    [...new Set([0,Math.round((labels.length-1)/3),Math.round((labels.length-1)*2/3),labels.length-1])].forEach(i=>svg+=`<text x="${x(i)}" y="${h-15}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}" font-size="10" fill="#6c7871">${escape(labels[i])}</text>`);
    return {svg,x,y,w,h,l,r};
  }
  function line(points,key,color,f,label,dashed=false) {
    let path='',open=false,marks='';
    points.forEach((p,i)=>{if(!finite(p[key])){open=false;return;}path+=`${open?'L':'M'}${f.x(i)},${f.y(p[key])} `;open=true;marks+=`<circle cx="${f.x(i)}" cy="${f.y(p[key])}" r="3" fill="${color}" opacity="0"><title>${escape(p.date||p.label)} · ${escape(label)}: ${fmt(p[key])} €/MWh</title></circle>`;});
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${dashed?1.1:2.5}" stroke-linejoin="round"${dashed?' class="historical-hourly-average" stroke-dasharray="4 5" stroke-opacity="0.75"':''}/>${marks}`;
  }
  function drawTrend(rows,latest) {
    const days = trendDays(), threshold = Math.ceil(days * .9);
    const points=trend(rows,latest.date);
    const byDate=new Map(rows.map(r=>[r.date,r]));
    const missing={};
    for(const k of ['base','pv'])missing[k]=Array.from({length:days},(_,i)=>iso(time(latest.date)-(days-1-i)*DAY)).filter(date=>!finite(byDate.get(date)?.[k]));
    const messages=[];
    for(const [k,name] of [['base','Baseload'],['pv','Captured PV']]){
      const n=missing[k].length;
      if(n>days-threshold){points.forEach(p=>p[k]=null);messages.push(`${name}: Missing data — ${n}/${days} days missing; series hidden.`);}
      else if(n)messages.push(`${name}: ${n}/${days} days missing; average uses ${days-n} available days (nulls excluded).`);
      else if(points.some(p=>!finite(p[k])))messages.push(`${name}: Missing data in earlier rolling windows with more than ${days-threshold} missing days.`);
    }
    const coverage=$('trendCoverage');coverage.hidden=!messages.length;coverage.className='note'+(missing.base.length>3||missing.pv.length>3?' error':'');
    coverage.textContent=messages.join(' ');
    const values=points.flatMap(p=>[p.base,p.pv]).concat(latest.base,latest.pv).filter(finite);
    const f=frame(values,points.map(p=>dateLabel(p.date)),'€/MWh',155);let svg=f.svg;
    const labelY={base:finite(latest.base)?Math.max(38,Math.min(215,f.y(latest.base))):null,pv:finite(latest.pv)?Math.max(38,Math.min(215,f.y(latest.pv))):null};
    if(labelY.base!==null&&labelY.pv!==null&&Math.abs(labelY.base-labelY.pv)<42){const upper=labelY.base<=labelY.pv?'base':'pv',lower=upper==='base'?'pv':'base';labelY[upper]=Math.min(labelY[upper],173);labelY[lower]=labelY[upper]+42;}
    for(const [k,color,name] of [['base',blue,'Baseload'],['pv',gold,'Captured PV']]) {
      svg+=line(points,k,color,f,name+` · rolling ${days} days`);
      const v=latest[k], avg=points.at(-1)[k], x=f.x(points.length-1);
      if(finite(v)){if(finite(avg))svg+=`<line x1="${x}" y1="${f.y(avg)}" x2="${x}" y2="${f.y(v)}" stroke="${color}" stroke-dasharray="3 4" opacity=".6"/>`;
      const y=f.y(v),ly=labelY[k];svg+=`<path d="M${x},${y-5} l5,5 l-5,5 l-5,-5 Z" fill="${color}" stroke="white" stroke-width="1.5"><title>${latest.date} · actual daily ${name}: ${fmt(v)} €/MWh</title></path><path d="M${x+6},${y} L${x+16},${ly}" fill="none" stroke="${color}" opacity=".6"/><text x="${x+20}" y="${ly-9}" fill="${color}" font-size="10">${name} · daily mean</text><text x="${x+20}" y="${ly+5}" fill="${color}" font-size="12" font-weight="700">${fmt(v)} €/MWh</text><text x="${x+20}" y="${ly+18}" fill="#6c7871" font-size="9">${dateLabel(latest.date)}</text>`;}
    }
    $('trendChart').innerHTML=svg+'</svg>';
    $('trendDates').textContent=`${dateLabel(points[0].date)} – ${dateLabel(latest.date,true)} · ${days}-day visible window`;
  }
  function drawHourly(source,date) {
    const days = trendDays(), threshold = Math.ceil(days * .9);
    const md=source.years[date.slice(0,4)]?.months[date.slice(0,7)], rows=md?.find(r=>r[0]===+date.slice(8))?.[1];
    if(!rows?.length||rows.some(r=>!finite(r[1])))throw Error('No hourly curve available for the selected date. No other date has been substituted.');
    const values=rows.map(r=>r[1]),mean=values.reduce((a,b)=>a+b,0)/values.length,sorted=[...values].sort((a,b)=>a-b);
    const complete=[23,24,25].includes(rows.length);
    const spread=n=>complete?(sorted.slice(-n).reduce((a,b)=>a+b,0)-sorted.slice(0,n).reduce((a,b)=>a+b,0))/n:null;
    const history=Array.from({length:24},()=>({values:[],dailyMeans:[],days:0}));
    for(let offset=1;offset<=days;offset++){
      const previous=iso(time(date)-offset*DAY);
      const priorRows=source.years[previous.slice(0,4)]?.months[previous.slice(0,7)]?.find(r=>r[0]===+previous.slice(8))?.[1]||[];
      const observed=new Map();
      for(const [hour,value] of priorRows)if(Number.isInteger(hour)&&hour>=0&&hour<24&&finite(value)){history[hour].values.push(value);if(!observed.has(hour))observed.set(hour,[]);observed.get(hour).push(value);}
      observed.forEach((values,hour)=>{history[hour].days++;history[hour].dailyMeans.push(values.reduce((a,b)=>a+b,0)/values.length);});
    }
    const seen=new Map(); const points=rows.map(([hour,price])=>{const occurrence=(seen.get(hour)||0)+1;seen.set(hour,occurrence);const past=history[hour];return {label:String(hour).padStart(2,'0')+':00'+(occurrence>1?' (2)':''),price,historicalMean:past&&past.days>=threshold?past.dailyMeans.reduce((a,b)=>a+b,0)/past.days:null,range:past&&past.days>=threshold?{min:Math.min(...past.values),max:Math.max(...past.values),days:past.days}:null};});
    const extrema=points.flatMap(p=>p.range?[p.range.min,p.range.max]:[]);
    const f=frame(values.concat(extrema),points.map(p=>p.label));
    let band='',segment=[];
    const flush=()=>{
      if(segment.length>1){const upper=segment.map(i=>`${f.x(i)},${f.y(points[i].range.max)}`),lower=[...segment].reverse().map(i=>`${f.x(i)},${f.y(points[i].range.min)}`);band+=`<polygon class="historical-range" points="${upper.concat(lower).join(' ')}" fill="#b8bfc2" fill-opacity=".32"><title>Hourly minimum–maximum over the previous ${days} calendar days; selected day excluded.</title></polygon>`;}
      else if(segment.length===1){const i=segment[0];band+=`<line x1="${f.x(i)}" x2="${f.x(i)}" y1="${f.y(points[i].range.min)}" y2="${f.y(points[i].range.max)}" stroke="#b8bfc2" stroke-width="4"/>`;}
      segment=[];
    };
    points.forEach((p,i)=>{if(p.range)segment.push(i);else flush();});flush();
    points.forEach((p,i)=>{if(p.range)band+=`<circle class="range-tooltip" data-hour="${escape(p.label)}" data-min="${p.range.min}" data-max="${p.range.max}" data-days="${p.range.days}" cx="${f.x(i)}" cy="${f.y((p.range.min+p.range.max)/2)}" r="6" fill="transparent"><title>${escape(p.label)} · previous ${days} days: ${fmt(p.range.min)}–${fmt(p.range.max)} €/MWh · ${p.range.days}/${days} days</title></circle>`;});
    $('hourlyChart').innerHTML=f.svg+band+line(points,'historicalMean','#899b90',f,`Previous ${days} days · hourly average`,true)+line(points,'price',blue,f,'Day-Ahead')+'</svg>';
    $('hourlyAverage').textContent=fmt(mean);if($('tb1'))$('tb1').textContent=fmt(spread(1));$('tb2').textContent=fmt(spread(2));$('tb4').textContent=fmt(spread(4));
    $('hourlyDate').textContent=dateLabel(date,true)+' · market-local hours';
    const unavailable=points.filter(p=>!p.range).length;
    $('hourlyCoverage').textContent=`${rows.length} hourly observations. Grey range and dashed hourly average: ${dateLabel(iso(time(date)-days*DAY),true)} – ${dateLabel(iso(time(date)-DAY),true)}, excluding the selected day. ${unavailable?`Missing data: range and average omitted for ${unavailable} displayed hour(s) with fewer than ${threshold} available days. `:''}${complete?'Market-local hours; repeated DST hours enter the min–max separately and are averaged within each day before calculating the historical hourly mean.':'Incomplete selected day: daily average uses available hours; TBx values are withheld.'}`;
  }
  async function update(resetDate = false) {
    const request=++revision,country=$('countrySelect').value,c=data.countries.find(c=>c.name===country);
    const rows=dailyRows(country),latest=rows.filter(r=>finite(r.base)).at(-1);
    for(const id of ['hourlyAverage','tb1','tb2','tb4']){const el=$(id);if(el)el.textContent='—';}
    $('hourlyCoverage').textContent='';$('hourlyDate').textContent='Loading hourly data…';
    $('hourlyChart').innerHTML='<div class="empty">Loading hourly prices…</div>';
    if(!latest){$('latestDate').textContent='No daily prices available.';$('trendChart').innerHTML='<div class="empty">No daily data</div>';$('hourlyChart').innerHTML='<div class="empty">No hourly date to display</div>';return;}
    const input=$('priceDate');input.min=rows.find(r=>finite(r.base)).date;input.max=latest.date;
    if(resetDate)input.value=window.FIXED_MARKET_DATE || latest.date;
    const selected=rows.find(r=>r.date===input.value&&finite(r.base));
    if(!selected){
      $('trendCoverage').hidden=true;
      $('latestDate').textContent=input.value?'No prices for the selected date':'Select a market date';
      $('trendChart').innerHTML='<div class="empty">Select a date with available prices, or use Latest day.</div>';
      $('hourlyChart').innerHTML='<div class="empty">No hourly date to display</div>';
      $('hourlyDate').textContent='—';$('trendDates').textContent='—';
      return;
    }
    $('latestDate').textContent=`${dateLabel(selected.date,true)} · ${weekdayLabel(selected.date)}${selected.date===latest.date?' · latest available day':' · selected day'}`;drawTrend(rows,selected);
    try { const hourly=await hourlyData(c.iso3);if(request!==revision)return;drawHourly(hourly,selected.date); }
    catch(e){if(request!==revision)return;$('hourlyDate').textContent=dateLabel(selected.date,true);$('hourlyChart').innerHTML=`<div class="empty error">${escape(e.message)}</div>`;}
  }
  if(!data?.countries?.length){$('latestDate').textContent='Site price dataset could not be loaded.';return;}
  data.countries.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>$('countrySelect').add(new Option(`${c.name} (${c.iso3})`,c.name)));
  if(data.series.Germany)$('countrySelect').value='Germany';
  $('countrySelect').addEventListener('change',()=>update(true));
  $('priceDate').addEventListener('change',()=>update());
  $('latestDay').addEventListener('click',()=>update(true));
  window.addEventListener('market-trend-window-change',()=>update(false));
  update(true);
})();
