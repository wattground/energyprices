(() => {
  'use strict';
  const select = document.getElementById('countrySelect');
  const container = document.getElementById('countryButtons');
  if (!select || !container) return;

  function syncActive() {
    container.querySelectorAll('button').forEach(button => {
      const active = button.dataset.country === select.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  container.querySelectorAll('button[data-country]').forEach(button => {
    button.addEventListener('click', () => {
      if (select.value === button.dataset.country) return;
      select.value = button.dataset.country;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    });
  });

  select.addEventListener('change', syncActive);
  syncActive();
})();
