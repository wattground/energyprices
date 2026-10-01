(() => {
  'use strict';
  const buttons = [...document.querySelectorAll('[data-window-days]')];
  if (!buttons.length) return;
  function select(days) {
    window.MARKET_TREND_WINDOW = Number(days) || 30;
    buttons.forEach(button => {
      const active = Number(button.dataset.windowDays) === window.MARKET_TREND_WINDOW;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-window-pattern]').forEach(element => {
      element.textContent = element.dataset.windowPattern.replace('{days}', window.MARKET_TREND_WINDOW);
    });
    document.querySelectorAll('[data-window-metric]').forEach(element => {
      element.textContent = `${window.MARKET_TREND_WINDOW}d ${element.dataset.windowMetric}`;
    });
    window.dispatchEvent(new Event('market-trend-window-change'));
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.windowDays)));
  select(window.MARKET_TREND_WINDOW || 30);
})();
