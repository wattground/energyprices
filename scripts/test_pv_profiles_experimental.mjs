// Run with: node scripts/test_pv_profiles_experimental.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import '../data/pv_profiles_experimental.js';

const data = globalThis.PV_PROFILES_EXPERIMENTAL;
const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const sum = values => values.reduce((a, b) => a + b, 0);
function close(actual, expected, context) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12, `${context}: ${actual} != ${expected}`);
}
const direct = { BEL: ['BE'], DEU: ['DE'], DNK: ['DK1', 'DK2'], FRA: ['FR'], HUN: ['HU'], NLD: ['NL'], POL: ['PL'], SWE: ['SE3', 'SE4'], GRC: ['GR'], ITA: ['IT-PUN'] };
const proxies = {
  ALB: ['GRC', 'ITA'], AUT: ['DEU', 'HUN', 'ITA'], BGR: ['GRC', 'HUN'], HRV: ['HUN', 'ITA'],
  CZE: ['DEU', 'POL'], EST: ['SWE', 'POL'], FIN: ['SWE'], IRL: ['NLD', 'BEL', 'FRA'],
  LVA: ['SWE', 'POL'], LTU: ['POL', 'SWE'], LUX: ['BEL', 'DEU', 'FRA'], MNE: ['ITA', 'GRC'],
  MKD: ['GRC'], NOR: ['SWE', 'DNK'], PRT: ['FRA', 'ITA'], ROU: ['HUN', 'GRC'], SRB: ['HUN', 'GRC'],
  SVK: ['HUN', 'POL'], SVN: ['ITA', 'HUN'], ESP: ['FRA', 'ITA'], CHE: ['FRA', 'DEU', 'ITA'], GBR: ['NLD', 'BEL', 'FRA']
};
const spot = await readFile(new URL('../data/spot_prices.js', import.meta.url), 'utf8');
const coverage = [...spot.matchAll(/"name":\s*"([^"]+)",\s*"iso3":\s*"([^"]+)"/g)];
assert.equal(coverage.length, 32);
assert.deepEqual(Object.keys(data.countries).sort(), coverage.map(m => m[2]).sort());
assert.deepEqual(data.hourLabels, Array.from({ length: 24 }, (_, i) => i + 1));
assert.equal(Object.keys(data.sourceProfiles).length, 12);
for (const [sheet, source] of Object.entries(data.sourceProfiles)) {
  assert.deepEqual(Object.keys(source.months).sort(), months);
  for (const month of months) {
    assert.equal(source.months[month].length, 24);
    assert.ok(source.months[month].every(v => Number.isFinite(v) && v >= 0));
    close(sum(source.months[month]), source.cachedDailySums[month], `${sheet} ${month} Excel daily total`);
    close(sum(source.months[month]) * source.days[month], source.cachedMonthlyShares[month], `${sheet} ${month} Excel monthly total`);
    assert.equal(source.days[month], data.daysPerMonth[month]);
  }
}
for (const match of coverage) {
  const iso = match[2];
  const country = data.countries[iso];
  assert.equal(country.name, match[1]);
  assert.equal(country.iso3, iso);
  assert.ok(country.label);
  assert.equal(country.isEstimated, Boolean(proxies[iso]));
  assert.deepEqual(country.sourceCountries.map(x => x.iso3), proxies[iso] || [iso]);
  close(sum(country.sourceCountries.map(x => x.weight)), 1, `${iso} country weights`);
  close(sum(country.sourceSheets.map(x => x.weight)), 1, `${iso} sheet weights`);
  assert.deepEqual(Object.keys(country.months).sort(), months);
  const donors = proxies[iso] || [iso];
  for (const month of months) {
    const actual = country.months[month];
    assert.equal(actual.length, 24);
    assert.equal(country.normalizedMonths[month].length, 24);
    for (let hour = 0; hour < 24; hour++) {
      // Independently reduce the original sheets with equal country, then zone, weights.
      const expected = sum(donors.map(donor => sum(direct[donor].map(sheet => data.sourceProfiles[sheet].months[month][hour])) / direct[donor].length)) / donors.length;
      close(actual[hour], expected, `${iso} ${month} hour ${hour + 1}`);
      assert.ok(actual[hour] >= 0);
      close(country.normalizedMonths[month][hour], actual[hour] / sum(actual), `${iso} normalized value`);
    }
    close(sum(country.normalizedMonths[month]), 1, `${iso} ${month} normalized sum`);
    close(country.dailySums[month], sum(actual), `${iso} ${month} daily sum`);
  }
  close(country.annualWeightedSum, sum(months.map(m => sum(country.months[m]) * data.daysPerMonth[m])), `${iso} annual total`);
}
assert.deepEqual(data.countries.ITA.months, data.sourceProfiles['IT-PUN'].months);
assert.deepEqual(data.countries.FIN.months, data.countries.SWE.months);
assert.deepEqual(data.countries.MKD.months, data.countries.GRC.months);

const generated = JSON.parse(await readFile(new URL('../data/generation_profiles.json', import.meta.url), 'utf8'));
const liveSolar = generated.technologies.solar_pv;
assert.equal(liveSolar.profileScope, 'country');
assert.deepEqual(Object.keys(liveSolar.countries).sort(), Object.keys(data.countries).sort());
assert.deepEqual(liveSolar.countries.ITA.sourceSheets, [{ sheet: 'IT-PUN', weight: 1 }]);
assert.deepEqual(liveSolar.countries.DNK.sourceSheets, [
  { sheet: 'DK1', weight: 0.5 }, { sheet: 'DK2', weight: 0.5 }
]);
assert.deepEqual(liveSolar.countries.SWE.sourceSheets, [
  { sheet: 'SE3', weight: 0.5 }, { sheet: 'SE4', weight: 0.5 }
]);
for (const iso of Object.keys(data.countries)) {
  for (const month of months) {
    assert.deepEqual(liveSolar.countries[iso].rawMonths[month], data.countries[iso].months[month]);
    assert.deepEqual(liveSolar.countries[iso].months[month], data.countries[iso].normalizedMonths[month]);
  }
}
assert.ok(generated.technologies.wind_onshore.months, 'wind must remain a global synthetic profile');
for (const file of await readdir(new URL('../', import.meta.url))) {
  if (!file.endsWith('.html') || file === 'pv_profiles_test.html') continue;
  const html = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  assert.ok(!html.includes('pv_profiles_experimental'), `${file} must not load the experimental dataset`);
}
const viewer = await readFile(new URL('../pv_profiles_test.html', import.meta.url), 'utf8');
assert.ok(viewer.includes('data/pv_profiles_experimental.js'), 'experimental viewer must load the test dataset');
const updater = await readFile(new URL('update_prices.py', import.meta.url), 'utf8');
const builder = await readFile(new URL('build_negative_prices.py', import.meta.url), 'utf8');
assert.ok(!updater.includes('pv_profiles_experimental'), 'update_prices.py must not use the preview dataset');
assert.ok(!builder.includes('pv_profiles_experimental'), 'build_negative_prices.py must not use the preview dataset');
assert.ok(builder.includes('pv_profiles_source.json'), 'the live build must load the versioned PV source');
const capturedPage = await readFile(new URL('../captured_price.html', import.meta.url), 'utf8');
const mapPage = await readFile(new URL('../spot_price_map.html', import.meta.url), 'utf8');
assert.ok(capturedPage.includes('technology.profileScope === "country"'));
assert.ok(mapPage.includes('countryProfile.rawMonths'));
console.log('PASS: 32 countries, 12 months x 24 hours (9,216 values), 12 source sheets reconciled to Excel totals.');
console.log('PASS: Italy IT-PUN, equal zone means, all 22 proxy mappings, normalization, and live build integration.');
console.log('Greece annual weighted sum preserved:', data.countries.GRC.annualWeightedSum);
