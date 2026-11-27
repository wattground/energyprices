(() => {
  const mobileStyle = document.createElement('style');
  mobileStyle.textContent = `
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
      .panel iframe {
        height: calc(100vh - 170px) !important;
        min-height: 520px !important;
      }
    }
  `;
  document.head.append(mobileStyle);

  const colors = {
    'spot_prices.html': ['#f1f4f1', '#e7ece8', '#9eaaa1'],
    'negative_prices.html': ['#f5f1f1', '#eee6e6', '#b9a2a2'],
    'bess_indexes.html': ['#f1f3f5', '#e6eaed', '#9da8b0'],
  };
  const [background, activeBackground, border] = colors[location.pathname.split('/').pop()] || colors['spot_prices.html'];
  document.querySelectorAll('.nav button[data-panel="overview"]').forEach(button => {
    button.classList.add('overview-nav');
    button.style.background = button.classList.contains('active') ? activeBackground : background;
    button.style.borderStyle = 'dashed';
    button.style.borderColor = border;
    button.style.color = 'var(--muted)';
    button.addEventListener('click', () => {
      button.style.background = activeBackground;
      button.style.color = 'var(--ink)';
      button.style.boxShadow = 'none';
    });
  });
})();
