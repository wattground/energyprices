/* Browser convenience gate, NOT server authentication. Public source and assets
   remain accessible. Never rely on this mechanism for confidential data. */
(() => {
  'use strict';
  const key = 'wattground.simulations.access.v1';
  const digest = 'ff150bc51704cbc2fb2f412c2d8a79afb6212c9dff3d6127c2b0f937a33ea5ed';
  const root = document.documentElement;
  let memoryAccess = false;
  function allowed() {
    try { return sessionStorage.getItem(key) === digest || memoryAccess; }
    catch { return memoryAccess; }
  }
  const overlay = document.createElement('section');
  overlay.id = 'simulations-access';
  overlay.setAttribute('aria-labelledby', 'simulations-login-title');
  overlay.innerHTML = `<form class="simulations-login">
    <div class="eyebrow">WATTGROUND</div>
    <h1 id="simulations-login-title">BESS simulations</h1>
    <p><strong>WIP page</strong></p>
    <p>Enter the access password to open the simulation tools.</p>
    <label for="simulations-password">Password</label>
    <input id="simulations-password" type="password" autocomplete="current-password" required aria-describedby="simulations-error">
    <p id="simulations-error" role="status" aria-live="polite"></p>
    <button type="submit">Enter simulations</button>
    <a href="bess_indexes.html">← Back to BESS Indexes</a>
  </form>`;
  document.body.append(overlay);
  const input = overlay.querySelector('input'), error = overlay.querySelector('#simulations-error'), submit = overlay.querySelector('button');
  function display() {
    const access = allowed();
    root.toggleAttribute('data-simulations-locked', !access);
    overlay.hidden = access;
    if (!access) { input.value = ''; input.focus(); }
  }
  overlay.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; error.textContent = '';
    try {
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.value));
      const value = [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (value !== digest) { error.textContent = 'Incorrect password. Please try again.'; input.select(); return; }
      try { sessionStorage.setItem(key, digest); } catch { memoryAccess = true; }
      input.value = ''; display();
      const heading = document.querySelector('main h1');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
      window.dispatchEvent(new Event('resize'));
    } catch { error.textContent = 'Access could not be checked. Use HTTPS or open the site locally in a current browser.'; }
    finally { submit.disabled = false; }
  });
  const lock = document.createElement('button');
  lock.type = 'button'; lock.className = 'simulations-lock'; lock.textContent = 'Lock simulations';
  lock.addEventListener('click', () => {
    memoryAccess = false;
    try { sessionStorage.removeItem(key); } catch { /* No persistent session. */ }
    error.textContent = ''; display();
  });
  document.querySelector('main')?.prepend(lock);
  window.addEventListener('pageshow', display);
  display();
})();
