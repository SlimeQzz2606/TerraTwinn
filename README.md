# TerraTwinn frontend

Standalone Vue 3 + TypeScript + Vite UI extracted from `miuy3107/mars-analysis`,
branch `tkn`, commit `1eae045`. Scientific data and the Python backend stay on Azure.

## Local development

Node.js 22 recommended.

```bash
npm ci
cp .env.example .env.local
# Set TERRATWINN_API_URL and TERRATWINN_API_TOKEN in .env.local
npm run dev
```

The local Vite proxy adds the machine JWT to API requests, including images.

## Deploy to Vercel

1. Import `SlimeQzz2606/TerraTwinn` into Vercel.
2. Use the repository root (`.`), framework **Vite**, build `npm run build`, output `dist`.
3. Add these variables to the Production/Preview environments you deploy:
   - `TERRATWINN_API_URL`: Azure API origin, currently `http://20.41.104.183:8001`.
   - `TERRATWINN_API_TOKEN`: the issued JWT from `.env.machine-token` on Azure.
4. Deploy. After changing variables, redeploy.

Do not use the JWT signing secret from `.env.access`. Never prefix secrets with
`VITE_`: that would expose them in browser JavaScript. No token is included in
this repository. The current machine token expires after 24 hours: renew it on
Azure and update the Vercel environment variable before redeploying.

Browser requests go to `/api/...` on the Vercel HTTPS origin. A small Vercel
Function forwards read-only analog endpoints and `/api/rate/summary` to Azure
with the server-side JWT. This covers JSON, images and KML without browser
mixed-content or cross-origin requests. Prefer HTTPS on the Azure connection
too: with the current HTTP origin, the Vercel-to-Azure connection is unencrypted.
The public proxy makes these read endpoints available to website visitors;
JWT protects direct Azure access, not access by visitors to this public UI.

`/api/rate` writes, GPU/model execution, datasets and the `/rate` backend page are
not hosted here. Missing backend data is not fixed by deploying the UI.
Functions time out after 25 seconds waiting for Azure; pre-download backend data
for reliable image/report responses. Vercel Function platform payload limits
also apply, so serve very large rasters separately.

## Validation

```bash
npm run build
npm test
```
