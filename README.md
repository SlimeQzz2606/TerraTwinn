# TerraTwinn — Planetary-to-Earth Analog Explorer

Standalone Vue 3 + TypeScript + Vite UI extracted from `miuy3107/mars-analysis`,
branch `tkn-new-version`, commit `f03882f`. Scientific data and the Python backend stay on Azure.

## What the project does

TerraTwinn helps users explore Earth locations that resemble selected Moon or
Mars regions for planning analog field experiments. Users select a planetary
site or crop, inspect ranked Earth candidates, and compare imagery, terrain,
rock classes, temperature, wind and distance from their city.

This submission contains the **frontend and Vercel API proxy**. The separate
Python/FastAPI backend, scientific datasets, model weights and feature caches
run on Azure. The explanation below is included so reviewers can understand the
complete system without access to the backend repository.

- [Ranking metrics report (English PDF)](docs/TERRATWINN_METRICS_REPORT_EN.pdf)
- [Backend, data processing and scoring documentation](#backend-data-and-processing)

The PDF describes the original full-image scoring profile. The current backend
also implements cached spatial crop retrieval, an absolute lunar wind score,
and a no-location weight profile, documented below. Where these differ, the
current implementation described here takes precedence.

## Local development

Node.js 22 recommended.

```bash
npm ci
cp .env.example .env.local
# Set TERRATWINN_API_URL and TERRATWINN_API_TOKEN in .env.local
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Open http://localhost:5173. Vite hot reload applies frontend edits immediately.
If using VS Code Remote/SSH, forward port **5173** in the Ports panel.
Local API-backed interactions require a valid backend URL and machine token;
starting Vite alone does not start the scientific backend.

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
Function forwards analog read endpoints and `/api/rate/summary` to Azure
with the server-side JWT. Crop-search POST requests are also supported. This covers JSON, images and KML without browser
mixed-content or cross-origin requests. Prefer HTTPS on the Azure connection
too: with the current HTTP origin, the Vercel-to-Azure connection is unencrypted.
The public proxy makes these read endpoints available to website visitors;
JWT protects direct Azure access, not access by visitors to this public UI.

`/api/rate` writes, model execution, datasets and the `/rate` backend page are
not hosted here; crop inference executes on Azure. Missing backend data is not fixed by deploying the UI.
Read requests time out after 25 seconds waiting for Azure; pre-download backend data
for reliable image/report responses. Vercel Function platform payload limits
also apply, so serve very large rasters separately.

## Validation

```bash
npm run build
npm test
```

## tkn-new-version features

Planetary tiles (`/api/planet-tiles/...`) are proxied to Azure. Crop searches
are forwarded only to the verified Mars/Moon Colab run endpoints. Other write
endpoints remain blocked. The proxy waits at most 55 seconds for crop searches
and 25 seconds for read requests. Azure must have sufficient RAM and access to
the gated DINOv3 ViT-L SAT weights; saved report browsing does not need weights.

The f03882f crop search uses precomputed spatial features. Build the cache once on Azure with scripts/build_spatial_features.py; interactive requests do not run the encoder.


## Backend data and processing

### System architecture

```text
Browser: Vue 3 / TypeScript / globe.gl
  | same-origin /api requests
  +-- Local: Vite development proxy
  +-- Production: Vercel Function (api/proxy.mjs)
          | Authorization: Bearer <server-side machine JWT>
          v
Azure: Python / FastAPI
  +-- Saved reports and curated site/environment records
  +-- Optical images, DEMs and derived terrain products
  +-- Precomputed DINOv3 embeddings / spatial feature maps
  +-- Crop retrieval, screening, scoring and city-distance reranking
          |
          v
JSON reports, image previews, terrain/lighting evidence and KML -> frontend
```

The browser renders results; it does not run the encoder or compute the scientific
ranking. Vercel forwards the allowed requests; it does not host the Python model
or large datasets. Saved-report browsing and fresh crop searches use different
backend paths: the first loads existing evidence and can rerank it for the user;
the second searches cached spatial features for the selected footprint.

### Data sources and meaning

A nominal region of interest (ROI) is **250 × 250 m**. Regional climate and
coarse terrain products are supporting context, not measurements at this scale.

| Data | Earth | Moon | Mars |
| --- | --- | --- | --- |
| Optical imagery | Sentinel-2 harmonized surface reflectance, RGB at 10 m via Earth Engine; an older US pool uses NAIP | Moon Trek LROC NAC mosaics and identified LROC/PDS products | Catalog CTX mosaic rendered by Esri OnMars; HiRISE products for available detailed ROIs |
| Local elevation / slope | Copernicus GLO-30 DSM; Antarctic REMA 8 m, averaged for comparable ranking | Verified local LOLA polar products or LROC NAC stereo DTMs | Verified local HiRISE stereo DTMs where available |
| Coarse terrain fallback | Kept separate from local comparison | Global LOLA ~118 m, separate 10 km context | Global MOLA ~463 m, separate 10 km context |
| Surface temperature | MODIS MOD11A2.061, 1 km, 8-day day/night composites summarized over 2018–2023 | Polar Diviner products; elsewhere latitude-based estimates anchored to Diviner literature | Mars Climate Database v6.2 modelled surface temperature (`tsurf`) |
| Wind | ERA5 DAILY 10 m u/v, Jan 2015–Jul 2020; ~27.8 km regional reanalysis | 0 m/s atmospheric wind by physical convention | MCD v6.2 atmospheric wind sampled at 10 m, four seasons × four local times |
| Rock/mineral classes | Macrostrat map units and site literature | Lunar/Apollo geological literature; some catalog estimates | Mission/site literature and orbital/rover studies; some catalog estimates |
| Coordinates | Curated Earth ROI centers; city coordinates from GeoNames | Curated planetary catalog/product coordinates | Curated planetary catalog/product coordinates |

Each backend environment value retains provenance such as `map`, `literature`,
`model` or `estimated`. Some legacy ERA5 records say `measured`, although ERA5 is
reanalysis. Mars surface temperature is model output; the sampler's 10 m setting
refers to atmospheric wind, not an air-temperature replacement. Climate summaries
across bodies use different sampling and cannot be treated as identical physical
observations. Polar Diviner raster orientation remains provisional in the cached
metadata. Missing data stays explicitly unavailable.

A 250 m Sentinel-2 ROI is only about 25 native pixels across. Enlarging an image
or using a detailed inspection preview does not create information in the image
used for ranking. THEMIS thermal inertia, precipitation, surface water and
roughness can provide context; they are not additional factors in the current
five-factor composite.

### Offline preparation and online requests

1. **Acquire and catalog.** Import site coordinates; fetch optical ROIs, DEM
   windows and environmental products. Keep source URLs, product IDs, footprint,
   resolution and provenance with the cached records.
2. **Extract visual features once.** DINOv3 ViT-L/16 SAT-493M processes grayscale
   224 px images. Full-image reports use saved image embeddings/cosines. A separate
   cache stores normalized **14 × 14 × 1024** patch maps. The documented spatial
   cache build covers 133 source images (69 Earth including two iLILA extras,
   22 Mars, 42 Moon); interactive Earth retrieval uses the 67 catalog sites.
   These are cache-build counts, not a guarantee of current live catalog coverage.
3. **Derive terrain.** Use valid elevations, reject unsuitable coarse local DEMs,
   and compute common-scale slope and relief statistics. Save these independently
   from regional fallback terrain.
4. **Prepare reports.** Apply the configured eligibility gates, visual retrieval,
   environmental scoring and screening. Save components, evidence and candidates.
   Existing judge labels may filter candidates; an LLM is not a score component.
5. **Serve a request.** Return saved evidence or retrieve a new crop from feature
   caches, apply the applicable scoring profile, optionally rerank by city distance,
   apply regional diversity, and return candidates and evidence to the UI.

For a **crop search**, the backend maps the selection to exact source-pixel bounds
and ground dimensions. It area-pools query tokens using fractional overlap, slides
an equal-ground-size rectangular window over each Earth feature map, normalizes
each pooled vector, and keeps the best cosine per Earth image. The response records
the actual matching Earth window, center and dimensions. A 125 × 125 m crop in a
250 m ROI corresponds to a 7 × 7-token window and 64 positions per Earth image.

Crop requests do **not** rerun DINOv3. Missing/stale caches produce an explicit
error. Patch tokens retain their parent-image transformer context, so this is
not the same as independently encoding a resized crop. Region-level environment
is still context; parent full-ROI slope is excluded from crop scoring. Cropping
and pooling do not synthesize higher-resolution terrain or imagery.

### Terrain formulas and scale

For comparable local terrain, area-average suitable DEMs onto a centered
**240 × 240 m window, 8 × 8 cells at 30 m**, inside the nominal ROI. Accept only
suitable local products with posting no coarser than 30 m and adequate valid
coverage (the local product acceptance rule requires at least 98%). Coarse MOLA
or global LOLA fallback remains in the separate regional view and does not enter
local slope ranking.

For elevation `z(x,y)`, finite-difference slope in degrees is:

```text
slope = atan(sqrt((dz/dx)^2 + (dz/dy)^2)) × 180 / pi
slope_p90 = 90th percentile of valid slope values
range_m = max(z) - min(z)
fit a plane: z_fit = a*x + b*y + c, by least squares
roughness_m = sqrt(mean((z - z_fit)^2))
```

A tilted plane has zero plane-residual roughness. These metrics describe relief
resolved by the DEM, not individual rocks, bearing strength or vehicle safety.
Native-resolution statistics remain separate from common-grid comparisons.

### Ranking formulas

All component similarities `s_k` lie in `[0,1]`. For components with data:

```text
composite = sum(W_k * c_k * s_k) / sum(W_k * c_k)
```

Missing components are omitted from both sums, not assigned zero. Consequently,
the actual influence of a factor depends on availability and provenance.

| Factor | Base weight with city | Nominal final weight with city | Base weight without city |
| --- | ---: | ---: | ---: |
| Visual | 40% | 36.8% | 35% |
| Lithology | 20% | 18.4% | 21.6667% |
| Temperature | 15% | 13.8% | 16.25% |
| Slope | 15% | 13.8% | 16.25% |
| Wind | 10% | 9.2% | 10.8333% |
| Distance | — | 8% | — |

The final-weight column assumes all five factors are available with unit
confidence. The current setup normally requires a city. Without both user
coordinates, the backend uses the no-location profile and no distance term.
Historical reports lacking the five saved components retain their own scoring.

**Visual.** For query and candidate vectors, `cos = dot(q,v)/(norm(q)*norm(v))`.
Scale over eligible candidates for that query:
`visual = (cos - cos_min)/(cos_max - cos_min)`. If all are equal, the score is 1.
For crop retrieval, the cosine comes from the best pooled spatial window rather
than the full-image CLS embedding described in the PDF.

**Slope.** With query and Earth p90 slopes in degrees:
`tol = max(3, 0.30 * query_p90)`;
`slope_similarity = clip(1 - abs(earth_p90-query_p90)/(2*tol), 0, 1)`.
No comparable local DEM means no slope score; crop scoring excludes parent slope.

**Lithology.** Let `Q` and `E` be sets of classes and `m(a,b)` their compatibility:

```text
lithology = 0.5 * (mean over a in Q of max over b in E m(a,b)
                 + mean over b in E of max over a in Q m(a,b))
```

Identical classes get 1; unlisted pairs get 0. The symmetric compatibility table
includes clay–clastic sediment 0.5, evaporite–carbonate 0.4 and regolith–basaltic
0.3. This table is a team assumption, not a calibrated geological metric.

**Temperature.** Compute `Tmid=(Tmax+Tmin)/2` and `Trange=Tmax-Tmin` in kelvin.
For each quantity, compare candidate absolute differences from the query:
`closeness = 1 - (difference-difference_min)/(difference_max-difference_min)`.
Equal differences score 1. Temperature similarity averages available midrange
and range closeness values. A high score means closest within the eligible pool,
not that Earth reproduces planetary temperatures.

**Wind.** Mars uses the same relative-closeness rule for mean speed. The current
Moon implementation instead uses `wind_similarity = 2^(-earth_speed_ms/0.5)`:
0 m/s scores 1, 0.5 m/s scores 0.5, 1 m/s scores 0.25. This replaces the PDF's
older relative lunar comparison. It is a project screening convention; low Earth
wind does not reproduce lunar vacuum.

**Confidence.** Environmental component confidence is the product of query and
Earth provenance factors. Visual and available comparable slope use 1.

| Provenance | Factor |
| --- | ---: |
| measured / physical | 1.0 |
| map / literature | 0.9 |
| model | 0.85 |
| literature_regional | 0.7 |
| estimated / unknown | 0.5 |

**Distance.** Haversine great-circle distance uses radius `R=6371.0088 km`:

```text
a = sin²((lat2-lat1)/2) + cos(lat1)*cos(lat2)*sin²((lon2-lon1)/2)
d_km = 2*R*asin(min(1,sqrt(a)))       # angles in radians
distance_score = max(0, 1 - d_km/(pi*R))
final_score = 0.92*composite + 0.08*distance_score
```

This is straight-line surface distance, not road distance or travel cost.
Without a city, `final_score = composite` using the no-location weights above.

### Screening and interpretation

The documented full-ROI pipeline applies a vegetation threshold of 0.15,
comparable-slope eligibility where available, and at most two results per region.
The field-test screen rejects curated unsuitable sites, elevation above 3000 m,
slope p90 above 25°, and candidates already rejected by the judge. Missing values
do not become verified measurements by passing a screen. Crop-specific slope
handling is described above.

`ACCEPTED` means the candidate passes these implemented screens. It does not
certify a true geological analog, permission to access land, landing safety or
expert validation. The weights, provenance coefficients, tolerance, compatibility
table and 8% distance term are explicit team design choices, not learned from
verified analog labels. Visual and temperature scores, and Mars wind scores,
are relative to the eligible pool and can change when that pool changes.

### Backend implementation map

These paths refer to the separate backend checkout (`mars-analysis`), and are
listed for traceability; they are not files bundled with this frontend submission.

| Backend path | Responsibility |
| --- | --- |
| `terratwinn/api.py`, `auth.py` | FastAPI routes and machine-token access |
| `terratwinn/dino.py`, `spatial_features.py`, `crop_search.py` | Encoder features, cached spatial maps and crop retrieval |
| `terratwinn/env_score.py` | Components, confidence, both weight profiles and distance reranking |
| `terratwinn/terrain_metrics.py`, `ranking_terrain.py`, `roughness.py` | DEM metrics and common-scale ranking terrain |
| `terratwinn/feasibility.py` | Field-test exclusions and thresholds |
| `terratwinn/resources/site_environment.json` | Environment values and provenance |
| `terratwinn/resources/planet_measurements.json`, `earth_roughness.json` | Terrain/product metadata |
| `scripts/build_spatial_features.py` | Offline spatial cache extraction |
| `scripts/fetch_planet_measurements.py`, `enrich_terrain.py`, `refresh_global_scores.py` | Terrain acquisition, enrichment and report score refresh |

### Scientific and dataset references

- DINOv3: Siméoni et al. (2025), [arXiv:2508.10104](https://arxiv.org/abs/2508.10104); checkpoint `facebook/dinov3-vitl16-pretrain-sat493m`.
- Moon temperature: Williams et al. (2017), Icarus 283, 300–325, [doi:10.1016/j.icarus.2016.08.012](https://doi.org/10.1016/j.icarus.2016.08.012).
- Earth temperature: [MOD11A2.061](https://doi.org/10.5067/MODIS/MOD11A2.061).
- Wind reanalysis: Hersbach et al. (2020), [doi:10.1002/qj.3803](https://doi.org/10.1002/qj.3803).
- Mars climate: [Mars Climate Database, LMD](https://www-mars.lmd.jussieu.fr/), v6.2 in this project.
- Optical products: [Sentinel-2 Earth Engine collection](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), [LROC PDS](https://pds.lroc.im-ldi.com/), [HiRISE DTMs](https://hirise.lpl.arizona.edu/dtm/).
- Earth terrain: [Copernicus GLO-30](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30_2024_1), [REMA](https://developers.google.com/earth-engine/datasets/catalog/UMN_PGC_REMA_V1_1_8m).
- Lunar geology: Heiken, Vaniman & French (eds.), *Lunar Sourcebook* (1991).
- Earth geologic maps: [Macrostrat](https://macrostrat.org/).

The bundled PDF provides the original metrics narrative and illustrative example.
The current-processing notes above were checked against the separate local
backend source and data documentation on 15 November 2026; deployed results still
depend on the backend version and caches actually running on Azure.
