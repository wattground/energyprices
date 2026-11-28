(() => {
  const mobileStyle = document.createElement('style');
  mobileStyle.textContent = `
    .panel-launch {
      display: grid;
      gap: 10px;
      min-height: 180px;
      align-content: center;
      padding: 28px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      color: var(--ink);
      text-decoration: none;
      box-shadow: 0 8px 22px rgba(22, 31, 25, 0.06);
    }
    .panel-launch strong { font-size: 20px; }
    .panel-launch span { color: var(--muted); font-size: 13px; }
    .panel-launch:hover { border-color: var(--green, #20856d); }
    .direct-dashboard-menu .overview-card { color: inherit; text-decoration: none; cursor: pointer; }
    .direct-dashboard-menu .overview-card:hover { border-color: var(--green, #20856d); transform: translateY(-2px); }
    .overview-open { margin-top: auto; color: var(--green, #20856d); font-size: 13px; font-weight: 800; }
    .flat-shell { display: block !important; width: min(1440px, calc(100% - 32px)) !important; min-height: 0 !important; margin: 24px auto !important; }
    .flat-shell .content { padding: 34px 38px 44px; }
    @media (max-width: 800px) {
      body { overflow-x: hidden; }
      aside {
        position: sticky;
        top: 0;
        z-index: 20;
        box-shadow: 0 2px 14px rgba(22, 31, 25, 0.08);
      }
      .nav {
        display: flex !important;
        gap: 7px;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        padding: 2px 2px 6px;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }
      .nav::after { content: ''; flex: 0 0 8px; }
      .nav button {
        flex: 0 0 auto;
        width: auto !important;
        white-space: nowrap;
      }
      .content { padding-top: 18px; }
      .flat-shell { width: 100% !important; margin: 0 !important; border-radius: 0 !important; }
      .flat-shell .content { padding: 24px 16px 36px; }
      .panel-launch { min-height: 150px; padding: 22px; }
    }
  `;
  document.head.append(mobileStyle);

  const shell = document.querySelector('.shell');

  const colors = {
    'spot_prices.html': ['#f1f4f1', '#e7ece8', '#9eaaa1'],
    'negative_prices.html': ['#f5f1f1', '#eee6e6', '#b9a2a2'],
    'bess_indexes.html': ['#f1f3f5', '#e6eaed', '#9da8b0'],
  };
  const routes = {
    'spot_prices.html': {
      map: 'spot_price_map.html', hourly: 'spot_prices_hourly.html#hourly', baseload: 'wholesale_average.html', captured: 'captured_price.html'
    },
    'negative_prices.html': {
      heatmap: 'heatmap.html', country: 'by_country_negative_prices.html', monthly: 'monthly_negative_prices.html', renewable: 'renewable_negative_impact.html'
    },
    'bess_indexes.html': {
      spreads: 'daily_spread.html', simulation: 'bess_spread_simulation.html', ranking: 'bess_ranking.html', simulations: 'bess_simulations.html'
    }
  };
  const page = location.pathname.split('/').pop();
  const sectionRoutes = routes[page] || routes['spot_prices.html'];
  document.querySelectorAll('.panel iframe').forEach(frame => {
    const link = document.createElement('a');
    link.className = 'panel-launch';
    link.href = frame.getAttribute('src');
    link.innerHTML = `<strong>${frame.title || 'Open dashboard'}</strong><span>Open dashboard</span>`;
    frame.replaceWith(link);
  });
  const navButtons = [...document.querySelectorAll('.nav button[data-panel]')];
  const overviewPanel = document.querySelector('#panel-overview');
  if (overviewPanel) {
    const grid = document.createElement('div');
    grid.className = 'overview direct-dashboard-menu';
    navButtons.filter(button => button.dataset.panel !== 'overview').forEach(button => {
      const link = document.createElement('a');
      const target = sectionRoutes[button.dataset.panel];
      link.className = 'overview-card';
      link.href = target || '#';
      link.innerHTML = `<span class="eyebrow">DASHBOARD</span><strong>${button.firstChild.textContent.trim()}</strong><p>${button.querySelector('span')?.textContent || 'Open dashboard'}</p><span class="overview-open">Open dashboard</span>`;
      grid.append(link);
    });
    overviewPanel.replaceChildren(grid);
    const title = document.querySelector('#sectionTitle');
    const description = document.querySelector('#sectionDescription');
    if (title) title.textContent = page === 'spot_prices.html' ? 'Spot prices' : page === 'negative_prices.html' ? 'Negative prices' : 'BESS indexes';
    if (description) description.textContent = 'Choose a dashboard to open directly.';
  }
  document.querySelector('aside')?.remove();
  shell?.classList.add('flat-shell');
  const [background, activeBackground, border] = colors[location.pathname.split('/').pop()] || colors['spot_prices.html'];
  navButtons.forEach(button => {
    button.classList.add('overview-nav');
    const target = sectionRoutes[button.dataset.panel];
    button.style.background = button.dataset.panel === 'overview' && button.classList.contains('active') ? activeBackground : background;
    button.style.borderStyle = 'dashed';
    button.style.borderColor = border;
    button.style.color = 'var(--muted)';
    if (target) button.addEventListener('click', () => { location.href = target; });
    else button.setAttribute('aria-label', 'Section home');
  });
})();
