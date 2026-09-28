# Daily publication on Vercel

The existing price-update workflow builds and validates the site once. It uploads
the resulting `_site` directory for two independent deployment jobs: GitHub Pages
and Vercel production. Vercel receives the generated data, not the potentially
older data committed in Git. Its deployment URL appears in the Actions run summary.

Required repository Actions secrets:

- `VERCEL_TOKEN`: token authorized for the project's Vercel team.
- `VERCEL_ORG_ID`: that team's ID.
- `VERCEL_PROJECT_ID`: the existing energyprices project's ID.

`vercel.json` disables native Git-triggered deployments. GitHub Actions owns
publication so a separate Git deployment cannot overwrite freshly generated data.
The existing daily schedule, manual workflow dispatch and filtered main-branch
pushes remain enabled. No tokens or environment values are copied into the site.

After committing and pushing these changes, open GitHub Actions and select
**Update prices and deploy Pages + Vercel**. Verify the build and the Vercel job,
then open the URL in the run summary. A manual **Run workflow** also triggers the
complete update. Deployment credentials can only be verified by an actual run.

The current output is static (Vercel Build Output API v3). The simulations still
use the browser convenience gate. Server authentication is not implemented by
this workflow, and GitHub Pages remains public. A subsequent authentication change
must package server functions/routes and address the public Pages copy as well.
