<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Globe, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { globePolygonGeometry } from '../globeGeometry'
import planetaryCatalog from '../data/planet_sites.json'
import earthResearch from '../data/earth_region_additions.json'

const BASE = import.meta.env.BASE_URL

export type PlanetKey = 'moon' | 'mars'
export type ViewMode = 'globe' | 'roi'
export type RoiLayer = 'optical' | 'slope' | 'thermal'

const currentPlanet = ref<PlanetKey>('moon')
const fullscreenPane = ref<'none' | 'left' | 'right'>('none')
const leftViewMode = ref<ViewMode>('globe')
const activeRoiLayer = ref<RoiLayer>('optical')

// Target Data
const targetInfo = ref({
  lat: 0,
  lng: 0,
  name: 'No site selected',
  meta: '',
  slope: 'n/a',
  roughness: 'n/a',
  elevationRange: 'n/a'
})

// Info Popover visibility
const showLeftInfo = ref(true)
const showRightInfo = ref(false)
const earthMatched = ref(false)
const menu = ref<'' | 'options' | 'tools' | 'export'>('')
const showRejected = ref(true)
const matchedVote = ref('')
const matchedStatus = ref('')
const statusClass = (st?: string) => (st === 'PLAUSIBLE_CANDIDATE' ? 'ok' : st === 'REJECTED' ? 'bad' : 'mid')
const statusText = (st?: string) => ({ PLAUSIBLE_CANDIDATE: 'plausible', REJECTED: 'rejected', INSUFFICIENT_EVIDENCE: 'insufficient evidence' } as Record<string, string>)[st ?? ''] ?? 'unrated'
const showHelp = ref(true)
try { showHelp.value = localStorage.getItem('tt_help_seen') !== '1' } catch { /* storage blocked: keep the hint visible */ }
function closeHelp() { showHelp.value = false; try { localStorage.setItem('tt_help_seen', '1') } catch { /* ignore */ } }
function toggleMenu(m: 'options' | 'tools' | 'export') { menu.value = menu.value === m ? '' : m }
function downloadJson() {
  const q = currentQuery()
  if (!q) return
  const blob = new Blob([JSON.stringify({ note: 'Unverified model opinions plus measurements, not geological ground truth.', run: runId.value, query: q }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `terratwinn_${q.info.query_id}.json`; a.click()
  URL.revokeObjectURL(a.href); menu.value = ''
}

// DOM refs
const leftGlobeContainer = ref<HTMLDivElement | null>(null)
const rightGlobeContainer = ref<HTMLDivElement | null>(null)

let leftGlobe: GlobeInstance | null = null
let rightGlobe: GlobeInstance | null = null
let leftResizeObserver: ResizeObserver | null = null
let rightResizeObserver: ResizeObserver | null = null

const PLANET_TEXTURES = {
  moon: {
    name: 'Moon',
    globe: `${BASE}textures/moon.jpg`,
    bump: `${BASE}textures/moon-bump.jpg`
  },
  mars: {
    name: 'Mars',
    globe: `${BASE}textures/mars.jpg`,
    bump: `${BASE}textures/mars-bump.jpg`
  },
  earth: {
    name: 'Earth',
    globe: `${BASE}textures/earth.jpg`,
    bump: `${BASE}textures/earth-topology.png`
  }
}

// Terrestrial analog match result
const matchedAnalog = ref({
  name: 'No analysis yet',
  region: '',
  lat: 0,
  lng: 0,
  matchScore: '–',
  slope: '–',
  roughness: 'n/a (not measured at 250 m)',
  geology: '–',
  environment: ''
})

// ---- Backend data (FastAPI /api/analogs). Everything shown is an unverified model opinion. ----
interface Cand { retrieval_only?: boolean; breaks_down?: string; rank: number; region: string; lat?: number; lon?: number; vote?: string; agreement?: number; status?: string;
  earth_terrain?: { slope_p90?: number; baseline_m?: number }; environment?: { lst_modis?: { lst_day_mean_c?: number }; wind_era5?: { stats?: { mean_speed_ms?: number } } };
  earth_slope_p90_deg?: number; cosine: number; reasoning?: { composite: number | null; reason: string } }
interface Query { info: { query_id: string; lat: number; lon_east: number; product?: string; slope_p90_deg?: number }; candidates: Cand[] }
const readableName = (id: string) => id.replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase())
const queries = ref<Query[]>([])
const marsRois = ref<Record<string, { source_description: string; output_grid_m: number }>>({})
const moonRois = ref<Record<string, { source_description: string; output_grid_m: number; slope?: { p90_deg: number; grid_m: number[] } }>>({})
async function loadMoonRois() {
  try {
    const response = await fetch('/api/analogs/moon-rois')
    if (response.ok) moonRois.value = (await response.json()).sites
  } catch { /* Catalog remains available without the optional ROI. */ }
}
async function loadMarsRois() {
  try {
    const response = await fetch('/api/analogs/mars-rois')
    if (response.ok) marsRois.value = (await response.json()).sites
  } catch { /* Catalog locations remain usable when ROI metadata is unavailable. */ }
}
const siteOptions = computed(() => {
  const analyzed = queries.value.map(q => ({ ...q, name: planetaryCatalog.sites.find(s => s.body === currentPlanet.value && s.id === q.info.query_id)?.name ?? readableName(q.info.query_id), analyzed: true }))
  const existing = new Set(analyzed.map(q => q.info.query_id))
  const catalog = planetaryCatalog.sites.filter(s => s.body === currentPlanet.value && !existing.has(s.id))
    .map(s => ({ info: s.query_info, candidates: [] as Cand[], name: s.name, analyzed: false }))
  return [...analyzed, ...catalog]
})
const selectedQuery = ref<string>('')
const apiStatus = ref('Loading analog results…')
const candidates = ref<Cand[]>([])
const activeCandidate = ref<Cand | null>(null)
const runId = ref('')
const searchPool = ref<'us' | 'global'>('us')
interface CatalogRegion { id: string; name: string; lat: number; lon: number; description: string; source_flag: string;
  source_line: string; coordinate_status: string; image_available: boolean; geometry: { coordinates: number[][][] } }
const catalogRegions = ref<CatalogRegion[]>([])
const catalogError = ref('')
const showCatalog = ref(false)
const catalogSearch = ref('')
const selectedCatalog = ref<CatalogRegion | null>(null)
const earthNames = new Map<string, string>([
  ...Object.entries(earthResearch.existing_matches).flatMap(([name, ids]) => ids.map(id => [id, name] as [string, string])),
  ...earthResearch.regions.map(r => [r.id, r.description.split(':')[0]!] as [string, string])
])
const catalogLabel = (r: CatalogRegion) => r.name ?? earthNames.get(r.id) ?? readableName(r.id)
const earthRegionName = (id: string) => {
  const region = catalogRegions.value.find(r => r.id === id)
  return region ? catalogLabel(region) : readableName(id)
}
const filteredCatalog = computed(() => catalogRegions.value.filter(r =>
  `${catalogLabel(r)} ${r.id.replace(/_/g, ' ')} ${r.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .includes(catalogSearch.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase())))
async function loadCatalog() {
  try {
    const response = await fetch('/api/analogs/catalog')
    if (!response.ok) throw new Error('catalog')
    catalogRegions.value = (await response.json()).regions
    drawCatalog()
  } catch { catalogError.value = 'Could not load the region catalog. Please reload to retry.' }
}
function drawCatalog() {
  rightGlobe?.labelsData(showCatalog.value ? catalogRegions.value : [])
}
function pickCatalog(r: CatalogRegion) {
  selectedCatalog.value = r
  rightGlobe?.pointOfView({ lat: r.lat, lng: r.lon, altitude: 0.12 }, 800)
  drawRegions()
}
function toggleCatalog() {
  showCatalog.value = !showCatalog.value
  if (!showCatalog.value) selectedCatalog.value = null
  drawCatalog()
  drawRegions()
}
function changePool() {
  candidates.value = []; earthMatched.value = false; showRightInfo.value = false
  rightGlobe?.pointsData([])
  useReport(currentPlanet.value)
  applyQuery(true)
}
// ---- Validation drawer (/api/analogs/validation) ----
const showValidation = ref(false)
const validation = ref<any>(null)
interface RaterStat { top5_chosen: number; n: number; top5_rate: number; binomial_p_one_sided: number }
interface RatingSummary { n_decisive?: number; n_raters?: number; top5_chosen?: number; top5_rate?: number | null; binomial_p_one_sided?: number | null;
  fleiss_kappa?: number | null; per_rater?: Record<string, RaterStat>; n_raters_above_chance?: number;
  rater_level_sign_test_p_one_sided?: number | null; pooled_note?: string }
const ratings = ref<RatingSummary | null>(null)
async function openValidation() {
  showValidation.value = true
  if (!validation.value) {
    try { validation.value = await (await fetch('/api/analogs/validation')).json() } catch { validation.value = { error: true } }
  }
  // Ratings can change while the page is open, so the summary is re-read on every open.
  try {
    const r = await fetch('/api/rate/summary')
    if (r.ok) ratings.value = await r.json()
  } catch { /* keep the copy embedded in the validation payload */ }
}
const ratingSummary = computed<RatingSummary>(() => ratings.value ?? validation.value?.ratings ?? {})
const raterRows = computed(() => Object.entries(ratingSummary.value.per_rater ?? {}).map(([name, v], k) => ({ name, label: `Rater ${k + 1}`, ...v })))
// ---- Search regions layer (GeoJSON from /api/analogs/regions) ----
interface RegionFeature { properties: { id: string; kind: string; role?: string; n_patches?: number; n_retrieved?: number; n_vegetated_dropped?: number;
  votes?: string[]; imagery?: string; center?: [number, number]; n_cells?: number; query?: string; note?: string }; geometry: { coordinates: number[][][] } }
const regionFeatures = ref<RegionFeature[]>([])
const showRegions = ref(true)
const selectedRegion = ref<RegionFeature['properties'] | null>(null)

async function loadRegions() {
  if (!runId.value) { regionFeatures.value = []; drawRegions(); return }
  try {
    regionFeatures.value = (await (await fetch(`/api/analogs/regions?run=${encodeURIComponent(runId.value)}`)).json()).features
    drawRegions()
  } catch { /* the globe still works without the overlay */ }
}

function drawRegions() {
  if (!rightGlobe) return
  const feats: any[] = showRegions.value ? [...regionFeatures.value] : []
  if (showCatalog.value && selectedCatalog.value) feats.push({ geometry: selectedCatalog.value.geometry,
    properties: { id: selectedCatalog.value.id, kind: 'catalog_roi' } })
  rightGlobe
    .polygonsData(feats)
    .polygonGeoJsonGeometry((f: any): any => globePolygonGeometry(f.geometry))
    .polygonCapColor((f: any) => {
      const k = f.properties.kind
      if (k === 'catalog_roi') return 'rgba(168,85,247,0.55)'
      if (k === 'screen_extent') return 'rgba(59,130,246,0.06)'
      if (k === 'screen_top_cell') return 'rgba(245,158,11,0.35)'
      return f.properties.n_retrieved > 0 ? 'rgba(239,68,68,0.55)' : 'rgba(16,185,129,0.45)'
    })
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor((f: any) => (f.properties.kind === 'screen_extent' ? '#3b82f6' : '#111827'))
    .polygonAltitude((f: any) => (f.properties.kind === 'screen_extent' ? 0.002 : 0.006))
    .polygonLabel((f: any) => {
      const p = f.properties
      if (p.kind === 'catalog_roi') return `${p.id} · proposed 250 m ROI`
      return p.kind === 'pool_region'
        ? `<b>${p.id}</b><br/>${p.role || ''}<br/>${p.n_patches} patches · ${p.n_retrieved} in Top-5`
        : `<b>${p.kind === 'screen_extent' ? 'Screened area (arid US Southwest)' : 'Top screening cell'}</b>`
    })
    .onPolygonClick((f: any) => { selectedRegion.value = f.properties })
}

function toggleRegions() { showRegions.value = !showRegions.value; selectedRegion.value = null; drawRegions() }
const isMars = computed(() => !!currentQuery())   // a real analog run exists for the current planet
const hasMarsRoi = computed(() => currentPlanet.value === 'mars' && !!marsRois.value[selectedQuery.value])
const hasMoonRoi = computed(() => currentPlanet.value === 'moon' && !!moonRois.value[selectedQuery.value])
const canInspectRoi = computed(() => isMars.value || hasMarsRoi.value || hasMoonRoi.value)
const queryImageUrl = computed(() => isMars.value ? imgUrl('query') : `/api/analogs/${currentPlanet.value}-rois/${encodeURIComponent(selectedQuery.value)}/image`)
const imgUrl = (name: string) => `/api/analogs/${runId.value}/img/${selectedQuery.value}_${name}.png`
const themis = computed(() => (currentQuery()?.info as any)?.thermal_inertia_themis ?? null)
const footprint = computed(() => ((currentQuery()?.info as any)?.footprint_m ?? 250))

async function loadReport() {
  try {
    const runs: { id: string }[] = await (await fetch(`/api/analogs/runs`)).json()
    const run = runs.find((r) => r.id === 'mars_judge_screen_gated_veg_div2') ?? runs.find((r) => r.id.startsWith('mars_judge') && !r.id.endsWith('_global'))
    if (run) reports.value.mars = { runId: run.id, queries: await (await fetch(`/api/analogs/${run.id}/report`)).json() }
    const moon = runs.find((r) => r.id === 'moon_judge_screen_gated_veg_div2')
    if (moon) reports.value.moon = { runId: moon.id, queries: await (await fetch(`/api/analogs/${moon.id}/report`)).json() }
    const supp = runs.find((r) => r.id === 'moon_judge_screen_gated_veg_div2_supp')
    if (supp) reports.value.moon_supp = { runId: supp.id, queries: await (await fetch(`/api/analogs/${supp.id}/report`)).json() }
    for (const planet of ['mars', 'moon']) {
      const globalRun = runs.find(r => r.id === `${planet}_judge_global`)
      if (globalRun) reports.value[`${planet}_global`] = { runId: globalRun.id,
        queries: await (await fetch(`/api/analogs/${globalRun.id}/report`)).json() }
    }
    if (reports.value.mars_global) searchPool.value = 'global'
    useReport('mars')
    if (currentPlanet.value === 'moon') switchPlanet('mars')   // default view: Mars
    else applyQuery()
  } catch (e) {
    apiStatus.value = 'Backend not reachable (start the FastAPI server)'
  }
}

const reports = ref<Record<string, { runId: string; queries: any[] }>>({})

const moonVariant = ref<'base' | 'supp'>('base')
const hasMoonSupp = computed(() => !!reports.value.moon_supp)
function setMoonVariant(v: 'base' | 'supp') { moonVariant.value = v; if (currentPlanet.value === 'moon') { useReport('moon'); applyQuery(); } }

function useReport(planet: PlanetKey) {
  const key = searchPool.value === 'global' ? `${planet}_global` : planet === 'moon' && moonVariant.value === 'supp' ? 'moon_supp' : planet
  const r = reports.value[key]
  if (!r) {
    runId.value = ''; queries.value = []; selectedQuery.value = planetaryCatalog.sites.find(s => s.body === planet)?.id ?? ''
    candidates.value = []; earthMatched.value = false; showRightInfo.value = false
    rightGlobe?.pointsData([]); leftGlobe?.customLayerData([])
    targetInfo.value = { lat: 0, lng: 0, name: 'No site selected', meta: '', slope: 'n/a', roughness: 'n/a', elevationRange: 'n/a' }
    apiStatus.value = searchPool.value === 'global' ? 'Global results pending imagery and analysis. Browse the region catalog.' : `No ${planet} analog run`
    loadRegions(); return
  }
  runId.value = r.runId
  // Terra Sirenum is hidden: its CTX query is only 50x50 px (5 m) and every candidate scored cosine 0.13-0.18 (noise). Results stay in the report files.
  const shown = r.queries.filter((q: any) => !q.info.query_id.includes('terra_sirenum'))
  queries.value = shown
  selectedQuery.value = (shown.find((q: any) => q.info.query_id === selectedQuery.value) ?? shown.find((q: any) => q.info.query_id.includes('jezero')) ?? shown[0])?.info.query_id ?? ''
  apiStatus.value = `${shown.length} ${searchPool.value === 'global' ? 'image comparisons' : 'analyzed'} · ${planetaryCatalog.sites.filter(s => s.body === planet).length} catalog sites · ${planet === 'mars' ? 'Mars' : 'Moon'}`
  loadRegions()
}

function currentQuery() { return queries.value.find((q) => q.info.query_id === selectedQuery.value) }

const ZOOM_ALTITUDE = 0.35   // close enough to see the surface texture around the site

function applyQuery(animate = false) {
  const q = siteOptions.value.find(s => s.info.query_id === selectedQuery.value)
  if (!q || !leftGlobe) return
  const measured = currentQuery()
  if (leftViewMode.value === 'roi') exitRoiMode()
  showLeftInfo.value = true
  showRightInfo.value = false
  activeCandidate.value = null
  targetInfo.value = { lat: q.info.lat, lng: q.info.lon_east, name: q.name,
    meta: measured ? measured.info.product ?? 'Analyzed ROI' : hasMarsRoi.value ? 'CTX · 250 m ROI · not analyzed yet' : hasMoonRoi.value ? 'LROC shadowed region · 10 m grid · no Top-5 results yet' : 'Catalog location — no ROI imagery or analysis yet',
    slope: measured?.info.slope_p90_deg != null ? `p90 ${measured.info.slope_p90_deg}°` : hasMoonRoi.value && moonRois.value[selectedQuery.value]?.slope ? `p90 ${moonRois.value[selectedQuery.value]!.slope!.p90_deg.toFixed(2)}° (LOLA)` : 'no DTM',
    roughness: 'n/a', elevationRange: 'n/a' }
  leftGlobe.customLayerData([{ lat: targetInfo.value.lat, lng: targetInfo.value.lng }])
  leftGlobe.pointOfView({ lat: targetInfo.value.lat, lng: targetInfo.value.lng, altitude: ZOOM_ALTITUDE }, animate === true ? 900 : 0)
  candidates.value = []
  earthMatched.value = false
  rightGlobe?.pointsData([])
}

function pickCandidate(c: Cand) {
  activeCandidate.value = c
  matchedAnalog.value = {
    name: `#${c.rank} ${earthRegionName(c.region)}`, region: c.retrieval_only ? 'Experimental Sentinel-2 image retrieval · no judge' : `Judge: ${c.vote ?? 'n/a'} (${Math.round((c.agreement ?? 0) * 100)} % agreement)`,
    lat: Number((c.lat ?? 0).toFixed(3)), lng: Number((c.lon ?? 0).toFixed(3)),
    matchScore: c.reasoning?.composite != null ? `${Math.round(c.reasoning.composite * 100)}%` : '–',
    slope: c.earth_slope_p90_deg != null ? `p90 ${c.earth_slope_p90_deg}°` : 'n/a',
    roughness: 'n/a (not measured at 250 m)',
    geology: c.reasoning?.reason ?? c.breaks_down ?? '', environment: ''
  }
  matchedVote.value = c.vote ?? ''
  matchedStatus.value = c.status ?? ''
  showRightInfo.value = true
  earthMatched.value = true
}

/**
 * Creates a vibrant RED 3D Map Pin:
 * - Red tapered needle pointing down to the surface
 * - Glowing Red sphere head on top
 * - Red circular base anchor
 */
function create3DPin(colorHex = 0xef4444) {
  const pinGroup = new THREE.Group()

  // 1. Tapered Needle / Cone (pointing down)
  const coneGeo = new THREE.ConeGeometry(1.2, 5.0, 32)
  coneGeo.rotateX(Math.PI)
  coneGeo.translate(0, 2.5, 0)
  const coneMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.3,
    roughness: 0.2
  })
  const cone = new THREE.Mesh(coneGeo, coneMat)
  pinGroup.add(cone)

  // 2. Head Sphere (bold vibrant red)
  const sphereGeo = new THREE.SphereGeometry(2.1, 32, 32)
  sphereGeo.translate(0, 5.6, 0)
  const sphereMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: 0x991b1b,
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.4
  })
  const sphere = new THREE.Mesh(sphereGeo, sphereMat)
  pinGroup.add(sphere)

  // 3. Small base disc
  const baseGeo = new THREE.CylinderGeometry(1.3, 1.3, 0.3, 32)
  baseGeo.translate(0, 0.15, 0)
  const baseMat = new THREE.MeshBasicMaterial({ color: colorHex })
  const base = new THREE.Mesh(baseGeo, baseMat)
  pinGroup.add(base)

  pinGroup.scale.set(0.25, 0.25, 0.25)
  return pinGroup
}

function initLeftGlobe() {
  if (!leftGlobeContainer.value) return

  const width = leftGlobeContainer.value.clientWidth || 600
  const height = leftGlobeContainer.value.clientHeight || 700
  const cfg = PLANET_TEXTURES[currentPlanet.value]

  leftGlobe = new Globe(leftGlobeContainer.value)
    .width(width)
    .height(height)
    .globeImageUrl(cfg.globe)
    .bumpImageUrl(cfg.bump)
    .backgroundColor('#ffffff')
    .showAtmosphere(false)
    .customLayerData([])
    .customThreeObject(() => create3DPin(0xef4444))
    .customThreeObjectUpdate((obj: any, d: any) => {
      if (!leftGlobe) return
      const coords = leftGlobe.getCoords(d.lat, d.lng, 0.005)
      if (coords) {
        Object.assign(obj.position, coords)
        const normal = new THREE.Vector3(coords.x, coords.y, coords.z).normalize()
        obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
      }
    })
    .onGlobeClick(({ lat, lng }: { lat: number; lng: number }) => {
      // Only real sites can be inspected: snap to the nearest one within 12 degrees, otherwise ignore the click.
      const rad = Math.PI / 180
      let best: (typeof siteOptions.value)[number] | null = null, bestD = 12
      for (const q of siteOptions.value) {
        const d = Math.acos(Math.min(1, Math.max(-1, Math.sin(lat * rad) * Math.sin(q.info.lat * rad) + Math.cos(lat * rad) * Math.cos(q.info.lat * rad) * Math.cos((lng - q.info.lon_east) * rad)))) / rad
        if (d < bestD) { best = q; bestD = d }
      }
      if (best) { selectedQuery.value = best.info.query_id; applyQuery(true) }
    })

  const controls = leftGlobe.controls()
  if (controls) {
    controls.autoRotate = false
    controls.enableDamping = true
    controls.dampingFactor = 0.05
  }

  // Set initial camera view
  leftGlobe.pointOfView({ lat: 0, lng: 0, altitude: 2.2 })

  leftResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (leftGlobe && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        leftGlobe.width(entry.contentRect.width)
        leftGlobe.height(entry.contentRect.height)
      }
    }
  })
  leftResizeObserver.observe(leftGlobeContainer.value)
}

function initRightGlobe() {
  if (!rightGlobeContainer.value) return

  const width = rightGlobeContainer.value.clientWidth || 600
  const height = rightGlobeContainer.value.clientHeight || 700
  const cfg = PLANET_TEXTURES.earth

  rightGlobe = new Globe(rightGlobeContainer.value)
    .width(width)
    .height(height)
    .globeImageUrl(cfg.globe)
    .bumpImageUrl(cfg.bump)
    .backgroundColor('#ffffff')
    .showAtmosphere(true)
    .atmosphereColor('#8ec5fc')
    .atmosphereAltitude(0.12)
    .pointsData([])
    .pointLat('lat')
    .pointLng('lng')
    .pointColor('color')
    .pointRadius('size')
    .pointAltitude(0.015)
    .pointLabel((d: any) => `<b>${d.name}</b><br/>Lat: ${d.lat}°, Lng: ${d.lng}°`)
    .onPointClick((d: any) => pickCandidate(d.cand))
    .labelsData([])
    .labelLat('lat')
    .labelLng('lon')
    .labelText(() => '')
    .labelDotRadius(0.4)
    .labelColor(() => '#a855f7')
    .labelAltitude(0.012)
    .onLabelClick((d: any) => pickCatalog(d))

  const controls = rightGlobe.controls()
  if (controls) {
    controls.autoRotate = false
    controls.enableDamping = true
    controls.dampingFactor = 0.05
  }

  // Focus Earth initially on Western Hemisphere
  rightGlobe.pointOfView({ lat: 20, lng: -100, altitude: 2.2 })

  rightResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (rightGlobe && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        rightGlobe.width(entry.contentRect.width)
        rightGlobe.height(entry.contentRect.height)
      }
    }
  })
  rightResizeObserver.observe(rightGlobeContainer.value)
}

function switchPlanet(planet: PlanetKey) {
  if (currentPlanet.value === planet || !leftGlobe) return
  currentPlanet.value = planet
  const cfg = PLANET_TEXTURES[planet]

  useReport(planet)
  showLeftInfo.value = true

  leftGlobe
    .globeImageUrl(cfg.globe)
    .bumpImageUrl(cfg.bump)
    .customLayerData([{ lat: targetInfo.value.lat, lng: targetInfo.value.lng }])

  if (siteOptions.value.some(s => s.info.query_id === selectedQuery.value)) applyQuery(true)
  else leftGlobe.pointOfView({ lat: 0, lng: 0, altitude: 2.2 }, 0)
}

function toggleFullscreen(pane: 'left' | 'right') {
  if (fullscreenPane.value === pane) {
    fullscreenPane.value = 'none'
  } else {
    fullscreenPane.value = pane
  }
}

function toggleLeftInfo() {
  showLeftInfo.value = !showLeftInfo.value
}

function toggleRightInfo() {
  showRightInfo.value = !showRightInfo.value
}

function enterRoiMode() {
  if (!canInspectRoi.value) return
  activeRoiLayer.value = 'optical'
  leftViewMode.value = 'roi'
  showLeftInfo.value = false
}

function exitRoiMode() {
  leftViewMode.value = 'globe'
  showLeftInfo.value = true
  if (leftGlobe && leftGlobeContainer.value) {
    leftGlobe.width(leftGlobeContainer.value.clientWidth)
    leftGlobe.height(leftGlobeContainer.value.clientHeight)
    leftGlobe.pointOfView({ lat: targetInfo.value.lat, lng: targetInfo.value.lng, altitude: ZOOM_ALTITUDE }, 0)
  }
}

function findTerrestrialAnalogs() {
  const q = currentQuery()
  if (!q) {
    apiStatus.value = 'No analog run for this planet'
    return
  }
  candidates.value = q.candidates.filter((c) => c.lat != null && c.lon != null)
  rightGlobe?.pointsData(candidates.value.filter((c) => showRejected.value || c.vote !== 'different').map((c) => ({
    lat: c.lat, lng: c.lon, size: 0.9, cand: c,
    color: c.vote === 'different' ? '#9ca3af' : '#ef4444',
    name: `#${c.rank} ${earthRegionName(c.region)} (${c.retrieval_only ? 'image retrieval only' : 'judge: ' + c.vote})`
  })))
  const top = candidates.value[0]
  if (top) {
    pickCandidate(top)
    rightGlobe?.pointOfView({ lat: top.lat, lng: top.lon, altitude: 1.6 }, 1200)
  }
}

watch(showRejected, () => { if (candidates.value.length) findTerrestrialAnalogs() })

onMounted(() => {
  initLeftGlobe()
  initRightGlobe()
  loadReport()
  loadMarsRois()
  loadMoonRois()
  loadRegions()
  loadCatalog()
})

onBeforeUnmount(() => {
  if (leftResizeObserver) leftResizeObserver.disconnect()
  if (rightResizeObserver) rightResizeObserver.disconnect()
})
</script>

<template>
  <div class="terratwinn-app">
    <!-- Top Bar: Options, Tools, TerraTwinn, Export -->
    <header class="top-bar">
      <div class="top-left">
        <div class="menu-wrap">
          <button class="menu-item-btn" :aria-expanded="menu === 'options'" @click="toggleMenu('options')">Options</button>
          <div v-if="menu === 'options'" class="menu-panel">
            <label><input type="checkbox" :checked="showRegions" @change="toggleRegions" /> Show search regions on Earth</label>
            <label><input type="checkbox" v-model="showRejected" /> Show candidates the judge rejected (grey)</label>
            <div v-if="currentPlanet === 'moon' && hasMoonSupp" class="menu-radios">
              <small>Moon run</small>
              <label><input type="radio" value="base" :checked="moonVariant === 'base'" @change="setMoonVariant('base')" /> Original pool</label>
              <label><input type="radio" value="supp" :checked="moonVariant === 'supp'" @change="setMoonVariant('supp')" /> + Cinder Lake patches (post-hoc control)</label>
            </div>
            <button class="menu-link" @click="showHelp = true; menu = ''">Show the 3-step guide</button>
          </div>
        </div>
        <div class="menu-wrap">
          <button class="menu-item-btn" :aria-expanded="menu === 'tools'" @click="toggleMenu('tools')">Tools</button>
          <div v-if="menu === 'tools'" class="menu-panel">
            <button class="menu-link" @click="openValidation(); menu = ''">Validation results</button>
            <a class="menu-link" href="/docs" target="_blank" rel="noopener">API docs</a>
          </div>
        </div>
        <button class="menu-item-btn" @click="openValidation">Validation</button>
        <select v-if="siteOptions.length" v-model="selectedQuery" class="menu-item-btn" @change="applyQuery(true)" title="Site" aria-label="Planetary site">
          <optgroup :label="searchPool === 'global' ? 'Image comparison available' : 'Analyzed ROIs'">
            <option v-for="q in siteOptions.filter(s => s.analyzed)" :key="q.info.query_id" :value="q.info.query_id">{{ q.name }}</option>
          </optgroup>
          <optgroup label="Catalog locations — analysis pending">
            <option v-for="q in siteOptions.filter(s => !s.analyzed)" :key="q.info.query_id" :value="q.info.query_id">{{ q.name }} — {{ (currentPlanet === 'mars' ? marsRois[q.info.query_id] : moonRois[q.info.query_id]) ? 'imagery available, not analyzed' : 'no imagery yet' }}</option>
          </optgroup>
        </select>
      </div>

      <div class="top-center">
        <h1 class="brand-title">TerraTwinn</h1>
        <small class="api-line" :title="'Model opinions, not geological ground truth'">{{ apiStatus }}</small>
      </div>

      <div class="top-right">
        <select v-model="searchPool" class="menu-item-btn dataset-select" aria-label="Search dataset" @change="changePool">
          <option value="global">Global · {{ catalogRegions.length }} regions</option>
          <option value="us">US · NAIP archive</option>
        </select>
        <button class="menu-item-btn" @click="toggleCatalog">Global regions ({{ catalogRegions.length }})</button>
        <button class="export-capsule-btn" :aria-expanded="menu === 'export'" @click="toggleMenu('export')">
          <span>Export</span>
          <svg class="chevron-down-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3.2 5.5a.75.75 0 0 1 1.06-.04L8 8.87l3.74-3.41a.75.75 0 1 1 1.02 1.1l-4.25 3.88a.75.75 0 0 1-1.02 0L3.24 6.56a.75.75 0 0 1-.04-1.06z"/>
          </svg>
        </button>
        <div v-if="menu === 'export'" class="menu-panel menu-panel-right">
          <button class="menu-link" :disabled="!isMars" @click="downloadJson">Download this site's report (JSON)</button>
          <a v-if="queries.length && candidates.length" class="menu-link" :href="imgUrl('top5')" :download="`${selectedQuery}_top5.png`">Download Top-5 image (PNG)</a>
        </div>
      </div>
    </header>
    <div v-if="searchPool === 'global'" class="help-strip" role="note">
      Experimental image ranking · 250 m ROI / 10 m pixels. No landing suitability assessment.
      <span v-if="!queries.length">Results are not available yet; catalog locations are proposals, not scored matches.</span>
    </div>
    <aside v-if="showCatalog" class="catalog-drawer" aria-label="Global candidate locations">
      <header><strong>Candidate regions · {{ catalogRegions.length }}</strong><button @click="toggleCatalog" aria-label="Close catalog">✕</button></header>
      <p>Imported locations, not verified test or landing sites. Purple dots show proposed ROI centers.</p>
      <a href="/api/analogs/catalog.kml" download>Download 250 m boxes (KML)</a>
      <input v-model="catalogSearch" aria-label="Search candidate regions" placeholder="Search name or terrain…" />
      <p v-if="catalogError" role="alert">{{ catalogError }}</p>
      <article v-if="selectedCatalog" class="catalog-detail">
        <strong>{{ catalogLabel(selectedCatalog) }}</strong>
        <img v-if="selectedCatalog.image_available" :src="`/api/analogs/catalog/${selectedCatalog.id}/image`"
          :alt="`Sentinel-2 ROI at ${selectedCatalog.id.replace(/_/g, ' ')}`" class="catalog-preview" />
        <small v-if="selectedCatalog.image_available">250 m ROI · 25 × 25 source pixels, enlarged for viewing</small>
        <p>{{ selectedCatalog.description }}</p>
        <p>{{ selectedCatalog.lat }}, {{ selectedCatalog.lon }} · 250 m ROI</p>
        <p>{{ selectedCatalog.source_flag }}: {{ selectedCatalog.coordinate_status === 'approximate' ? 'Approximate center' : 'Source-claimed coordinate' }}; ROI not independently verified.</p>
        <small>{{ selectedCatalog.source_line }}</small>
        <a :href="`https://earth.google.com/web/search/${selectedCatalog.lat},${selectedCatalog.lon}`" target="_blank" rel="noopener">Inspect in Google Earth</a>
      </article>
      <div class="catalog-list">
        <button v-for="r in filteredCatalog" :key="r.id" @click="pickCatalog(r)">
          <strong>{{ catalogLabel(r) }}</strong>
          <small>{{ r.description }}</small>
          <small>{{ r.source_flag }} · {{ r.image_available ? 'Imagery downloaded' : 'Imagery pending' }}</small>
        </button>
        <p v-if="!filteredCatalog.length && !catalogError">No matching locations.</p>
      </div>
    </aside>

    <div v-if="apiStatus.startsWith('Backend')" class="help-strip" style="background:#fee2e2" role="alert">{{ apiStatus }}</div>
    <!-- 3-step guide for first-time visitors -->
    <div v-if="showHelp" class="help-strip" role="note">
      <span><b>1</b> Pick a site (top menu)</span>
      <span><b>2</b> Press <i>Inspect ROI</i> to see the real image and measurements</span>
      <span><b>3</b> Press <i>Find Terrestrial Analogs</i>, then click a dot on Earth</span>
      <small>Grey dots = the judge rejected it. Scores are model opinions, not geology.</small>
      <button @click="closeHelp" aria-label="Close guide">✕</button>
    </div>

    <!-- Main Dual Viewport -->
    <main class="split-viewport">
      <!-- Left Viewport: Moon / Mars Target -->
      <section
        v-show="fullscreenPane === 'none' || fullscreenPane === 'left'"
        class="viewport-half left-half"
        :class="{ 'is-fullscreen': fullscreenPane === 'left' }"
      >
        <!-- 3D Globe Canvas Container: Permanently mounted so WebGL canvas is never destroyed -->
        <div ref="leftGlobeContainer" class="globe-canvas"></div>

        <!-- Mode 1: 3D Globe Controls Layer -->
        <div v-show="leftViewMode === 'globe'" class="globe-controls-layer">
          <!-- Left Header Controls -->
          <div class="viewport-header">
            <!-- Moon / Mars Segmented Toggle -->
            <div class="celestial-toggle">
              <button
                class="toggle-btn"
                :class="{ 'is-active': currentPlanet === 'moon' }"
                @click="switchPlanet('moon')"
              >
                Moon
              </button>
              <button
                class="toggle-btn"
                :class="{ 'is-active': currentPlanet === 'mars' }"
                @click="switchPlanet('mars')"
              >
                Mars
              </button>
            </div>
          </div>

          <!-- Bottom Left: Chat Bubble pointing directly to the 'i' button -->
          <div v-if="showLeftInfo" class="info-callout-popover">
            <div class="popover-card">
              <div class="popover-line">Long <strong>{{ targetInfo.lng }}</strong></div>
              <div class="popover-line">Lat <strong>{{ targetInfo.lat }}</strong></div>
              <div class="popover-title"><strong>{{ targetInfo.name }}</strong></div>
              <div class="popover-meta">({{ targetInfo.meta }})</div>
              <div v-if="currentPlanet === 'moon' && selectedQuery === 'shackleton_crater'" class="popover-meta">
                Crater diameter about 20.92 km · permanently shadowed floor. The 40–120 K temperature range is regional, not measured for this cell.
              </div>

              <div class="popover-divider"></div>

              <button class="inspect-roi-action-btn" :disabled="!canInspectRoi" @click="enterRoiMode">
                <span>{{ canInspectRoi ? `Inspect ${footprint} m ROI` : 'No ROI imagery / analysis yet' }}</span>
                <span class="arrow-symbol">→</span>
              </button>
            </div>
            <!-- Pointer tail pointing down to the 'i' icon below -->
            <div class="popover-pointer-down"></div>
          </div>

          <!-- Left Bottom Icons: Bold Letter 'i' & Fullscreen -->
          <button
            class="bottom-icon-btn bottom-left-icon"
            :class="{ 'is-active-btn': showLeftInfo }"
            title="Toggle Target Information"
            @click="toggleLeftInfo"
          >
            <div class="info-circle-bold">i</div>
          </button>

          <button
            class="bottom-icon-btn bottom-right-icon"
            :title="fullscreenPane === 'left' ? 'Collapse' : 'Expand'"
            @click="toggleFullscreen('left')"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
          </button>
        </div>

        <!-- Mode 2: High-Res 300m ROI Inspector Overlay -->
        <div v-if="leftViewMode === 'roi'" class="roi-inspector-container">
            <!-- ROI Top Toolbar -->
            <div class="roi-toolbar">
              <button class="back-globe-btn" @click="exitRoiMode">
                <span class="back-arrow">←</span>
                <span>Back to Globe</span>
              </button>

              <div class="roi-target-tag">
                <span class="target-badge">{{ targetInfo.name }}</span>
                <span class="coords-badge">{{ footprint }} m ROI</span>
              </div>

              <!-- Layer Switcher -->
              <div class="roi-layer-pills">
                <button
                  class="layer-pill-btn"
                  :class="{ 'is-active': activeRoiLayer === 'optical' }"
                  @click="activeRoiLayer = 'optical'"
                >
                  Optical
                </button>
                <button
                  class="layer-pill-btn"
                  :class="{ 'is-active': activeRoiLayer === 'slope' }"
                  @click="activeRoiLayer = 'slope'"
                >
                  Slope / DEM
                </button>
                <button
                  class="layer-pill-btn"
                  :class="{ 'is-active': activeRoiLayer === 'thermal' }"
                  @click="activeRoiLayer = 'thermal'"
                >
                  Thermal
                </button>
              </div>
            </div>

            <!-- Surface High-Res Map View -->
            <div class="roi-map-viewport">
              <!-- Optical Surface Texture Layer -->
              <div v-if="activeRoiLayer === 'optical' && canInspectRoi" class="roi-surface-layer">
                <img :src="queryImageUrl" alt="Planetary 250 m ROI image" style="width:100%;height:100%;object-fit:contain;background:#000" />
              </div>
              <div v-else-if="activeRoiLayer === 'optical'" class="roi-surface-layer real-evidence"><div class="real-card"><strong>No image</strong><span>No analog run for this planet.</span></div></div>

              <!-- Slope / DEM Heatmap Layer -->
              <div v-else-if="activeRoiLayer === 'slope' && isMars" class="roi-surface-layer real-evidence">
                <div class="real-card">
                  <strong>Slope</strong>
                  <span>{{ targetInfo.slope }}</span>
                  <small>{{ (currentQuery()?.info as any)?.slope_note ?? 'From the HiRISE DTM when one is loaded.' }}</small>
                </div>
              </div>
              <div v-else-if="activeRoiLayer === 'slope' && hasMoonRoi && moonRois[selectedQuery]?.slope" class="roi-surface-layer real-evidence"><div class="real-card"><strong>LOLA slope</strong><span>{{ targetInfo.slope }}</span><small>NASA LOLA slope map, 10 m grid; effective resolution may be coarser.</small></div></div>
              <div v-else-if="activeRoiLayer === 'slope'" class="roi-surface-layer real-evidence"><div class="real-card"><strong>No slope data</strong><span>No slope measurement for this site.</span></div></div>

              <!-- Thermal Layer -->
              <div v-else-if="isMars" class="roi-surface-layer real-evidence">
                <div class="real-card">
                  <strong>{{ currentPlanet === 'moon' ? 'Thermal / atmosphere' : 'THEMIS thermal inertia' }}</strong>
                  <span v-if="currentPlanet === 'moon'">Not applicable or not integrated: no wind, rain or atmosphere on the Moon; Diviner temperature is not loaded.</span>
                  <span v-else-if="themis">250 m window: {{ themis.window_250m?.mean }} · 5 km square: {{ themis.square_5km?.mean }} tiu</span>
                  <span v-else>no THEMIS value</span>
                  <small>{{ themis?.note ?? '' }} Accuracy about 20 %.</small>
                </div>
              </div>
              <div v-else class="roi-surface-layer real-evidence"><div class="real-card"><strong>No thermal data</strong><span>No analog run for this planet.</span></div></div>
            </div>

            <!-- Elevation Transect Profile Section -->
            <div class="roi-transect-section">
              <div class="transect-header">
                <div class="transect-title">
                  <strong>Measured evidence</strong>
                  <span class="transect-sub">Unverified: model opinions plus measurements</span>
                </div>
                <div class="transect-metrics">
                  <span class="metric-item">Slope: <strong>{{ targetInfo.slope }}</strong></span>
                  <span class="metric-item">Roughness: <strong>{{ targetInfo.roughness }}</strong></span>
                </div>
              </div>

              <!-- Find Analogs CTA -->
              <div class="roi-cta-bar">
                <button class="find-analogs-btn" :disabled="!isMars" @click="findTerrestrialAnalogs">
                  <span>{{ isMars ? 'Find Terrestrial Analogs' : 'No comparison results yet' }}</span>
                  <span class="arrow-symbol">→</span>
                </button>
              </div>
            </div>
          </div>
        </section>

      <!-- Right Viewport: Earth Analogs -->
      <section
        v-show="fullscreenPane === 'none' || fullscreenPane === 'right'"
        class="viewport-half right-half"
        :class="{ 'is-fullscreen': fullscreenPane === 'right' }"
      >
        <!-- Right Header Controls -->
        <div class="viewport-header justify-end">
        </div>

        <!-- 3D Globe Canvas Container -->
        <div ref="rightGlobeContainer" class="globe-canvas"></div>

        <!-- Standby or Matched Status Badge -->
        <div class="regions-panel">
          <button class="regions-toggle" :class="{ on: showRegions }" @click="toggleRegions">{{ showRegions ? 'Hide' : 'Show' }} search regions</button>
          <div v-if="showRegions" class="regions-legend">
            <span v-if="searchPool === 'us'"><i style="background:#3b82f6"></i>screened US area</span>
            <span v-if="searchPool === 'us'"><i style="background:#f59e0b"></i>top screening cell</span>
            <span><i style="background:#10b981"></i>{{ searchPool === 'global' ? '250 m candidate ROI' : 'sampled US region' }}</span>
            <span><i style="background:#ef4444"></i>region with Top-5 hits</span>
          </div>
          <div v-if="selectedRegion && selectedRegion.kind === 'pool_region'" class="region-card">
            <strong>{{ selectedRegion.id }}</strong>
            <span>{{ selectedRegion.role }}</span>
            <span>{{ selectedRegion.n_patches }} patches · {{ selectedRegion.n_retrieved }} in Top-5</span>
            <span v-if="selectedRegion.n_vegetated_dropped != null">{{ selectedRegion.n_vegetated_dropped }} dropped as vegetated</span>
            <small>{{ selectedRegion.imagery }}. {{ selectedRegion.note }}</small>
          </div>
        </div>
        <div class="earth-status-indicator">
          <span v-if="!earthMatched" class="status-pill-standby">Pick a site, then press Find analogs</span>
          <span v-else class="status-pill-matched" :class="statusClass(matchedStatus)">{{ matchedAnalog.name }} · {{ statusText(matchedStatus) }}</span>
        </div>

        <!-- Top-5 candidate cards -->
        <div v-if="candidates.length" class="cand-list" aria-label="Top-5 Earth candidates">
          <button v-for="(c, k) in candidates" :key="c.rank" class="cand-card" :class="{ sel: matchedAnalog.name.startsWith('#' + c.rank + ' ') }" @click="pickCandidate(c); rightGlobe?.pointOfView({ lat: c.lat, lng: c.lon, altitude: 1.6 }, 800)">
            <span class="cand-thumb" :style="{ backgroundImage: `url(${imgUrl('top5')})`, backgroundPosition: `${(k + 1) * 20}% 0` }"></span>
            <span class="cand-main">
              <b>#{{ c.rank }} {{ earthRegionName(c.region) }}</b>
              <span class="chip" :class="statusClass(c.status)">{{ statusText(c.status) }}</span>
              <small>cos {{ c.cosine.toFixed(2) }} · slope p90 {{ c.earth_slope_p90_deg ?? 'n/a' }}°</small>
              <small v-if="c.breaks_down" class="cand-break">{{ c.breaks_down.slice(0, 110) }}{{ c.breaks_down.length > 110 ? '…' : '' }}</small>
            </span>
          </button>
        </div>

        <!-- Bottom Left: Chat Bubble pointing directly to Earth's 'i' button -->
        <div v-if="showRightInfo" class="info-callout-popover">
          <div class="popover-card">
            <div class="popover-line">Long <strong>{{ matchedAnalog.lng }}</strong></div>
            <div class="popover-line">Lat <strong>{{ matchedAnalog.lat }}</strong></div>
            <div class="popover-title"><strong>{{ matchedAnalog.name }}</strong></div>
            <div class="popover-meta">{{ matchedAnalog.region }}</div>

            <div class="popover-divider"></div>

            <img v-if="isMars && candidates.length" :src="imgUrl('top5')" alt="Top-5 Earth candidates" style="width:100%;border-radius:6px;margin-bottom:6px" />
            <div class="analog-match-badge-wrap">
              <span class="analog-score-pill" :class="statusClass(matchedStatus)" title="Composite of image similarity, slope agreement and the judge's vote. A heuristic, not a probability of being a true analog.">{{ searchPool === 'global' ? 'Image retrieval only' : `Evidence score ${matchedAnalog.matchScore}` }}</span>
              <span v-if="matchedVote === 'different'" class="rejected-note">Judge: not the same landform</span>
            </div>

            <div class="analog-metrics-list">
              <template v-if="activeCandidate?.retrieval_only">
                <div class="metric-row"><span class="metric-lbl">Earth slope (30 m):</span><span class="metric-val">{{ activeCandidate.earth_terrain?.slope_p90 ?? 'n/a' }}° p90</span></div>
                <div class="metric-row"><span class="metric-lbl">Regional day LST:</span><span class="metric-val">{{ activeCandidate.environment?.lst_modis?.lst_day_mean_c ?? 'n/a' }} °C</span></div>
                <div class="metric-row"><span class="metric-lbl">Regional mean wind:</span><span class="metric-val">{{ activeCandidate.environment?.wind_era5?.stats?.mean_speed_ms?.toFixed(2) ?? 'n/a' }} m/s</span></div>
                <small>Historical regional context; not current weather. Slope baseline differs from the 10 m comparison.</small>
              </template>
              <div class="metric-row">
                <span class="metric-lbl">Slope:</span>
                <span class="metric-val">{{ matchedAnalog.slope }}</span>
              </div>
              <div class="metric-row">
                <span class="metric-lbl">Why retrieved:</span>
                <span class="metric-val">{{ matchedAnalog.geology }}</span>
              </div>
            </div>
          </div>
          <!-- Pointer tail pointing down to Earth's 'i' icon below -->
          <div class="popover-pointer-down"></div>
        </div>

        <!-- Right Bottom Icons: Bold Letter 'i' & Fullscreen -->
        <button
          class="bottom-icon-btn bottom-left-icon"
          :class="{ 'is-active-btn': showRightInfo }"
          title="Toggle Earth Analog Information"
          @click="toggleRightInfo"
        >
          <div class="info-circle-bold">i</div>
        </button>

        <button
          class="bottom-icon-btn bottom-right-icon"
          :title="fullscreenPane === 'right' ? 'Collapse' : 'Expand'"
          @click="toggleFullscreen('right')"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
      </section>
    </main>
    <aside v-if="showValidation" class="validation-drawer" role="dialog" aria-label="Validation and evidence">
      <header><strong>How far can you trust this? <small style="font-weight:400">(Mars run only; the Moon has no morphology or falsification tests yet)</small></strong><button @click="showValidation = false" aria-label="Close">✕</button></header>
      <p v-if="!validation" class="vmuted">Loading…</p>
      <template v-else-if="validation.error"><p class="vmuted">Validation data not available.</p></template>
      <template v-else>
        <p class="vmuted">Every match below is an unverified model opinion. Protocol fixed before results: {{ validation.protocol }}.</p>
        <h3>Evidence ladder</h3>
        <ul class="ladder">
          <li v-for="l in validation.ladder" :key="l.level" :class="l.status.replace(' ', '-')"><b>{{ l.level }} · {{ l.label }}</b> <em>{{ l.status }}</em><br /><span>{{ l.meaning }}</span></li>
        </ul>
        <h3>L1 · Model-independent measurement</h3>
        <p class="vmuted">Is the Top-5 closer to the Mars patch than random patches in classical texture, orientation and wavelength measurements? (permutation test)</p>
        <table v-if="validation.morph"><tr><th>Mars site</th><th>p</th><th>Result</th></tr>
          <tr v-for="r in validation.morph.results" :key="r.query_id"><td>{{ r.query_id.replace(/_/g, ' ') }}</td><td>{{ r.permutation_p }}</td><td>{{ r.passes_preregistered ? 'passes' : 'does not pass' }}</td></tr></table>
        <h3>Falsification tests</h3>
        <p class="vmuted">Does the Top-5 survive brightness changes and blur, and change when the image phase is scrambled?</p>
        <table v-if="validation.falsify"><tr><th>Test</th><th>Mean overlap</th><th>Result</th></tr>
          <tr><td>Brightness / contrast</td><td>{{ validation.falsify.mean_jaccard_by_group.intensity }}</td><td>{{ validation.falsify.verdict.intensity_invariant ? 'passes' : 'fails' }}</td></tr>
          <tr><td>Blur</td><td>{{ validation.falsify.mean_jaccard_by_group.blur }}</td><td>{{ validation.falsify.verdict.blur_tolerant ? 'passes' : 'fails (fragile)' }}</td></tr>
          <tr><td>Phase scramble (must change)</td><td>{{ validation.falsify.mean_jaccard_by_group.phase }}</td><td>{{ validation.falsify.verdict.not_texture_statistics_only ? 'passes' : 'fails' }}</td></tr></table>
        <h3>L3 · Blind human rating</h3>
        <template v-if="ratingSummary.n_decisive">
          <p><b>{{ ratingSummary.n_raters_above_chance ?? 'n/a' }} of {{ raterRows.length }}</b> raters chose the retrieved patch more often than chance (rater-level sign test, one-sided p = {{ ratingSummary.rater_level_sign_test_p_one_sided ?? 'n/a' }}).</p>
          <table v-if="raterRows.length"><tr><th>Rater</th><th>Chose retrieved</th><th>Rate</th><th>p (one-sided)</th></tr>
            <tr v-for="r in raterRows" :key="r.name"><td>{{ r.label }}</td><td>{{ r.top5_chosen }} / {{ r.n }}</td><td>{{ Math.round(r.top5_rate * 100) }} %</td><td>{{ r.binomial_p_one_sided }}</td></tr></table>
          <p>Pooled: {{ ratingSummary.top5_chosen }} / {{ ratingSummary.n_decisive }} choices for the retrieved patch ({{ Math.round((ratingSummary.top5_rate ?? 0) * 100) }} %), p = {{ ratingSummary.binomial_p_one_sided }}, {{ ratingSummary.n_raters }} raters, kappa {{ ratingSummary.fleiss_kappa ?? 'n/a' }}.</p>
          <p v-if="ratingSummary.pooled_note" class="vmuted">{{ ratingSummary.pooled_note }}</p>
        </template>
        <p v-else class="vmuted">No ratings yet.</p>
        <p>Blind rating is collected through the separate backend application.</p>
        <p class="vmuted">Not reached: documented analog pairs (L2) and benchmark recovery (L4). Raters are non-geologists.</p>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.catalog-drawer { position:fixed; z-index:210; top:64px; right:0; bottom:0; width:min(390px, 100%); padding:16px; background:white; color:#111; box-shadow:-4px 0 18px #0003; display:flex; flex-direction:column; gap:10px; overflow:auto; font-size:14px; }
.catalog-drawer header { display:flex; justify-content:space-between; gap:10px; }
.catalog-drawer input { padding:10px; width:100%; border:1px solid #aaa; border-radius:6px; }
.catalog-list { display:grid; gap:8px; }
.catalog-list button { display:grid; gap:4px; text-align:left; padding:10px; background:#faf5ff; border:1px solid #d8b4fe; border-radius:8px; cursor:pointer; }
.catalog-detail { display:grid; gap:8px; padding:10px; border:1px solid #a855f7; border-radius:8px; }
.catalog-detail small { overflow-wrap:anywhere; }
.catalog-preview { width:100%; max-width:250px; aspect-ratio:1; image-rendering:pixelated; align-self:center; }
.terratwinn-app {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #ffffff;
  color: #000000;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", -system-ui, "Segoe UI", Roboto, sans-serif;
}

/* Text stays selectable so it can be copied; only controls opt out. */
.terratwinn-app button {
  user-select: none;
}

/* ================== TOP BAR ================== */
.top-bar {
  height: auto;
  min-height: 58px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  column-gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 24px;
  border-bottom: 2px solid #000000;
  background: #ffffff;
  position: relative;
  z-index: 50;
}

.top-left {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 16px;
}
.top-left > select { min-width:0; max-width:200px; text-overflow:ellipsis; }
.top-bar .menu-item-btn { white-space:nowrap; font-size:16px; }

.menu-item-btn {
  background: transparent;
  border: none;
  font-size: 19px;
  font-weight: 400;
  color: #000000;
  cursor: pointer;
  padding: 4px 0;
  transition: opacity 0.15s ease;
}

.menu-item-btn:hover {
  opacity: 0.7;
}

.top-center {
  position: static;
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  text-align: center;
}

.brand-title {
  margin: 0;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #000000;
}

.top-right {
  display: flex;
  grid-column: 3;
  grid-row: 1;
  justify-content: flex-end;
  gap: 20px;
  min-width: 0;
  align-items: center;
}

.dataset-select { max-width:170px; }
.export-capsule-btn {
  background: #000000;
  color: #ffffff;
  border: none;
  border-radius: 9999px;
  padding: 8px 18px;
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.export-capsule-btn:hover {
  opacity: 0.88;
  transform: scale(0.98);
}

.chevron-down-icon {
  display: block;
}

/* ================== MAIN SPLIT VIEWPORT ================== */
.split-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  width: 100%;
  height: calc(100vh - 58px);
  position: relative;
  overflow: hidden;
  background: #ffffff;
}

.viewport-half {
  flex: 1;
  position: relative;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
}

.left-half {
  border-right: 2px solid #000000;
}

.viewport-half.is-fullscreen {
  flex: 1 1 100%;
  width: 100%;
  border-right: none;
}

/* 3D Canvas */
.globe-canvas {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

/* ================== VIEWPORT CONTROLS ================== */
.viewport-header {
  position: absolute;
  top: 18px;
  left: 20px;
  right: 20px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.viewport-header.justify-end {
  justify-content: flex-end;
}

.viewport-header > * {
  pointer-events: auto;
}

/* Moon / Mars Capsule Segmented Toggle */
.celestial-toggle {
  background: #000000;
  border-radius: 9999px;
  padding: 3px 4px;
  display: inline-flex;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.toggle-btn {
  background: transparent;
  color: #ffffff;
  border: none;
  border-radius: 9999px;
  padding: 6px 16px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.toggle-btn.is-active {
  background: #8b9bb4;
  color: #000000;
  font-weight: 600;
}

/* ================== CHAT BUBBLE POPOVER POINTING TO 'i' ================== */
.info-callout-popover {
  position: absolute;
  left: 20px;
  bottom: 64px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  animation: popoverFadeIn 0.2s ease-out;
}

@keyframes popoverFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.popover-card {
  background: #000000;
  color: #ffffff;
  padding: 14px 18px;
  border-radius: 6px;
  font-size: 13.5px;
  line-height: 1.4;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  min-width: 210px;
  max-width: 260px;
}

.popover-line {
  margin-bottom: 2px;
}

.popover-title {
  margin-top: 5px;
  font-size: 15px;
}

.popover-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
}

.popover-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 12px 0 10px 0;
}

.inspect-roi-action-btn {
  width: 100%;
  background: #ffffff;
  color: #000000;
  border: none;
  border-radius: 9999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: background 0.15s ease, transform 0.15s ease;
}

.inspect-roi-action-btn:hover {
  background: #e2e8f0;
  transform: translateY(-1px);
}

.inspect-roi-action-btn:active {
  transform: translateY(0);
}

.arrow-symbol {
  font-size: 14px;
}

/* Pointer tail pointing straight down to the 'i' button */
.popover-pointer-down {
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-top: 11px solid #000000;
  margin-left: 10px;
}

/* Analog Match details inside Earth popover */
.analog-match-badge-wrap {
  margin-bottom: 8px;
}

.analog-score-pill {
  background: #22c55e;
  color: #000000;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  letter-spacing: 0.3px;
}

.analog-metrics-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.metric-lbl {
  color: rgba(255, 255, 255, 0.7);
}

.metric-val {
  color: #ffffff;
  font-weight: 500;
}

/* ================== BOTTOM ICONS ================== */
.bottom-icon-btn {
  position: absolute;
  bottom: 20px;
  z-index: 20;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.bottom-icon-btn:hover {
  opacity: 0.7;
  transform: scale(1.08);
}

.bottom-icon-btn.is-active-btn {
  transform: scale(1.08);
}

.bottom-icon-btn.is-active-btn .info-circle-bold {
  background: #000000;
  color: #ffffff;
}

.bottom-left-icon {
  left: 20px;
}

.bottom-right-icon {
  right: 20px;
}

/* Bold letter 'i' inside circle */
.info-circle-bold {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2.6px solid #000000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Times New Roman", Georgia, serif;
  font-size: 17px;
  font-weight: 900;
  color: #000000;
  line-height: 1;
  user-select: none;
  box-sizing: border-box;
  padding-bottom: 2px;
  transition: all 0.15s ease;
}

/* ================== EARTH STANDBY STATUS PILL ================== */
.earth-status-indicator {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 20;
}

.status-pill-standby {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 6px 14px;
  border-radius: 9999px;
  letter-spacing: 0.2px;
}

.status-pill-matched {
  font-size: 12px;
  font-weight: 600;
  color: #000000;
  background: #dcfce7;
  border: 1px solid #86efac;
  padding: 6px 14px;
  border-radius: 9999px;
  letter-spacing: 0.2px;
}

.globe-controls-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 25;
}

.globe-controls-layer > * {
  pointer-events: auto;
}

/* ================== MODE 2: HIGH-RES 300M ROI INSPECTOR ================== */
.roi-inspector-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  z-index: 45;
  overflow: hidden;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.roi-toolbar {
  height: 52px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  z-index: 10;
}

.back-globe-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: #000000;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.back-globe-btn:hover {
  background: #f1f5f9;
}

.back-arrow {
  font-size: 16px;
}

.roi-target-tag {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-badge {
  font-size: 14px;
  font-weight: 700;
  color: #000000;
}

.coords-badge {
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
}

.roi-layer-pills {
  display: flex;
  background: #f1f5f9;
  border-radius: 9999px;
  padding: 2px;
  gap: 2px;
}

.layer-pill-btn {
  background: transparent;
  border: none;
  border-radius: 9999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.layer-pill-btn.is-active {
  background: #000000;
  color: #ffffff;
  font-weight: 600;
}

/* Surface Map Viewport */
.roi-map-viewport {
  flex: 1;
  position: relative;
  background: #0d0f12;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.roi-surface-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

/* Elevation Transect Profile */
.roi-transect-section {
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  padding: 12px 18px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transect-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.transect-title strong {
  font-size: 13.5px;
  color: #000000;
  display: block;
}

.transect-sub {
  font-size: 11px;
  color: #64748b;
}

.transect-metrics {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.metric-item {
  color: #64748b;
}

.metric-item strong {
  color: #000000;
}

.roi-cta-bar {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.find-analogs-btn {
  background: #000000;
  color: #ffffff;
  border: none;
  border-radius: 9999px;
  padding: 9px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.find-analogs-btn:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}

.find-analogs-btn:active {
  transform: translateY(0);
}
.real-evidence { display:flex; align-items:center; justify-content:center; background:#f8fafc; }
.real-card { display:grid; gap:6px; max-width:80%; padding:16px 20px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; text-align:center; }
.real-card span { font-size:1.1rem; font-weight:700; }
.real-card small { color:#64748b; }
/* ---- search regions overlay ---- */
.regions-panel { position:absolute; left:24px; bottom:72px; z-index:20; display:grid; gap:8px; max-width:min(320px, 60%); }
.regions-toggle { justify-self:start; border:1.5px solid #000; background:#fff; border-radius:999px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; }
.regions-toggle.on { background:#000; color:#fff; }
.regions-legend { display:grid; gap:4px; font-size:12px; background:rgba(255,255,255,.92); border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; }
.regions-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; }
.region-card { display:grid; gap:4px; font-size:12px; background:#fff; border:1.5px solid #000; border-radius:10px; padding:10px 12px; }
.region-card small { color:#64748b; }

/* ---- responsive ---- */
.top-left { min-width:0; }
.menu-radios { display:grid; gap:4px; padding:4px 0; }
.api-line { display:block; text-align:center; font-size:11px; color:#64748b; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.right-half .regions-panel { top:64px; bottom:auto; }
@media (max-width: 900px) {
  .terratwinn-app { height:auto; min-height:100vh; overflow:visible; }
  .split-viewport { flex-direction:column; height:auto; overflow:visible; }
  .viewport-half { flex:none; height:calc(100vh - 58px); min-height:460px; }
  .left-half { border-right:none; border-bottom:2px solid #000; }
  .top-bar { padding:0 12px; }
  .top-left { gap:14px; }
  .menu-item-btn { font-size:16px; }
  .regions-panel { left:12px; bottom:64px; }
  /* Phones and tablets: a vertical swipe on a globe scrolls the page, a horizontal drag still rotates it.
     OrbitControls sets touch-action:none inline on the canvas, hence !important. */
  .globe-canvas, .globe-canvas :deep(*) { touch-action:pan-y !important; }
}
@media (max-width: 560px) {
  .roi-toolbar { flex-wrap:wrap; gap:8px; height:auto; padding:8px 12px; }
  .layer-pill-btn, .back-globe-btn, .coords-badge { white-space:nowrap; }
  .top-left button.menu-item-btn { display:none; }
  .brand-title { font-size:20px; }
  .viewport-half { height:calc(100vh - 120px); min-height:420px; }
}
.validation-drawer { position:fixed; top:58px; right:0; bottom:0; width:min(430px, 100%); z-index:200; overflow:auto; background:#fff; color:#000; border-left:2px solid #000; padding:14px 18px; box-shadow:-8px 0 24px rgba(0,0,0,.12); font-size:14px; }
.validation-drawer header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:16px; }
.validation-drawer header button { border:none; background:none; font-size:18px; cursor:pointer; }
.validation-drawer h3 { margin:14px 0 4px; font-size:14px; }
.validation-drawer table { width:100%; border-collapse:collapse; margin:6px 0; }
.validation-drawer th, .validation-drawer td { text-align:left; padding:4px 6px; border-bottom:1px solid #e2e8f0; }
.vmuted { color:#64748b; margin:4px 0; }
.ladder { list-style:none; padding:0; margin:6px 0; display:grid; gap:6px; }
.ladder li { padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; }
.ladder li em { float:right; font-style:normal; font-size:12px; color:#64748b; }
.ladder li.reached { border-color:#10b981; } .ladder li.partial { border-color:#f59e0b; }

/* header menus, guide strip, honest score pills */
.menu-wrap { position: relative; display: inline-block; }
.menu-panel { position: absolute; top: calc(100% + 8px); left: 0; z-index: 60; min-width: 270px; display: grid; gap: 8px; padding: 12px 14px; background: #fff; border: 1.5px solid #000; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.15); font-size: 14px; text-align: left; }
.menu-panel label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.menu-panel-right { left: auto; right: 0; }
.menu-link { background: none; border: none; padding: 4px 0; font: inherit; color: #000; text-align: left; cursor: pointer; text-decoration: underline; }
.menu-link:disabled { opacity: .4; cursor: default; }
.top-right { position: relative; }
.help-strip { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; padding: 8px 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
.help-strip b { display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: #000; color: #fff; font-size: 11px; margin-right: 4px; }
.help-strip small { color: #64748b; }
.help-strip button { margin-left: auto; background: none; border: none; font-size: 16px; cursor: pointer; }
.status-pill-matched.rejected { background: #f1f5f9; border-color: #cbd5e1; }
.analog-score-pill.rejected { background: #cbd5e1; }
.rejected-note { margin-left: 6px; font-size: 11.5px; color: #64748b; }
@media (max-width: 1200px) {
  .top-bar { grid-template-columns:minmax(0,1fr) auto; row-gap:6px; }
  .top-center { grid-column:1 / -1; grid-row:1; justify-self:center; }
  .top-left { grid-column:1; grid-row:2; flex-wrap:wrap; }
  .top-right { grid-column:2; grid-row:2; gap:12px; }
}
@media (max-width: 900px) {
  .menu-panel { min-width: 220px; }
  .top-bar { height: auto; min-height: 0; padding: 6px 12px; row-gap: 4px; column-gap:12px; }
  .top-center { width:auto; text-align:center; }
  .top-left { flex-wrap: wrap; gap: 6px 14px; }
  .top-left button.menu-item-btn, .top-left select.menu-item-btn { display: inline-block; font-size: 15px; }
  .viewport-half { height: calc(100vh - 100px); }
}
@media (max-width:560px) {
  .top-left { grid-column:1 / -1; grid-row:2; }
  .top-right { grid-column:1 / -1; grid-row:3; justify-content:space-between; flex-wrap:wrap; }
  .top-left > select { max-width:160px; }
  .menu-panel { min-width:0; width:min(300px, calc(100vw - 24px)); }
  .menu-panel label { flex-wrap:wrap; }
  .menu-panel select { max-width:100%; }
}

.status-pill-matched.ok { background: #dcfce7; border-color: #86efac; }
.status-pill-matched.mid { background: #fef3c7; border-color: #fcd34d; }
.status-pill-matched.bad { background: #f1f5f9; border-color: #cbd5e1; }
.analog-score-pill.ok { background: #22c55e; } .analog-score-pill.mid { background: #fcd34d; } .analog-score-pill.bad { background: #cbd5e1; }
.cand-list { position: absolute; right: 12px; top: 64px; z-index: 30; width: 300px; max-height: calc(100% - 140px); overflow: auto; display: grid; gap: 6px; }
.cand-card { display: flex; gap: 8px; text-align: left; background: rgba(255,255,255,.96); border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 6px; cursor: pointer; font: inherit; color: #000; }
.cand-card.sel { border-color: #000; }
.cand-thumb { flex: none; width: 64px; height: 64px; border-radius: 6px; background-size: 600% 100%; background-repeat: no-repeat; }
.cand-main { display: grid; gap: 2px; font-size: 12px; min-width: 0; }
.cand-main small { color: #475569; } .cand-break { font-style: italic; }
.chip { display: inline-block; width: fit-content; padding: 0 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.chip.ok { background: #bbf7d0; } .chip.mid { background: #fde68a; } .chip.bad { background: #e2e8f0; }
@media (max-width: 900px) { .cand-list { position: static; width: auto; max-height: none; padding: 8px 12px; } }
</style>
