(() => {
  const page = location.pathname.split('/').pop();
  const sections = {
    spot: {
      home: 'spot_prices.html',
      pages: [['spot_price_map.html', 'Price map'], ['spot_prices_hourly.html#hourly', 'Hourly'], ['wholesale_average.html', 'Baseload'], ['captured_price.html', 'Captured']]
    },
    negative: {
      home: 'negative_prices.html',
      pages: [['heatmap.html', 'Heatmap'], ['by_country_negative_prices.html', 'By country'], ['monthly_negative_prices.html', 'Monthly'], ['renewable_negative_impact.html', 'Renewables']]
    },
    bess: {
      home: 'bess_indexes.html',
      pages: [['daily_spread.html', 'TBx spreads'], ['bess_spread_simulation.html', 'Dispatch'], ['bess_ranking.html', 'Ranking'], ['bess_simulations.html', 'Simulations']]
    }
  };
  const section = Object.values(sections).find(item => item.pages.some(([href]) => href.split('#')[0] === page));
  if (!section) return;
  const style = document.createElement('style');
  style.textContent = `
    .dashboard-switcher { display:flex; gap:6px; align-items:center; width:min(1440px,calc(100% - 32px)); margin:0 auto; padding:10px 0; overflow-x:auto; scrollbar-width:thin; }
    .dashboard-switcher a { flex:0 0 auto; border:1px solid #dce4dd; border-radius:7px; background:#fff; color:#68726b; padding:7px 10px; font:700 12px/1.2 Inter,ui-sans-serif,system-ui,sans-serif; text-decoration:none; white-space:nowrap; }
    .dashboard-switcher a:hover, .dashboard-switcher a.active { border-color:#20856d; color:#146b57; background:#e5f3ed; }
    .dashboard-switcher .home { margin-right:4px; background:#f4f6f1; }
    @media (max-width:560px) { .dashboard-switcher { width:calc(100% - 20px); padding:8px 0; } }
  `;
  document.head.append(style);
  const nav = document.createElement('nav');
  nav.className = 'dashboard-switcher';
  nav.setAttribute('aria-label', 'Dashboard navigation');
  const home = document.createElement('a');
  home.className = 'home'; home.href = section.home; home.textContent = 'Section home'; nav.append(home);
  section.pages.forEach(([href, label]) => {
    const link = document.createElement('a');
    link.href = href; link.textContent = label;
    if (href.split('#')[0] === page) { link.className = 'active'; link.setAttribute('aria-current', 'page'); }
    nav.append(link);
  });
  document.body.prepend(nav);
})();
