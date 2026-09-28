# Multi-Offtake historical revenue comparison

Open `multiofftake.html` directly in a browser, or select **Multi-Offtake** from
**BESS Indexes → BESS simulations**. Import a merchant CSV, inspect its columns and units, then apply
the mapping. Germany TB4 is read from the same local `data/spot_prices.js` dataset
as the TBx dashboard; a separate daily TB4 CSV can override it. No CSV is uploaded
or stored on a server. The commercial Modo export is not bundled in the repo.

The simulations hub and both simulation pages share a browser password gate.
Unlocking lasts for the tab session; **Lock simulations** clears it. This is a
convenience gate on a public static site, not server authentication: HTML, scripts
and data remain public and the check can be bypassed. Confidential hosted content
requires authenticated hosting and private source access.

The supplied Modo export uses weekly observations in EUR/MW/year, confirmed by the
user. Defaults are seven-day periods starting on each observation date; the last
covered day can be overridden. Underlying methodology is marked unverified because
the CSV contains no methodology metadata. Date ranges, observation frequencies,
price units and asset durations are configurable.

Each component owns a separate physical tranche. A swap includes merchant revenue
on its own tranche plus a financial fixed-minus-variable settlement. Unallocated
capacity stays merchant; allocations above 100% and missing active swap references
block results. Floors settle by calendar month/year, with explicit proration for
incomplete buckets. Charts use daily accruals, not cash payment dates. Complete
calendar years alone feed annual risk metrics. Examples are illustrative prices.

Calculation code: `data/multiofftake_core.js`. Browser UI:
`data/multiofftake.js`. The regression harness is
`scripts/test_multiofftake.html`; serve the repository locally and open that page,
or run Chrome headless with `--allow-file-access-from-files --dump-dom
--virtual-time-budget=12000` against its file URL. The harness covers contracts,
unit conversion, calendar boundaries, invalid inputs, browser import and export.
