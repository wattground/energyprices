window.SITE_META = {"latestLocalDate": "2026-09-29"};
document.querySelectorAll('[data-latest-date]').forEach(function (element) {
  var value = window.SITE_META.latestLocalDate;
  if (!value) { element.textContent = 'Latest available date: -'; return; }
  var parts = value.split('-').map(Number);
  var formatted = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date(parts[0], parts[1] - 1, parts[2]));
  element.textContent = 'Latest available date: ' + formatted;
});
