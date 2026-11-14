<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import type { GlobeInstance } from 'globe.gl'
import type { Object3D } from 'three'
import CandidateComparison from './CandidateComparison.vue'
import RankingExplanation from './RankingExplanation.vue'
import RoiTerrainVisual from './RoiTerrainVisual.vue'
import RoiThermalVisual from './RoiThermalVisual.vue'
import ReliefPair from './ReliefPair.vue'
import LunarLightingPanel from './LunarLightingPanel.vue'
import BaseCavePanel from './BaseCavePanel.vue'
import LandingPlanetLite from '../landing/LandingPlanetLite.vue'
import { lightingDate, type LightingPlan, type LightingSchedule } from '../lightingPlan'
import { cityForSetup, type MissionSetup } from '../missionSetup'

const props = defineProps<{ setup: MissionSetup }>()
const originCity = computed(() => cityForSetup(props.setup))

const BASE = import.meta.env.BASE_URL

export type PlanetKey = 'moon' | 'mars'
export type ViewMode = 'globe' | 'roi'
export type RoiLayer = 'optical' | 'slope' | 'thermal'

const currentPlanet = ref<PlanetKey>(props.setup.body)
const fullscreenPane = ref<'none' | 'left' | 'right'>('none')
const splitViewport = ref<HTMLElement | null>(null)
const leftPanePercent = ref(50)
const collapsedPane = ref<'none' | 'left' | 'right'>('none')
const draggingDivider = ref(false)
let dividerSnapTimer: ReturnType<typeof setTimeout> | undefined
let stopDividerDrag: (() => void) | undefined
function beginDividerDrag(event: PointerEvent) {
  if (event.button !== 0 || !splitViewport.value) return
  event.preventDefault()
  clearTimeout(dividerSnapTimer)
  const previousCollapsed = collapsedPane.value
  draggingDivider.value = true
  if (previousCollapsed !== 'none') {
    leftPanePercent.value = previousCollapsed === 'left' ? 0 : 100
    collapsedPane.value = 'none'
  }
  const move = (e: PointerEvent) => {
    const rect = splitViewport.value?.getBoundingClientRect()
    if (rect) leftPanePercent.value = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100))
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    stopDividerDrag = undefined
    draggingDivider.value = false
    const ratio = leftPanePercent.value
    if (previousCollapsed === 'left' && ratio > 0 && ratio < 20) {
      leftPanePercent.value = 20
    } else if (previousCollapsed === 'right' && ratio < 100 && ratio > 80) {
      leftPanePercent.value = 80
    } else if (ratio < 20 || ratio > 80) {
      const side = ratio < 20 ? 'left' : 'right'
      leftPanePercent.value = side === 'left' ? 0 : 100
      dividerSnapTimer = setTimeout(() => { collapsedPane.value = side }, 240)
    } else {
      leftPanePercent.value = Math.max(20, Math.min(80, ratio))
    }
  }
  stopDividerDrag = stop
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}
function restoreOnNarrowScreen() { if (window.innerWidth <= 900) { clearTimeout(dividerSnapTimer); collapsedPane.value = 'none'; leftPanePercent.value = 50 } }
function restorePaneKey(event: KeyboardEvent) {
  if ((collapsedPane.value === 'left' && event.key === 'ArrowRight') || (collapsedPane.value === 'right' && event.key === 'ArrowLeft')) {
    event.preventDefault()
    leftPanePercent.value = collapsedPane.value === 'left' ? 20 : 80
    collapsedPane.value = 'none'
  }
}
function dividerKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  leftPanePercent.value = Math.max(20, Math.min(80, leftPanePercent.value + (event.key === 'ArrowLeft' ? -5 : 5)))
}

const leftViewMode = ref<ViewMode>('globe')
const activeRoiLayer = ref<RoiLayer>('optical')
const display3D = ref(false)
const loading3D = ref(false)
let Globe!: typeof import('globe.gl').default
let THREE!: typeof import('three')
async function enable3D() {
  if (display3D.value) {
    display3D.value = false
    leftGlobe?.pauseAnimation(); rightGlobe?.pauseAnimation()
    return
  }
  loading3D.value = true
  try {
    if (!leftGlobe) {
      const [globeModule, threeModule] = await Promise.all([import('globe.gl'), import('three')])
      Globe = globeModule.default; THREE = threeModule
      display3D.value = true
      await nextTick()
      initLeftGlobe(); initRightGlobe(); refreshPlanetMarkers()
    } else {
      display3D.value = true
      await nextTick()
      leftGlobe.resumeAnimation(); rightGlobe?.resumeAnimation()
    }
    leftViewMode.value = 'globe'
    earthInspectorOpen.value = false
    if (currentQuery()) {
      leftGlobe?.customLayerData([{ lat: targetInfo.value.lat, lng: targetInfo.value.lng }])
      leftGlobe?.pointOfView({ lat: targetInfo.value.lat, lng: targetInfo.value.lng, altitude: ZOOM_ALTITUDE }, 0)
      showLeftInfo.value = true
    }
    if (selectedCandidate.value) pickCandidate(selectedCandidate.value)
  } catch {
    display3D.value = false
    apiStatus.value = '3D unavailable; image view remains available'
  } finally { loading3D.value = false }
}

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
const showLeftInfo = ref(false)
const showRightInfo = ref(false)
const earthMatched = ref(false)
const menu = ref<'' | 'options' | 'tools' | 'export'>('')
const matchedStatus = ref('')
const statusClass = (st?: string) => (st === 'ACCEPTED' || st === 'PLAUSIBLE_CANDIDATE' ? 'ok' : st === 'REJECTED' ? 'bad' : 'mid')
const statusText = (st?: string) => ({ ACCEPTED: 'Accepted', PLAUSIBLE_CANDIDATE: 'plausible', REJECTED: 'rejected', INSUFFICIENT_EVIDENCE: 'insufficient evidence' } as Record<string, string>)[st ?? ''] ?? 'unrated'
const showHelp = ref(true)
try { showHelp.value = localStorage.getItem('tt_help_seen') !== '1' } catch { /* storage blocked: keep the hint visible */ }
function closeHelp() { showHelp.value = false; try { localStorage.setItem('tt_help_seen', '1') } catch { /* ignore */ } }
function toggleMenu(m: 'options' | 'tools' | 'export') { menu.value = menu.value === m ? '' : m }
function closeMenuOnOutsideClick(event: PointerEvent) {
  const target = event.target
  if (menu.value && target instanceof Element && !target.closest(`[data-menu="${menu.value}"]`)) menu.value = ''
}
function downloadJson() {
  const q = currentQuery()
  if (!q) return
  const blob = new Blob([JSON.stringify({ note: 'Unverified model opinions plus measurements, not geological ground truth.', run: runId.value, setup: { ...props.setup, origin: originCity.value }, query: q }, null, 1)], { type: 'application/json' })
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
    globe: `${BASE}textures/moon-preview.jpg`,
    bump: `${BASE}textures/moon-bump.jpg`
  },
  mars: {
    name: 'Mars',
    globe: `${BASE}textures/mars-preview.jpg`,
    bump: `${BASE}textures/mars-bump.jpg`
  },
  earth: {
    name: 'Earth',
    globe: `${BASE}textures/earth-preview.jpg`,
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
interface TerrainStats {
  slope_p90_deg: number; slope_mean_deg: number; elevation_range_m: number; roughness_rms_m: number;
  posting_m: number; baseline_m: number; sampled_width_m: number; valid_fraction: number; n_valid: number;
  source: string; source_url: string; provenance?: string; note?: string;
}
interface Cand { breaks_down?: string; rank: number; region: string; region_name?: string; admin1?: string; country?: string; field_test?: { decision: string; reasons: string[] }; lat?: number; lon?: number; vote?: string; agreement?: number; status?: string;
  lighting?: LightingSchedule;
  earth_slope_p90_deg?: number; cosine: number | null; reasoning?: { composite: number | null; reason: string };
  optical_context?: { image_url: string; source: string; gsd_m: number; footprint_m: number };
  ilila?: { c_min_m: number; fault_km?: number | null; route_total_m?: number; geometry_note: string; station: { net?: string; sta?: string; km?: number }; seismic: { db_above_nlnm?: number; segments?: number; measurement_scope?: string }; context_validation?: { nasadem?: { geometry_ok?: boolean; robust_ok?: boolean; c_min_m?: number }; worldcover?: { vegetated_class_fraction?: number; tree_class_fraction?: number }; sentinel2_vegetation?: { green_fraction?: number; valid_fraction?: number; screen_ok?: boolean } } };
  validation_assessment?: string;
  composite?: number; final_score?: number; image?: string; image_url?: string;
  score_missing_policy?: string;
  distance_km?: number | null; roughness?: { native_metrics?: TerrainStats; comparison?: TerrainStats; available: boolean; roughness_rms_m: number; posting_m: number; sampled_width_m: number; source: string; source_url: string };
  earth_terrain?: { slope_p90?: number; baseline_m?: number };
  score_components?: Record<string, { value: number | null; weight: number; confidence: number }> }
interface Query { info: { query_id: string; name?: string; lat: number; lon_east: number; product?: string; slope_p90_deg?: number; image_available?: boolean; image_note?: string }; candidates: Cand[] }
const queries = ref<Query[]>([])
const selectedQuery = ref<string>('')
const siteSearch = ref('')
const siteSearchInput = ref<HTMLInputElement | null>(null)
const searchOpen = ref(false)
const prettyName = (id: string) => id.replace(/_/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase())
const queryName = (q: Query) => q.info.name ?? prettyName(q.info.query_id)
const candidateName = (c: Cand) => c.region_name ?? prettyName(c.region)
const candidateLocation = (c: Cand) => [c.admin1, c.country].filter(Boolean).join(', ') || 'Location details unavailable'
interface PlanetMarker { id: string; name: string; lat: number; lng: number }
const markerCatalog = ref<Record<PlanetKey, PlanetMarker[]>>({ moon: [], mars: [] })
const markerSamples: Partial<Record<PlanetKey, PlanetMarker[]>> = {}
function refreshPlanetMarkers() {
  if (!leftGlobe) return
  const body = currentPlanet.value
  if (!markerSamples[body]) {
    const all = new Map(markerCatalog.value[body].map(s => [s.id, s]))
    for (const q of queries.value) {
      if (!all.has(q.info.query_id)) all.set(q.info.query_id, { id: q.info.query_id, name: queryName(q), lat: q.info.lat, lng: q.info.lon_east })
    }
    markerSamples[body] = [...all.values()].filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
  }
  const sample = [...markerSamples[body]!]
  const selected = currentQuery()
  if (selected && !sample.some(s => s.id === selected.info.query_id)) {
    sample.push({ id: selected.info.query_id, name: queryName(selected), lat: selected.info.lat, lng: selected.info.lon_east })
  }
  leftGlobe.labelsData(sample)
}
async function loadMarkerCatalog() {
  try {
    const response = await fetch('/api/analogs/planet-sites')
    if (!response.ok) return
    const data = await response.json()
    for (const body of ['moon', 'mars'] as const) {
      markerCatalog.value[body] = (data[body] ?? []).map((s: any) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lon_east }))
      delete markerSamples[body]
    }
    refreshPlanetMarkers()
  } catch { /* The existing report locations remain available when the catalog cannot load. */ }
}
const filteredSites = computed(() => {
  const text = siteSearch.value.toLowerCase().trim()
  const current = queries.value.find(q => q.info.query_id === selectedQuery.value)
  if (!text || (current && text === queryName(current).toLowerCase())) return queries.value
  return queries.value.filter(q => `${queryName(q)} ${q.info.query_id.replace(/_/g, ' ')}`.toLowerCase().includes(text))
})
function closeSiteSearch(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) searchOpen.value = false }
function chooseSite(q: Query) {
  selectedQuery.value = q.info.query_id
  siteSearch.value = queryName(q)
  searchOpen.value = false
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.site-search')) document.activeElement.blur()
  applyQuery(true)
}
function clearSiteSearch() {
  siteSearch.value = ''
  searchOpen.value = true
  siteSearchInput.value?.focus()
}
const apiStatus = ref('Loading analog results…')
const candidates = ref<Cand[]>([])
const resultsRequested = ref(false)
const selectedCandidateIndex = computed(() => candidates.value.findIndex(c => matchedAnalog.value.name === `#${c.rank} ${candidateName(c)}`))
const resultsHidden = ref(false)
const earthInspectorOpen = ref(false)
const earthInspectorTab = ref<'overview' | 'compare' | 'lighting' | 'terrain' | 'sources'>('overview')
const selectedCandidate = computed(() => candidates.value[selectedCandidateIndex.value])
const isLunarLanding = computed(() => currentPlanet.value === 'moon' && props.setup.mission === 'crewed_lander')
const isBaseMission = computed(() => props.setup.mission === 'surface_base')
const showCaveRecommendations = ref(false)
watch([selectedQuery, currentPlanet], () => { showCaveRecommendations.value = false })
const lightingPlan = ref<LightingPlan | null>(null)
const lightingBusy = ref(false)
const lightingError = ref('')
const lunarReferenceTime = ref('')
const earthSearchStart = ref(new Date().toISOString().slice(0,10))
const showLightingControls = ref(false)
let lightingRequest = 0
watch([selectedQuery, currentPlanet], () => { lightingRequest++; lightingBusy.value = false; lightingPlan.value = null; lightingError.value = ''; lunarReferenceTime.value = ''; showLightingControls.value = false })
async function searchLighting(value = { lunarTime: lunarReferenceTime.value, startDate: earthSearchStart.value }) {
  const q = currentQuery()
  if (!q || !isLunarLanding.value) return
  const request = ++lightingRequest
  lightingBusy.value = true; lightingError.value = ''; resultsRequested.value = true
  candidates.value = []; earthMatched.value = false; showRightInfo.value = false
  rightGlobe?.customLayerData([])
  earthSearchStart.value = value.startDate
  const params = new URLSearchParams({ query_id: q.info.query_id, start_date: value.startDate, user_lat: String(originCity.value.lat), user_lon: String(originCity.value.lon) })
  if (value.lunarTime) params.set('lunar_time', value.lunarTime.slice(0,16) + ':00Z')
  try {
    const response = await fetch('/api/analogs/lighting/plan?' + params)
    const data = await response.json()
    if (request !== lightingRequest) return
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Lighting planning failed')
    lightingPlan.value = data
    lunarReferenceTime.value = data.target.time_utc.slice(0,16)
    candidates.value = data.candidates.filter((c: Cand) => c.field_test?.decision === 'ACCEPTED' && c.lighting?.windows.length)
  } catch (error) {
    if (request === lightingRequest) lightingError.value = error instanceof Error ? error.message : 'Lighting planning failed'
  } finally { if (request === lightingRequest) lightingBusy.value = false }
}
function openEarthInspector() { if (selectedCandidate.value) { earthInspectorTab.value = 'overview'; earthInspectorOpen.value = true } }
function closeEarthInspector() { earthInspectorOpen.value = false }
watch([selectedQuery, currentPlanet], () => { earthInspectorOpen.value = false })
const runId = ref('')
const isIlilaRun = computed(() => runId.value.startsWith('moon_judge_ilila_'))
const availableRuns = ref<{ id: string; label?: string }[]>([])
const planetRuns = computed(() => availableRuns.value.filter(r => r.id.startsWith(currentPlanet.value + '_judge') && !r.id.endsWith('_source')))
async function selectRun(id: string) {
  const response = await fetch(reportUrl(id))
  if (!response.ok) { apiStatus.value = 'Could not load the selected run'; return }
  reports.value[currentPlanet.value] = { runId: id, queries: await response.json() }
  moonVariant.value = 'base'
  delete markerSamples[currentPlanet.value]
  useReport(currentPlanet.value)
}
// ---- Validation drawer (/api/analogs/validation) ----
const showValidation = ref(false)
const validation = ref<any>(null)
interface RaterStat { top5_chosen: number; n: number; top5_rate: number; binomial_p_one_sided: number }
interface RatingSummary { n_decisive?: number; n_raters?: number; top5_chosen?: number; top5_rate?: number | null; binomial_p_one_sided?: number | null;
  fleiss_kappa?: number | null; per_rater?: Record<string, RaterStat>; n_raters_above_chance?: number;
  rater_level_sign_test_p_one_sided?: number | null; pooled_note?: string }
const ratings = ref<RatingSummary | null>(null)
const ratingSummary = computed<RatingSummary>(() => ratings.value ?? validation.value?.ratings ?? {})
const raterRows = computed(() => Object.entries(ratingSummary.value.per_rater ?? {}).map(([name, v], k) => ({ name, label: `Rater ${k + 1}`, ...v })))
const isMars = computed(() => !!currentQuery())   // a real analog run exists for the current planet
const imgUrl = (name: string) => `/api/analogs/${runId.value}/img/${selectedQuery.value}_${name}.png`
const rankingScore = (c: Cand) => c.final_score ?? c.composite
const scoreText = (c: Cand) => rankingScore(c) != null ? `${(rankingScore(c)! * 100).toFixed(1)}/100` : null
const candidateStyle = (c: Cand, index: number) => {
  const image = c.image_url ?? (c.image ? `/api/analogs/${runId.value}/img/${c.image}` : null)
  return image ? { backgroundImage: `url(${image})`, backgroundPosition: 'center', backgroundSize: isIlilaRun.value ? 'contain' : 'cover' }
    : { backgroundImage: `url(${imgUrl('top5')})`, backgroundPosition: `${(index + 1) * 20}% 0` }
}
const candidateSlope = (c: Cand) => c.earth_slope_p90_deg ?? c.earth_terrain?.slope_p90
const componentNames: Record<string, string> = { visual: 'Image', lithology: 'Rock / mineral', temperature: 'Temperature', slope: 'Slope p90', wind: 'Mean wind', geometry: 'iLILA geometry', seismic: 'Seismic noise (Earth NLNM/NHNM reference)', thermal: 'Thermal cycling', anchoring: 'Anchoring', anthropogenic: 'Human noise' }
const reportUrl = (id: string) => `/api/analogs/${id}/report?` + new URLSearchParams({
  user_lat: String(originCity.value.lat), user_lon: String(originCity.value.lon), mission_type: props.setup.mission,
})
const themis = computed(() => (currentQuery()?.info as any)?.thermal_inertia_themis ?? null)
const measurements = computed(() => (currentQuery()?.info as any)?.measurements ?? null)
const terrainMeasurement = computed(() => measurements.value?.terrain?.available ? measurements.value.terrain : null)
const regionalTerrain = computed<TerrainStats | null>(() => measurements.value?.regional_terrain?.n_valid ? measurements.value.regional_terrain : null)
const terrainScale = ref<'common' | 'native'>('common')
const planetaryTerrainStats = computed<TerrainStats | null>(() => {
  const terrain = terrainMeasurement.value
  return (terrainScale.value === 'common' ? terrain?.comparison : terrain?.native_metrics) ?? null
})
const earthTerrainStats = computed<TerrainStats | null>(() => {
  const terrain = selectedCandidate.value?.roughness
  return (terrainScale.value === 'common' ? terrain?.comparison : terrain?.native_metrics) ?? null
})
const terrainRows = [
  {key:'slope_p90_deg', label:'Slope p90', unit:'°', detail:'90% of DEM slopes fall below this value.'},
  {key:'slope_mean_deg', label:'Mean slope', unit:'°', detail:'Average slope of the sampled terrain.'},
  {key:'elevation_range_m', label:'Elevation range', unit:'m', detail:'Highest minus lowest valid elevation.'},
  {key:'roughness_rms_m', label:'DEM roughness', unit:'m RMS', detail:'RMS height residual after removing a fitted plane.'},
] as const
const terrainValue = (data: TerrainStats | null, key: typeof terrainRows[number]['key'], unit: string) => {
  const value = data?.[key]
  return value != null && Number.isFinite(value) ? `${value.toFixed(2)} ${unit}` : 'No suitable DEM'
}
const terrainDifference = (key: typeof terrainRows[number]['key'], unit: string) => {
  const a=planetaryTerrainStats.value?.[key], b=earthTerrainStats.value?.[key]
  return a != null && b != null ? `${Math.abs(a-b).toFixed(2)} ${unit}` : '—'
}
const thermalInertia = computed(() => measurements.value?.thermal_inertia ?? themis.value)
const temperatureContext = computed(() => measurements.value?.temperature_context ?? null)
const earthThermalRows = computed(() => (candidates.value as any[]).slice(0, 5).flatMap(c => {
  const m = c.environment?.lst_modis
  return m?.lst_day_mean_c != null && m?.lst_night_mean_c != null ? [{ name: `#${c.rank} ${c.region_name ?? c.region}`, night: m.lst_night_mean_c, day: m.lst_day_mean_c }] : []
}))
const footprint = computed(() => ((currentQuery()?.info as any)?.footprint_m ?? 250))

async function reportJson(url: string) {
  const response = await fetch(url)
  if (response.status === 401) throw new Error('Backend authentication failed (401). Update the server-side API token and redeploy.')
  if (response.status === 503) throw new Error('Backend connection is not configured or a required service is unavailable (503).')
  if (!response.ok) throw new Error(`Backend request failed (HTTP ${response.status}).`)
  return response.json()
}

async function loadReport() {
  try {
    const runs: { id: string; label?: string }[] = await reportJson('/api/analogs/runs')
    availableRuns.value = runs
    const pick = (...ids: string[]) => ids.map(id => runs.find(r => r.id === id)).find(Boolean)
    const body = currentPlanet.value
    const run = body === 'mars'
      ? pick('mars_judge_colab_env_global', 'mars_judge_env_global', 'mars_judge_screen_gated_veg_div2_env', 'mars_judge_global', 'mars_judge_screen_gated_veg_div2')
      : pick('moon_judge_colab_env_global', 'moon_judge_env_global', 'moon_judge_screen_gated_veg_div2_env', 'moon_judge_global', 'moon_judge_screen_gated_veg_div2')
    if (!run) { apiStatus.value = 'No analog run found'; return }
    reports.value[body] = { runId: run.id, queries: await reportJson(reportUrl(run.id)) }
    useReport(body)
  } catch (e) {
    apiStatus.value = e instanceof Error ? e.message : 'Backend request failed.'
  }
}

const reports = ref<Record<string, { runId: string; queries: any[] }>>({})
// Presentation scope: the four curated Moon/Mars sites. Add ?dev=1 to the address to see every site and the run picker.
const devMode = new URLSearchParams(location.search).has('dev')
const DEMO_SITES: Record<string, string[]> = {
  moon: ['change7_shackleton_ridge', 'artemis_mons_mouton_plateau'],
  mars: ['exomars_backup_mawrth', 'starship_phlegra_montes'],
}

const moonVariant = ref<'base' | 'supp'>('base')

function useReport(planet: PlanetKey) {
  const r = reports.value[planet === 'moon' && moonVariant.value === 'supp' ? 'moon_supp' : planet]
  if (!r) { runId.value = ''; queries.value = []; selectedQuery.value = ''; apiStatus.value = `No ${planet} analog run`; return }
  runId.value = r.runId
  // Terra Sirenum is hidden: its CTX query is only 50x50 px (5 m) and every candidate scored cosine 0.13-0.18 (noise). Results stay in the report files.
  let shown = r.queries.filter((q: any) => !q.info.query_id.includes('terra_sirenum'))
  const demo = shown.filter((q: any) => (DEMO_SITES[planet] ?? []).includes(q.info.query_id))
  if (!devMode && demo.length) shown = demo
  queries.value = shown
  selectedQuery.value = ''
  siteSearch.value = ''
  refreshPlanetMarkers()
  candidates.value = []
  earthMatched.value = false
  rightGlobe?.customLayerData([])
  const usable = shown.filter(q => q.info.image_available !== false).length
  apiStatus.value = `${shown.length} ${planet === 'mars' ? 'Mars' : 'Moon'} sites · ${usable} with images · run ${r.runId}`
  const initial = shown.find(q => q.info.image_available !== false) ?? shown[0]
  if (initial) chooseSite(initial)
}

function currentQuery() { return queries.value.find((q) => q.info.query_id === selectedQuery.value) }
const queryHasImage = computed(() => currentQuery()?.info.image_available !== false)

const ZOOM_ALTITUDE = 0.35   // close enough to see the surface texture around the site

function applyQuery(animate = false) {
  resultsRequested.value = false
  const q = currentQuery()
  if (!q) return
  showLeftInfo.value = true
  targetInfo.value = { lat: q.info.lat, lng: q.info.lon_east, name: queryName(q),
    meta: q.info.product ?? (q.info.image_available === false ? 'Optical imagery unavailable' : 'Product not provided'), slope: q.info.slope_p90_deg != null ? `p90 ${q.info.slope_p90_deg}°` : 'no DTM',
    roughness: 'Not available: no suitable DEM', elevationRange: 'n/a' }
  const terrain = (q.info as any).measurements?.terrain
  if (terrain?.available) {
    targetInfo.value.slope = `p90 ${terrain.slope_p90_deg.toFixed(2)}°`
    targetInfo.value.roughness = terrain.roughness_rms_m != null ? `${terrain.roughness_rms_m.toFixed(2)} m RMS (${Number(terrain.posting_m.toFixed(2))} m grid)` : 'Not available: no verified DEM roughness'
    targetInfo.value.elevationRange = `${terrain.elevation_range_m.toFixed(1)} m`
  }
  leftGlobe?.customLayerData([{ lat: targetInfo.value.lat, lng: targetInfo.value.lng }])
  refreshPlanetMarkers()
  leftGlobe?.pointOfView({ lat: targetInfo.value.lat, lng: targetInfo.value.lng, altitude: ZOOM_ALTITUDE }, animate === true ? 900 : 0)
  candidates.value = []
  earthMatched.value = false
  rightGlobe?.customLayerData([])
}

function pickCandidate(c: Cand) {
  if (c.lat == null || c.lon == null) return
  rightGlobe?.customLayerData([{ lat: c.lat, lng: c.lon, name: `#${c.rank} ${candidateName(c)}` }])
  rightGlobe?.pointOfView({ lat: c.lat, lng: c.lon, altitude: 0.15 }, 1000)
  matchedAnalog.value = {
    name: `#${c.rank} ${candidateName(c)}`, region: 'Passed the field-test screen',
    lat: c.lat, lng: c.lon,
    matchScore: scoreText(c) ?? (c.reasoning?.composite != null ? `${Math.round(c.reasoning.composite * 100)}%` : '–'),
    slope: candidateSlope(c) != null ? `p90 ${candidateSlope(c)!.toFixed(2)}°` : 'n/a',
    roughness: c.roughness?.available ? `${c.roughness.roughness_rms_m.toFixed(2)} m RMS (${c.roughness.posting_m} m grid)` : 'Not available: no suitable DEM',
    geology: c.reasoning?.reason ?? '', environment: ''
  }
  matchedStatus.value = c.field_test?.decision ?? 'REJECTED'
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

  leftGlobe = new Globe(leftGlobeContainer.value, { rendererConfig: { antialias: false, powerPreference: 'low-power' } })
    .width(width)
    .height(height)
    .globeImageUrl(cfg.globe)
    .globeCurvatureResolution(8)
    .backgroundColor('#ffffff')
    .showAtmosphere(false)
    .labelsData([])
    .labelLat('lat')
    .labelLng('lng')
    .labelText('name')
    .labelColor(() => '#ffcf4d')
    .labelSize(2.2)
    .labelDotRadius(0.42)
    .labelDotOrientation('top')
    .labelAltitude(0.008)
    .labelResolution(3)
    .onLabelClick((label: object) => {
      const q = queries.value.find(q => q.info.query_id === (label as PlanetMarker).id)
      if (q) chooseSite(q)
    })
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
      let best: Query | null = null, bestD = 12
      for (const q of queries.value) {
        const d = Math.acos(Math.min(1, Math.max(-1, Math.sin(lat * rad) * Math.sin(q.info.lat * rad) + Math.cos(lat * rad) * Math.cos(q.info.lat * rad) * Math.cos((lng - q.info.lon_east) * rad)))) / rad
        if (d < bestD) { best = q; bestD = d }
      }
      if (best) chooseSite(best)
    })

  const controls = leftGlobe.controls()
  if (controls) {
    controls.autoRotate = false
    controls.enableDamping = false
    controls.dampingFactor = 0.05
  }

  // Set initial camera view
  leftGlobe.pointOfView({ lat: 0, lng: 0, altitude: 2.2 })
  leftGlobe.renderer().setPixelRatio(0.6)

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

  rightGlobe = new Globe(rightGlobeContainer.value, { rendererConfig: { antialias: false, powerPreference: 'low-power' } })
    .width(width)
    .height(height)
    .globeImageUrl(cfg.globe)
    .globeCurvatureResolution(8)
    .backgroundColor('#ffffff')
    .showAtmosphere(false)
    .atmosphereColor('#8ec5fc')
    .atmosphereAltitude(0.12)
    .customLayerData([])
    .customThreeObject(() => {
      const pin = create3DPin(0xef4444)
      pin.scale.setScalar(0.055)
      return pin
    })
    .customThreeObjectUpdate((obj: Object3D, d: any) => {
      if (!rightGlobe) return
      const coords = rightGlobe.getCoords(d.lat, d.lng, 0.0001)
      if (coords) {
        Object.assign(obj.position, coords)
        const normal = new THREE.Vector3(coords.x, coords.y, coords.z).normalize()
        obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
      }
    })

  const controls = rightGlobe.controls()
  if (controls) {
    controls.autoRotate = false
    controls.enableDamping = false
    controls.dampingFactor = 0.05
  }

  // Focus Earth initially on Western Hemisphere
  rightGlobe.pointOfView({ lat: 20, lng: -100, altitude: 2.2 })
  rightGlobe.renderer().setPixelRatio(0.6)

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

function restoreSplitView() {
  clearTimeout(dividerSnapTimer)
  fullscreenPane.value = 'none'
  collapsedPane.value = 'none'
  leftPanePercent.value = 50
}
function toggleFullscreen(pane: 'left' | 'right') {
  clearTimeout(dividerSnapTimer)
  if (window.innerWidth <= 900) {
    collapsedPane.value = 'none'
    fullscreenPane.value = pane
  } else {
    fullscreenPane.value = 'none'
    collapsedPane.value = pane === 'left' ? 'right' : 'left'
    leftPanePercent.value = pane === 'left' ? 100 : 0
  }
}

function toggleLeftInfo() {
  showLeftInfo.value = !showLeftInfo.value
}

function toggleRightInfo() {
  showRightInfo.value = !showRightInfo.value
}

const cropFrame = ref<HTMLElement | null>(null)
const crop = ref({ x: 25, y: 25, width: 50, height: 50 })
let cropDrag: { mode: string; x: number; y: number; start: typeof crop.value; width: number; height: number } | null = null
const cropDimensions = computed(() => ({ width: Math.round(crop.value.width * footprint.value / 100), height: Math.round(crop.value.height * footprint.value / 100) }))
const cropDialog = ref<HTMLDialogElement | null>(null)
const dimensionWidth = ref('')
const dimensionHeight = ref('')
const dimensionError = ref('')
function openCropDimensions() {
  cropDrag = null
  dimensionWidth.value = String(cropDimensions.value.width)
  dimensionHeight.value = String(cropDimensions.value.height)
  dimensionError.value = ''
  cropDialog.value?.show()
}
function parseMetres(text: string) {
  const match = text.trim().match(/^(\d+(?:[.,]\d+)?|[.,]\d+)\s*(?:m|metres?|meters?)?$/i)
  return match ? Number(match[1]!.replace(',', '.')) : NaN
}
function saveCropDimensions() {
  const w = parseMetres(dimensionWidth.value), h = parseMetres(dimensionHeight.value)
  const max = Math.min(250, footprint.value)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 50 || h < 50 || w > max || h > max) {
    dimensionError.value = 'Value must be between 50 and 250'
    return
  }
  const width = w / footprint.value * 100, height = h / footprint.value * 100
  crop.value = { x: Math.min(crop.value.x, 100 - width), y: Math.min(crop.value.y, 100 - height), width, height }
  cropDialog.value?.close()
}

function startCrop(event: PointerEvent, mode: string) {
  const rect = cropFrame.value?.getBoundingClientRect()
  if (!rect) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  cropDrag = { mode, x: event.clientX, y: event.clientY, start: { ...crop.value }, width: rect.width, height: rect.height }
}
function moveCrop(event: PointerEvent) {
  if (!cropDrag) return
  const { mode, x, y, start, width, height } = cropDrag
  const dx = (event.clientX - x) / width * 100, dy = (event.clientY - y) / height * 100
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
  if (mode === 'move') {
    crop.value = { ...start, x: clamp(start.x + dx, 0, 100 - start.width), y: clamp(start.y + dy, 0, 100 - start.height) }
    return
  }
  const maxSize = Math.min(100, 250 / footprint.value * 100), minSize = Math.min(5, maxSize)
  if (event.shiftKey) {
    const anchorX = mode.includes('w') ? start.x + start.width : start.x
    const anchorY = mode.includes('n') ? start.y + start.height : start.y
    const desiredWidth = start.width + (mode.includes('w') ? -dx : dx)
    const desiredHeight = start.height + (mode.includes('n') ? -dy : dy)
    const scale = Math.abs(desiredWidth / start.width - 1) >= Math.abs(desiredHeight / start.height - 1) ? desiredWidth / start.width : desiredHeight / start.height
    const maxWidth = Math.min(maxSize, mode.includes('w') ? anchorX : 100 - anchorX)
    const maxHeight = Math.min(maxSize, mode.includes('n') ? anchorY : 100 - anchorY)
    const bounded = clamp(scale, Math.min(minSize / start.width, minSize / start.height), Math.min(maxWidth / start.width, maxHeight / start.height))
    const w = start.width * bounded, h = start.height * bounded
    crop.value = { x: mode.includes('w') ? anchorX - w : anchorX, y: mode.includes('n') ? anchorY - h : anchorY, width: w, height: h }
    return
  }
  let left = start.x, top = start.y, right = start.x + start.width, bottom = start.y + start.height
  if (mode.includes('w')) left = clamp(start.x + dx, Math.max(0, right - maxSize), right - minSize)
  if (mode.includes('e')) right = clamp(right + dx, left + minSize, Math.min(100, left + maxSize))
  if (mode.includes('n')) top = clamp(start.y + dy, Math.max(0, bottom - maxSize), bottom - minSize)
  if (mode.includes('s')) bottom = clamp(bottom + dy, top + minSize, Math.min(100, top + maxSize))
  crop.value = { x: left, y: top, width: right - left, height: bottom - top }
}
function endCrop() { cropDrag = null }

function enterRoiMode() {
  const size = Math.min(50, 250 / footprint.value * 100)
  crop.value = { x: (100 - size) / 2, y: (100 - size) / 2, width: size, height: size }
  leftViewMode.value = 'roi'
  showLeftInfo.value = false
}

function exitRoiMode() {
  cropDialog.value?.close()
  leftViewMode.value = 'globe'
  showLeftInfo.value = true
  if (leftGlobe && leftGlobeContainer.value) {
    leftGlobe.width(leftGlobeContainer.value.clientWidth)
    leftGlobe.height(leftGlobeContainer.value.clientHeight)
    leftGlobe.pointOfView({ lat: targetInfo.value.lat, lng: targetInfo.value.lng, altitude: ZOOM_ALTITUDE }, 0)
  }
}

async function findTerrestrialAnalogs() {
  const q = currentQuery()
  if (!q) {
    apiStatus.value = 'No analog run for this planet'
    return
  }
  resultsHidden.value = false
  resultsRequested.value = true
  if (isLunarLanding.value && !isIlilaRun.value) { await searchLighting(); return }
  candidates.value = q.candidates.filter((c) => (isIlilaRun.value || c.field_test?.decision === 'ACCEPTED') && c.lat != null && c.lon != null)
  if (isBaseMission.value) showCaveRecommendations.value = true
  rightGlobe?.customLayerData([])
  earthMatched.value = false
  showRightInfo.value = false
}


onMounted(() => {
  document.addEventListener('pointerdown', closeMenuOnOutsideClick)
  window.addEventListener('resize', restoreOnNarrowScreen)
  loadReport()
  loadMarkerCatalog()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenuOnOutsideClick)
  window.removeEventListener('resize', restoreOnNarrowScreen)
  stopDividerDrag?.()
  clearTimeout(dividerSnapTimer)
  if (leftResizeObserver) leftResizeObserver.disconnect()
  if (rightResizeObserver) rightResizeObserver.disconnect()
})
</script>

<template>
  <div class="terratwinn-app">
    <!-- Top Bar: Options, Tools, TerraTwinn, Export -->
    <header class="top-bar">
      <label v-if="devMode" class="run-select">Result run
        <select aria-label="Result run" :value="runId" :disabled="!runId" @change="selectRun(($event.target as HTMLSelectElement).value)">
          <option v-for="run in planetRuns" :key="run.id" :value="run.id">{{ run.label ?? run.id }}</option>
        </select>
      </label>
      <div class="top-center">
        <h1 class="brand-title"><a class="brand-link" href="#/setup" title="Back to mission setup">TerraTwinn</a></h1>
        <small v-if="devMode || apiStatus.startsWith('Backend')" class="api-line">{{ apiStatus }}</small>
      </div>


      <div class="top-right" data-menu="export">
        <button class="display-mode-btn" :disabled="loading3D" @click="enable3D">{{ loading3D ? 'Loading 3D…' : display3D ? 'Use image view' : 'Enable 3D globe' }}</button>
        <button class="export-capsule-btn" :aria-expanded="menu === 'export'" @click="toggleMenu('export')">
          <span>Export</span>
          <svg class="chevron-down-icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M3.2 5.5a.75.75 0 0 1 1.06-.04L8 8.87l3.74-3.41a.75.75 0 1 1 1.02 1.1l-4.25 3.88a.75.75 0 0 1-1.02 0L3.24 6.56a.75.75 0 0 1-.04-1.06z"/>
          </svg>
        </button>
        <div v-if="menu === 'export'" class="menu-panel menu-panel-right">
          <button class="menu-link" :disabled="!selectedQuery" @click="downloadJson">Download this site's report (JSON)</button>
          <a v-if="queries.length && candidates.length && !isIlilaRun" class="menu-link" :href="imgUrl('top5')" :download="`${selectedQuery}_top5.png`">Download Top-5 image (PNG)</a>
        </div>
      </div>
    </header>

    <div v-if="apiStatus.startsWith('Backend')" class="help-strip" style="background:#fee2e2" role="alert">{{ apiStatus }}</div>
    <!-- 3-step guide for first-time visitors -->
    <div v-if="showHelp" class="help-strip" role="note">
      <span><b>1</b> Search for a site on the globe</span>
      <span><b>2</b> Press <i>Inspect ROI</i> to see the real image and measurements</span>
      <span><b>3</b> Press <i>Find Terrestrial Analogs</i>, then click a dot on Earth</span>
      <small>Only candidates that pass the field-test screen are shown. Scores are relative rankings.</small>
      <button @click="closeHelp" aria-label="Close guide">✕</button>
    </div>

    <!-- Main Dual Viewport -->
    <main ref="splitViewport" class="split-viewport" :class="{ 'is-dragging-divider': draggingDivider, 'collapsed-left': fullscreenPane === 'none' && collapsedPane === 'left', 'collapsed-right': fullscreenPane === 'none' && collapsedPane === 'right' }" :style="{ '--left-pane-width': leftPanePercent + '%' }">
      <!-- Left Viewport: Moon / Mars Target -->
      <section
        v-show="(fullscreenPane === 'none' || fullscreenPane === 'left') && (fullscreenPane !== 'none' || collapsedPane !== 'left')"
        class="viewport-half left-half" :class="{ 'pane-expanded': collapsedPane === 'right', 'is-fullscreen': fullscreenPane === 'left' }"
      >
        <!-- 3D Globe Canvas Container: Permanently mounted so WebGL canvas is never destroyed -->
        <div v-show="display3D" ref="leftGlobeContainer" class="globe-canvas"></div>
        <div v-if="!display3D" class="image-view">
          <template v-if="selectedQuery && queryHasImage && !isIlilaRun">
            <img :src="imgUrl('query')" :alt="`${targetInfo.name} optical ROI`" />
            <p>{{ targetInfo.name }} · {{ footprint }} m optical ROI</p>
          </template>
          <template v-else>
            <div class="image-planet-preview"><LandingPlanetLite :src="`${BASE}textures/${currentPlanet}-preview.jpg`" :lon="0" :lat="0" :label="currentPlanet === 'mars' ? 'Mars' : 'Moon'" /></div>
            <p>{{ selectedQuery ? 'No planetary optical image for this site. See the available evidence.' : 'Loading site imagery…' }}</p>
          </template>
        </div>

        <!-- Mode 1: 3D Globe Controls Layer -->
        <div v-show="leftViewMode === 'globe'" class="globe-controls-layer">
          <!-- Left Header Controls -->
          <div class="viewport-header justify-end">
            <div v-if="queries.length" class="site-search" @focusout="closeSiteSearch">
              <div class="site-search-field">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 4.5 4.5"/></svg>
                <input ref="siteSearchInput" v-model="siteSearch" placeholder="Search sites" aria-label="Search sites" :aria-expanded="searchOpen" @focus="searchOpen = true" @keydown.esc="searchOpen = false" @keydown.enter.prevent="filteredSites[0] && chooseSite(filteredSites[0])" />
                <button v-if="siteSearch" type="button" class="site-search-clear" aria-label="Clear search" @mousedown.prevent @click="clearSiteSearch">×</button>
              </div>
              <div v-if="searchOpen" class="site-search-results">
                <button v-for="q in filteredSites" :key="q.info.query_id" @click="chooseSite(q)">{{ queryName(q) }}</button>
                <p v-if="!filteredSites.length">No sites found</p>
              </div>
            </div>
          </div>

          <!-- Bottom Left: Chat Bubble pointing directly to the 'i' button -->
          <div v-if="showLeftInfo && selectedQuery" class="info-callout-popover">
            <div class="popover-card">
              <button class="recenter-btn" aria-label="Center on selected planetary site" title="Center on site" @click="leftGlobe?.pointOfView({ lat: targetInfo.lat, lng: targetInfo.lng, altitude: ZOOM_ALTITUDE }, 1000)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
              <div class="popover-line">Long <strong>{{ targetInfo.lng }}</strong></div>
              <div class="popover-line">Lat <strong>{{ targetInfo.lat }}</strong></div>
              <div class="popover-title"><strong>{{ targetInfo.name }}</strong></div>

              <div class="popover-divider"></div>

              <button class="roi-preview" :aria-label="`Inspect ${footprint} m ROI for ${targetInfo.name}`" @click="enterRoiMode">
                <img v-if="queryHasImage && !isIlilaRun" :src="imgUrl('query')" :alt="`${targetInfo.name} surface preview`" draggable="false" />
                <strong v-if="!queryHasImage">Optical imagery unavailable</strong>
                <span>Inspect {{ footprint }} m ROI</span>
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

          <button class="bottom-icon-btn split-view-btn" title="50/50 split view" aria-label="Restore 50/50 split view" @click="restoreSplitView"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg></button>
          <button
            class="bottom-icon-btn bottom-right-icon"
            title="Expand" aria-label="Expand Moon or Mars view"
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
        <Transition name="roi-open">
        <div v-if="leftViewMode === 'roi'" class="roi-inspector-container">
            <!-- Surface High-Res Map View -->
            <div class="roi-map-viewport">
              <button class="roi-globe-return" @click="exitRoiMode" :aria-label="`Back to ${PLANET_TEXTURES[currentPlanet].name} globe`" :title="`Back to ${PLANET_TEXTURES[currentPlanet].name} globe`">
                <img :src="PLANET_TEXTURES[currentPlanet].globe" alt="" draggable="false" />
                <span>Back</span>
              </button>
              <!-- Optical Surface Texture Layer -->
              <div v-if="activeRoiLayer === 'optical' && isMars && queryHasImage && !isIlilaRun" class="roi-surface-layer">
                <div ref="cropFrame" class="crop-frame">
                  <img :src="imgUrl('query')" :alt="`${targetInfo.name} surface image`" draggable="false" />
                  <div class="crop-guides" aria-hidden="true">
                    <span class="guide-horizontal" :style="{ left: '0%', top: (crop.y + crop.height / 2) + '%', width: crop.x + '%' }"></span>
                    <span class="guide-horizontal" :style="{ left: (crop.x + crop.width) + '%', top: (crop.y + crop.height / 2) + '%', width: (100 - crop.x - crop.width) + '%' }"></span>
                    <span class="guide-vertical" :style="{ left: (crop.x + crop.width / 2) + '%', top: '0%', height: crop.y + '%' }"></span>
                    <span class="guide-vertical" :style="{ left: (crop.x + crop.width / 2) + '%', top: (crop.y + crop.height) + '%', height: (100 - crop.y - crop.height) + '%' }"></span>
                  </div>
                  <div class="crop-selection" @dblclick.stop="openCropDimensions" :style="{ left: crop.x + '%', top: crop.y + '%', width: crop.width + '%', height: crop.height + '%' }" @pointerdown="startCrop($event, 'move')" @pointermove="moveCrop" @pointerup="endCrop" @pointercancel="endCrop">
                    <span class="crop-size">{{ cropDimensions.width }} × {{ cropDimensions.height }} m</span>
                    <span v-for="corner in ['nw', 'ne', 'sw', 'se']" :key="corner" :class="['crop-handle', corner]" @pointerdown.stop="startCrop($event, corner)" @pointermove.stop="moveCrop" @pointerup.stop="endCrop" @pointercancel.stop="endCrop"></span>
                  </div>
                </div>
              </div>
              <div v-else-if="activeRoiLayer === 'optical'" class="roi-surface-layer real-evidence"><div class="real-card"><strong>Optical imagery unavailable</strong><span>{{ currentQuery()?.info.image_note ?? 'This run has no planetary query photograph.' }}</span></div></div>

              <!-- Slope / DEM Heatmap Layer -->
              <div v-else-if="activeRoiLayer === 'slope' && isMars" class="roi-surface-layer real-evidence">
                <div class="real-card wide">
                  <strong>Slope / DEM</strong>
                  <RoiTerrainVisual :body="currentPlanet === 'mars' ? 'mars' : 'moon'" :id="selectedQuery" :name="targetInfo.name" :terrain="terrainMeasurement" :regional="measurements?.regional_terrain ?? null" :note="(currentQuery()?.info as any)?.slope_note" />
                </div>
              </div>
              <div v-else-if="activeRoiLayer === 'slope'" class="roi-surface-layer real-evidence"><div class="real-card"><strong>No slope data</strong><span>No analog run for this planet.</span></div></div>

              <!-- Thermal Layer -->
              <div v-else-if="isMars" class="roi-surface-layer real-evidence">
                <div class="real-card wide">
                  <strong>Surface temperature</strong>
                  <RoiThermalVisual :name="targetInfo.name" :context="temperatureContext" :inertia="thermalInertia" :earth="earthThermalRows" :earth-total="Math.min(5, candidates.length)" />
                </div>
              </div>
              <div v-else class="roi-surface-layer real-evidence"><div class="real-card"><strong>No thermal data</strong><span>No analog run for this planet.</span></div></div>
            </div>

            <!-- ROI Top Toolbar -->
            <div class="roi-toolbar">
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

            <!-- Elevation Transect Profile Section -->
            <div class="roi-transect-section">
              <div class="transect-header">
                <div class="transect-title">
                  <strong>Measured evidence</strong>
                  <p class="evidence-description">Measurements and ranking use the full {{ footprint }} m ROI. The crop is a preview.</p>
                </div>
                <div class="transect-metrics">
                  <span class="metric-item">Slope: <strong>{{ targetInfo.slope }}</strong></span>
                  <span class="metric-item">Roughness: <strong>{{ targetInfo.roughness }}</strong></span>
                </div>
              </div>

              <!-- Find Analogs CTA -->
              <div v-if="isBaseMission" class="lighting-planner-summary">
                <strong>Subsurface base research</strong>
                <span>Explore sourced lava-tube training sites, including C7 in Krong No, Vietnam. These suggestions complement your surface candidates.</span>
                <button @click="showCaveRecommendations = true">Caves & lava tubes</button>
              </div>
              <div v-if="isLunarLanding" class="lighting-planner-summary">
                <strong>Low-Sun landing-module tests</strong>
                <span v-if="lightingPlan">Lunar Sun {{lightingPlan.target.elevation_deg.toFixed(2)}}° high · {{lightingPlan.target.azimuth_deg.toFixed(2)}}° azimuth. Matching Earth dates appear in each result.</span>
                <span v-else>Find accepted Earth sites with matching low-Sun test windows over the next 365 days.</span>
                <button @click="showLightingControls = true">Set lunar reference & test dates</button>
                <p v-if="lightingBusy" role="status">Calculating matching test windows…</p>
                <p v-if="lightingError" role="alert">{{lightingError}}</p>
              </div>
              <div class="roi-cta-bar">
                <button class="find-analogs-btn" :disabled="lightingBusy || (!queryHasImage && !isIlilaRun)" @click="findTerrestrialAnalogs">
                  <span>{{lightingBusy ? 'Calculating light matches…' : 'Find Terrestrial Analogs'}}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
        <dialog ref="cropDialog" class="crop-dimension-dialog" aria-label="Edit crop dimensions" @keydown.esc="cropDialog?.close()">
          <form @submit.prevent="saveCropDimensions">
            <div class="dimension-inputs">
              <input v-model="dimensionWidth" aria-label="Width in metres" inputmode="decimal" autocomplete="off" />
              <span aria-hidden="true">×</span>
              <input v-model="dimensionHeight" aria-label="Height in metres" inputmode="decimal" autocomplete="off" />
              <span>m</span>
            </div>
            <p v-if="dimensionError" class="dimension-error" role="alert">{{ dimensionError }}</p>
            <div class="dimension-actions"><button type="button" @click="cropDialog?.close()">Cancel</button><button type="submit">Apply</button></div>
          </form>
        </dialog>
        </section>

      <div v-if="fullscreenPane === 'none' && collapsedPane === 'none'" class="pane-divider" role="separator" aria-label="Resize explorer panes" aria-orientation="vertical" :aria-valuenow="Math.round(leftPanePercent)" aria-valuemin="20" aria-valuemax="80" tabindex="0" @pointerdown="beginDividerDrag" @keydown="dividerKey"><span></span></div>
      <div v-if="fullscreenPane === 'none' && collapsedPane !== 'none'" class="pane-restore" :class="collapsedPane" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="collapsedPane === 'left' ? 'Drag right to show Moon and Mars pane' : 'Drag left to show Earth pane'" @pointerdown="beginDividerDrag" @keydown="restorePaneKey">{{ collapsedPane === 'left' ? '›' : '‹' }}</div>

      <!-- Right Viewport: Earth Analogs -->
      <section
        v-show="(fullscreenPane === 'none' || fullscreenPane === 'right') && (fullscreenPane !== 'none' || collapsedPane !== 'right')"
        class="viewport-half right-half"
        :class="{ 'is-fullscreen': fullscreenPane === 'right', 'pane-expanded': collapsedPane === 'left' }"
      >
        <!-- Right Header Controls -->
        <div class="viewport-header justify-end">
        </div>

        <!-- 3D Globe Canvas Container -->
        <div v-show="display3D" ref="rightGlobeContainer" class="globe-canvas"></div>
        <div v-if="!display3D" class="image-view earth-image-view">
          <template v-if="selectedCandidate">
            <img v-if="selectedCandidate.optical_context" :src="selectedCandidate.optical_context.image_url" :alt="`${candidateName(selectedCandidate)} satellite optical ROI`" />
            <div v-else class="image-view-candidate" :style="candidateStyle(selectedCandidate, selectedCandidateIndex)" role="img" :aria-label="`Optical ROI of ${candidateName(selectedCandidate)}`"></div>
            <p>{{ candidateName(selectedCandidate) }}</p>
          </template>
          <template v-else>
            <div class="image-planet-preview"><LandingPlanetLite :src="`${BASE}textures/earth-preview.jpg`" :lon="0" :lat="0" label="Earth" atmosphere /></div>
            <p>Earth overview · Find analogs to view site imagery.</p>
          </template>
        </div>

        <!-- Top-5 candidate cards -->
        <p v-if="resultsRequested && !candidates.length && !lightingBusy && !lightingError" class="no-accepted-results">{{isLunarLanding ? 'No accepted sites have a matching low-Sun window in this search period. Try another lunar reference time.' : 'No candidates passed the field-test screen for this location.'}}</p>
        <div v-if="candidates.length" class="results-drawer" :class="{ 'is-hidden': resultsHidden }">
          <button class="results-toggle" :aria-expanded="!resultsHidden" :aria-label="resultsHidden ? 'Show candidates' : 'Hide candidates'" @click="resultsHidden = !resultsHidden">{{ resultsHidden ? '‹' : '›' }}</button>
          <div class="cand-list" aria-label="Top-5 Earth candidates" :inert="resultsHidden">
          <p class="screen-caption">{{ isIlilaRun ? 'Preliminary iLILA candidates. Local noise and construction suitability remain unverified.' : 'Accepted by the field-test screen. Landing safety has not been assessed.' }}</p>
          <button v-for="c in candidates" :key="c.rank" class="cand-card" :class="{ sel: earthMatched && matchedAnalog.name.startsWith('#' + c.rank + ' ') }" @click="pickCandidate(c)">
            <span class="cand-main">
              <span class="candidate-card-top">
                <span class="candidate-ranking-score" aria-label="Ranking score"><strong>{{ rankingScore(c) != null ? (rankingScore(c)! * 100).toFixed(1) : '—' }}</strong><span>/100</span></span>
                <span class="chip" :class="statusClass(c.field_test?.decision)" title="Field-test screening result; landing safety has not been assessed.">{{ statusText(c.field_test?.decision) }}</span>
              </span>
              <b class="candidate-place-name">#{{ c.rank }} {{ candidateName(c) }}</b>
              <small class="candidate-place-location">{{ candidateLocation(c) }}</small>
              <small class="candidate-origin-distance">{{ c.distance_km != null ? Math.round(c.distance_km).toLocaleString('en-US') + ' km from ' + originCity.name : 'Distance unavailable' }}</small>
              <small v-if="c.lighting?.windows[0]" class="candidate-light-window"><strong>Next light match</strong> {{lightingDate(c.lighting.windows[0].start_local)}} – {{c.lighting.windows[0].start_local.slice(0,10)===c.lighting.windows[0].end_local.slice(0,10)?c.lighting.windows[0].end_local.slice(11,16):lightingDate(c.lighting.windows[0].end_local)}}<span>{{c.lighting.windows[0].timezone}} · {{c.lighting.windows[0].duration_minutes}} min</span></small>
            </span>
          </button>
        </div>
        </div>

        <!-- Bottom Left: Chat Bubble pointing directly to Earth's 'i' button -->
        <div v-if="showRightInfo" class="info-callout-popover">
          <div class="popover-card">
            <button class="recenter-btn" aria-label="Center on selected Earth candidate" title="Center on candidate" @click="rightGlobe?.pointOfView({ lat: matchedAnalog.lat, lng: matchedAnalog.lng, altitude: 0.15 }, 1000)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button>
            <div class="popover-line">Long <strong>{{ matchedAnalog.lng }}</strong></div>
            <div class="popover-line">Lat <strong>{{ matchedAnalog.lat }}</strong></div>
            <div class="popover-title"><strong>{{ matchedAnalog.name }}</strong></div>
            <div class="popover-meta">{{ statusText(matchedStatus) }}</div>
            <div class="analog-match-badge-wrap">
              <span class="analog-score-pill" :class="statusClass(matchedStatus)" title="Uncalibrated heuristic; not a probability of a true analog.">{{ selectedCandidate && rankingScore(selectedCandidate) != null ? 'Ranking score' : 'Evidence score' }} {{ matchedAnalog.matchScore }}</span>
            </div>
            <button v-if="selectedCandidateIndex >= 0" class="earth-preview earth-preview-button" :aria-label="`Inspect ${matchedAnalog.name}`" :style="selectedCandidate ? candidateStyle(selectedCandidate, selectedCandidateIndex) : {}" @click="openEarthInspector"><span>Inspect candidate</span></button>
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

        <button class="bottom-icon-btn split-view-btn" title="50/50 split view" aria-label="Restore 50/50 split view" @click="restoreSplitView"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg></button>
        <button
          class="bottom-icon-btn bottom-right-icon"
          title="Expand" aria-label="Expand Earth view"
          @click="toggleFullscreen('right')"
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
        <Transition name="roi-open">
          <div v-if="earthInspectorOpen && selectedCandidate" class="earth-inspector">
            <header class="earth-inspector-header">
              <button class="earth-back" @click="closeEarthInspector"><img :src="PLANET_TEXTURES.earth.globe" alt="" draggable="false" /> Back</button>
              <div><strong>{{ matchedAnalog.name.replace(/_/g, ' ') }}</strong><span class="earth-inspector-status" :class="statusClass(matchedStatus)">{{ statusText(matchedStatus) }}</span></div>
            </header>
            <div class="earth-inspector-content">
              <p v-if="runId === 'moon_judge_ilila_testbed'" class="earth-context">Legacy report: seismic reference interpolation and relative geometry scores are outdated. Use the corrected expanded iLILA run.</p>
              <p v-if="isIlilaRun" class="earth-context">Preliminary iLILA testbed screening. Profile plots are not photographs. No image similarity or construction suitability has been established.</p>
              <figure v-if="selectedCandidate.optical_context" class="earth-detail">
                <img :src="selectedCandidate.optical_context.image_url" alt="Satellite optical ROI at the exact candidate coordinates" style="width: 224px; max-width: 100%" />
                <figcaption>{{ selectedCandidate.optical_context.source }} · {{ selectedCandidate.optical_context.gsd_m }} m/pixel · {{ selectedCandidate.optical_context.footprint_m }} m footprint. Optical context for image features; separate from the iLILA engineering score.</figcaption>
              </figure>
              <div class="earth-comparison" :class="{ compact: earthInspectorTab !== 'overview', 'ilila-profiles': isIlilaRun }">
                <figure v-if="!isIlilaRun"><img :src="imgUrl('query')" :alt="`${targetInfo.name} planetary terrain`" /><figcaption><strong>{{ currentPlanet === 'moon' ? 'Moon' : 'Mars' }} · {{ targetInfo.name }}</strong><span>Original ROI: {{ footprint }} m</span></figcaption></figure>
                <figure><div class="earth-comparison-candidate" role="img" :aria-label="`Image of ${matchedAnalog.name}`" :style="selectedCandidate ? candidateStyle(selectedCandidate, selectedCandidateIndex) : {}"></div><figcaption><strong>Earth · {{ candidateName(selectedCandidate) }}</strong><span>{{ isIlilaRun ? 'Engineering profiles: two 1 km arms and station PSD' : runId.endsWith('_global') ? 'Catalog ROI: 250 m' : 'Candidate footprint: not provided' }}</span></figcaption></figure>
              </div>
              <nav class="earth-tabs" aria-label="Candidate information">
                <button v-for="tab in (['overview', 'compare', 'lighting', 'terrain', 'sources'] as const)" v-show="tab !== 'lighting' || isLunarLanding" :key="tab" :class="{ active: earthInspectorTab === tab }" @click="earthInspectorTab = tab">{{ tab === 'sources' ? 'Evidence & sources' : tab === 'compare' ? 'Compare candidates' : tab === 'lighting' ? 'Light & test dates' : tab === 'terrain' ? 'Terrain' : 'Overview' }}</button>
              </nav>
              <section v-if="earthInspectorTab === 'overview'" class="earth-detail">
                <div class="overview-chips">
                  <span>{{ Number(selectedCandidate.lat).toFixed(4) }}°, {{ Number(selectedCandidate.lon).toFixed(4) }}°</span>
                  <span v-if="selectedCandidate.distance_km != null">{{ Math.round(selectedCandidate.distance_km).toLocaleString() }} km from {{ originCity.name }}</span>
                  <span :class="statusClass(matchedStatus)">Field test: {{ statusText(matchedStatus) }}</span>
                  <button class="compare-candidates-cta" @click="earthInspectorTab = 'compare'">Compare all {{ candidates.length }} candidates</button>
                </div>
                <RankingExplanation :candidate="selectedCandidate" :candidates="candidates" />
                <dl v-if="selectedCandidate.ilila" class="ilila-evidence">
                  <div v-if="selectedCandidate.validation_assessment"><dt>Validation assessment</dt><dd>{{ selectedCandidate.validation_assessment.replace(/_/g, ' ') }} · station proxy, not a site noise measurement</dd></div>
                  <div><dt>Sampled minimum beam clearance</dt><dd>{{ selectedCandidate.ilila.c_min_m.toFixed(2) }} m (DSM)</dd></div>
                  <div><dt>Seismic station proxy</dt><dd>{{ selectedCandidate.ilila.station.net }}.{{ selectedCandidate.ilila.station.sta }} · {{ selectedCandidate.ilila.station.km }} km from candidate</dd></div>
                  <div><dt>Median PSD above Earth NLNM</dt><dd>{{ selectedCandidate.ilila.seismic.db_above_nlnm?.toFixed(1) }} dB · {{ selectedCandidate.ilila.seismic.segments }} segments</dd></div>
                  <div><dt>Mapped fault distance</dt><dd>{{ selectedCandidate.ilila.fault_km?.toFixed(1) ?? 'Unknown' }} km</dd></div>
                  <div><dt>Geometry score rule</dt><dd>{{ selectedCandidate.ilila.geometry_note }}</dd></div>
                  <template v-if="selectedCandidate.ilila.context_validation">
                    <div><dt>NASADEM geometry / perturbation check</dt><dd>{{ selectedCandidate.ilila.context_validation.nasadem?.geometry_ok ? 'Pass' : 'Not passed' }} / {{ selectedCandidate.ilila.context_validation.nasadem?.robust_ok ? 'Pass' : 'Not passed' }}</dd></div>
                    <div><dt>WorldCover tree-class fraction (2021)</dt><dd>{{ selectedCandidate.ilila.context_validation.worldcover?.tree_class_fraction != null ? (selectedCandidate.ilila.context_validation.worldcover.tree_class_fraction * 100).toFixed(1) + '%' : 'Unavailable' }} of arm corridors · map proxy</dd></div>
                    <div><dt>Sentinel-2 green-pixel fraction (2023)</dt><dd>{{ selectedCandidate.ilila.context_validation.sentinel2_vegetation?.green_fraction != null ? (selectedCandidate.ilila.context_validation.sentinel2_vegetation.green_fraction * 100).toFixed(1) + '%' : 'Unavailable' }} · NDVI &gt; 0.3 in median composite, not canopy cover</dd></div>
                  </template>
                </dl>
                <p class="earth-muted">Research candidate from images and environmental data; field-test screening does not replace a site survey.</p>
              </section>
              <section v-else-if="earthInspectorTab === 'compare'" class="earth-detail">
                <CandidateComparison :candidates="candidates" :active-region="selectedCandidate.region" :target-name="targetInfo.name" :target-terrain="terrainMeasurement?.comparison" :target-materials="(currentQuery()?.info as any)?.environment?.lithology" :target-body="currentPlanet === 'mars' ? 'mars' : 'moon'" :target-id="terrainMeasurement ? selectedQuery : undefined" />
              </section>
              <section v-else-if="earthInspectorTab === 'lighting'" class="earth-detail">
                <LunarLightingPanel :plan="lightingPlan" :busy="lightingBusy" :error="lightingError" :query-id="selectedQuery" :target-name="targetInfo.name" :candidate="selectedCandidate" :lunar-time="lunarReferenceTime" :start-date="earthSearchStart" :controls="false" />
                <button class="compare-candidates-cta" @click="showLightingControls = true">Change lunar reference or search dates</button>
              </section>
              <section v-else-if="earthInspectorTab === 'terrain'" class="earth-detail">
                <h2>Terrain measurements</h2>
                <ReliefPair :body="currentPlanet === 'mars' ? 'mars' : 'moon'" :target-id="selectedQuery" :target-name="targetInfo.name" :earth-id="selectedCandidate.region" :earth-name="candidateName(selectedCandidate)" :rows="terrainRows" :target="(planetaryTerrainStats as any)" :earth="(earthTerrainStats as any)" :regional="!planetaryTerrainStats && !!regionalTerrain" />
                <details class="terrain-details"><summary>Measurement table and sources</summary>
                <div class="terrain-scale-tabs" role="group" aria-label="Terrain measurement scale">
                  <button :class="{ active: terrainScale === 'common' }" @click="terrainScale = 'common'">Compare · 30 m grid</button>
                  <button :class="{ active: terrainScale === 'native' }" @click="terrainScale = 'native'">Source resolution</button>
                </div>
                <p v-if="terrainScale === 'common'">DEM-derived values on a shared 30 m grid, using a centered 240 × 240 m square within each 250 m ROI. Finer DEMs are area-averaged; coarse DEMs are not upsampled.</p>
                <p v-else>Values at each DEM's source resolution. Different grids resolve different terrain detail; these values are not directly interchangeable.</p>
                <div class="earth-table-wrap"><table class="terrain-comparison-table">
                  <thead><tr><th>Measurement</th><th>{{ currentPlanet === 'moon' ? 'Moon' : 'Mars' }}</th><th>Earth</th><th v-if="terrainScale === 'common'">Absolute difference</th></tr></thead>
                  <tbody><tr v-for="row in terrainRows" :key="row.key"><th>{{ row.label }}<small>{{ row.detail }}</small></th><td>{{ terrainValue(planetaryTerrainStats, row.key, row.unit) }}</td><td>{{ terrainValue(earthTerrainStats, row.key, row.unit) }}</td><td v-if="terrainScale === 'common'">{{ terrainDifference(row.key, row.unit) }}</td></tr></tbody>
                </table></div>
                <div class="terrain-source-grid">
                  <article v-for="(data, index) in [planetaryTerrainStats, earthTerrainStats]" :key="index"><strong>{{ index === 0 ? (currentPlanet === 'moon' ? 'Moon' : 'Mars') : 'Earth' }} · {{ data ? 'DEM-derived' : 'Unavailable at this scale' }}</strong><template v-if="data"><p>{{ data.sampled_width_m.toFixed(0) }} m sampled window · {{ data.posting_m.toFixed(1) }} m grid<br>{{ (data.valid_fraction * 100).toFixed(1) }}% valid elevation samples</p><a :href="data.source_url" target="_blank" rel="noopener">{{ data.source.includes('COPERNICUS') ? 'Copernicus GLO-30' : data.source.includes('REMA') ? 'REMA' : data.source }}</a></template><p v-else>A DEM with sufficient resolution and coverage is needed. Values are not inferred from optical appearance.</p></article>
                </div>
                <section v-if="!planetaryTerrainStats && regionalTerrain" class="regional-terrain-context">
                  <h3>{{ currentPlanet === 'moon' ? 'Moon' : 'Mars' }} · regional terrain estimate</h3>
                  <p>The local ROI lacks a suitable high-resolution DEM. The values below describe a <strong>10 km region</strong> around the site, not the 250 m ROI. They are excluded from the difference column and ranking.</p>
                  <dl><div v-for="row in terrainRows" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ terrainValue(regionalTerrain, row.key, row.unit) }}</dd></div></dl>
                  <p>{{ regionalTerrain.posting_m }} m analysis grid · {{ (regionalTerrain.valid_fraction * 100).toFixed(1) }}% valid samples. <a :href="regionalTerrain.source_url" target="_blank" rel="noopener">{{ regionalTerrain.source }}</a></p>
                </section>
                <p class="earth-muted">DEM roughness describes resolved terrain relief, not individual rocks. Copernicus and REMA are surface models and can include vegetation or structures. These display measurements do not change the saved ranking score.</p>
                </details>
              </section>
              <section v-else class="earth-detail">
                <h2>Evidence & sources</h2>
                <p v-if="terrainMeasurement">The Terrain tab shows DEM measurements. Refreshed global rankings use slope only when both ROIs have coordinate-matched DEMs on the common 30 m grid.</p>
                <div v-if="selectedCandidate.score_components" class="earth-table-wrap"><table><thead><tr><th>Ranking factor</th><th>Weight</th><th>Score</th><th>Confidence</th></tr></thead><tbody><tr v-for="(part, key) in selectedCandidate.score_components" :key="key"><th>{{ componentNames[key] ?? key }}</th><td>{{ Math.round(part.weight * 100) }}%</td><td>{{ part.value != null ? part.value.toFixed(3) : 'No data' }}</td><td>{{ Math.round(part.confidence * 100) }}%</td></tr></tbody></table><p>Score = sum(weight * confidence * factor score) / sum(weight * confidence), over available factors. Relative scores depend on the candidate pool.</p></div>
                <p v-if="selectedCandidate.final_score != null">Final score = 0.92 * composite + 0.08 * (1 - distance_km / 20015). Origin: {{ originCity.name }}.</p>
                <dl><div><dt>Image similarity</dt><dd>{{ selectedCandidate.cosine != null ? selectedCandidate.cosine.toFixed(3) + ' cosine · model output' : 'Not applicable (no image retrieval)' }}</dd></div><div><dt>{{ rankingScore(selectedCandidate) != null ? 'Ranking score' : 'Evidence index' }}</dt><dd>{{ matchedAnalog.matchScore }} · uncalibrated heuristic, not a probability</dd></div><div><dt>Model assessment</dt><dd>{{ selectedCandidate.vote ? selectedCandidate.vote + (selectedCandidate.agreement != null ? ` (${Math.round(selectedCandidate.agreement * 100)}% agreement)` : '') : 'Not available' }}</dd></div><div><dt>Planetary source</dt><dd>{{ currentQuery()?.info.product || 'Product not provided' }}</dd></div><div><dt>Earth imagery source</dt><dd>Not provided in this result</dd></div><div><dt>Run</dt><dd>{{ runId }}</dd></div></dl>
                <p v-if="selectedCandidate.reasoning?.reason">{{ selectedCandidate.reasoning.reason }}</p><p class="earth-muted">Results are model-generated proposals, not verified analogs.</p>
              </section>
            </div>
          </div>
        </Transition>
        <div v-if="showLightingControls && isLunarLanding" class="lighting-settings-overlay" role="dialog" aria-label="Lunar lighting test dates" aria-modal="true" @keydown.esc="showLightingControls=false">
          <button class="close-lighting-settings" @click="showLightingControls=false">Close</button>
          <LunarLightingPanel :plan="lightingPlan" :busy="lightingBusy" :error="lightingError" :query-id="selectedQuery" :target-name="targetInfo.name" :lunar-time="lunarReferenceTime" :start-date="earthSearchStart" @search="searchLighting" />
        </div>
        <div v-if="showCaveRecommendations && isBaseMission" class="cave-recommendations-overlay" role="dialog" aria-label="Cave and lava-tube recommendations" aria-modal="true" @keydown.esc="showCaveRecommendations=false">
          <button class="close-lighting-settings" @click="showCaveRecommendations=false">Close</button>
          <BaseCavePanel :body="currentPlanet" :query-id="selectedQuery" :origin-lat="originCity.lat" :origin-lon="originCity.lon" :origin-name="originCity.name" />
        </div>
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
          <tr v-for="r in validation.morph.results" :key="r.query_id"><td>{{ prettyName(r.query_id) }}</td><td>{{ r.permutation_p }}</td><td>{{ r.passes_preregistered ? 'passes' : 'does not pass' }}</td></tr></table>
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
  height: 58px;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 2px solid #000000;
  background: #ffffff;
  position: relative;
  z-index: 50;
}


.top-left {
  display: flex;
  align-items: center;
  gap: 32px;
}

.run-select { display:flex; flex-direction:column; gap:2px; width:min(30vw,400px); color:#334155; font-size:12.5px; }
.run-select select { width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:5px; background:white; color:#111827; font-size:13px; text-overflow:ellipsis; }
.display-mode-btn { border:1px solid #cbd5e1; border-radius:6px; padding:6px 9px; margin-right:12px; background:#f8fafc; font-size:13px; cursor:pointer; }
.image-view { position:absolute; inset:76px 16px 80px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#64748b; text-align:center; }
.image-view > img, .image-view-candidate { width:min(100%,420px); aspect-ratio:1; object-fit:contain; border-radius:8px; background-color:#f1f5f9; }
.image-view-candidate { background-position:center; background-repeat:no-repeat; }
.image-planet-preview { width:min(100%,340px); aspect-ratio:1; flex-shrink:0; }
.earth-image-view { right:330px; }
@media(max-width:900px) { .earth-image-view { right:16px; } .display-mode-btn { font-size:12.5px; margin-right:5px; padding:5px; } }

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
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
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
  align-items: center;
}

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
  font-size: 13px;
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
  font-size: 12.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  letter-spacing: 0.3px;
}

.analog-metrics-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
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
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 6px 14px;
  border-radius: 9999px;
  letter-spacing: 0.2px;
}

.status-pill-matched {
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 12.5px;
  color: #64748b;
}

.transect-metrics {
  display: flex;
  gap: 12px;
  font-size: 13px;
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
.real-card { max-height: 92%; overflow-y: auto; }
.real-card.wide { width: min(94%, 680px); max-width: 94%; text-align: left; margin-top: 56px; max-height: calc(100% - 64px) }
.real-card.wide > strong { text-align: center }
.brand-link { color: inherit; text-decoration: none }
.brand-link:hover { opacity: .75 }
.real-card a { font-size: 13px; color: #3f6552; }
.terrain-preview { display: block; width: min(100%, 280px); height: auto; aspect-ratio: 1; margin: 4px auto; object-fit: contain; }
.slope-scale { display: flex; justify-content: space-between; }
.real-card .slope-scale span { font-size: inherit; font-weight: inherit; }
.transect-title .crop-note, .transect-title .transect-sub { display: block; }
/* ---- search regions overlay ---- */
.regions-panel { position:absolute; left:24px; bottom:72px; z-index:20; display:grid; gap:8px; max-width:min(320px, 60%); }
.regions-toggle { justify-self:start; border:1.5px solid #000; background:#fff; border-radius:999px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; }
.regions-toggle.on { background:#000; color:#fff; }
.regions-legend { display:grid; gap:4px; font-size:13px; background:rgba(255,255,255,.92); border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; }
.regions-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; }
.region-card { display:grid; gap:4px; font-size:13px; background:#fff; border:1.5px solid #000; border-radius:10px; padding:10px 12px; }
.region-card small { color:#64748b; }

/* ---- responsive ---- */
.top-left { min-width:0; }
.menu-radios { display:grid; gap:4px; padding:4px 0; }
.api-line { display:block; text-align:center; font-size:12.5px; color:#64748b; max-width:40vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
.ladder li em { float:right; font-style:normal; font-size:13px; color:#64748b; }
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
.help-strip b { display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: #000; color: #fff; font-size: 12.5px; margin-right: 4px; }
.help-strip small { color: #64748b; }
:where(.terratwinn-app) small { font-size: 12.5px; }
.help-strip button { margin-left: auto; background: none; border: none; font-size: 16px; cursor: pointer; }
.status-pill-matched.rejected { background: #f1f5f9; border-color: #cbd5e1; }
.analog-score-pill.rejected { background: #cbd5e1; }
.rejected-note { margin-left: 6px; font-size: 12.5px; color: #64748b; }
@media (max-width: 900px) {
  .menu-panel { min-width: 220px; }
  .top-bar { height: auto; min-height: 0; flex-wrap: wrap; padding: 6px 12px; row-gap: 4px; }
  .top-center { position: static !important; transform: none !important; order: -1; width: 100%; text-align: center; }
  .top-left { flex-wrap: wrap; gap: 6px 14px; }
  .top-left button.menu-item-btn, .top-left select.menu-item-btn { display: inline-block; font-size: 15px; }
  .viewport-half { height: calc(100vh - 100px); }
}

.status-pill-matched.ok { background: #dcfce7; border-color: #86efac; }
.status-pill-matched.mid { background: #fef3c7; border-color: #fcd34d; }
.status-pill-matched.bad { background: #f1f5f9; border-color: #cbd5e1; }
.analog-score-pill.ok { background: #22c55e; } .analog-score-pill.mid { background: #fcd34d; } .analog-score-pill.bad { background: #cbd5e1; }
.cand-list { position: absolute; right: 12px; top: 64px; z-index: 30; width: 300px; max-height: calc(100% - 140px); overflow: auto; display: grid; gap: 6px; }
.cand-card { display: flex; gap: 8px; text-align: left; background: rgba(255,255,255,.96); border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 6px; cursor: pointer; font: inherit; color: #000; }
.cand-card.sel { border-color: #000; }
.cand-thumb { flex: none; width: 64px; height: 64px; border-radius: 6px; background-size: 600% 100%; background-repeat: no-repeat; }
.cand-main { display: grid; gap: 2px; font-size: 13px; min-width: 0; }
.cand-main small { color: #475569; } .cand-break { font-style: italic; }
.chip { display: inline-block; width: fit-content; padding: 0 8px; border-radius: 9999px; font-size: 12.5px; font-weight: 700; }
.chip.ok { background: #bbf7d0; } .chip.mid { background: #fde68a; } .chip.bad { background: #e2e8f0; }
@media (max-width: 900px) { .cand-list { position: static; width: auto; max-height: none; padding: 8px 12px; } }
</style>

<style scoped>
.site-search { width: min(260px, 48%); position: relative; font-size: 14px; }
.site-search-field { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 999px; background: #050505; box-shadow: 0 3px 14px #0003; color: white; }
.site-search-field span { font-size: 24px; line-height: 1; }
.site-search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; font: inherit; color: white; }
.site-search-clear { flex: none; border: 0; padding: 0 2px; background: transparent; color: #bcbcbc; font-size: 22px; line-height: 1; cursor: pointer; }
.site-search-clear:hover, .site-search-clear:focus-visible { color: white; }
.site-search input::placeholder { color: #bcbcbc; opacity: 1; }
.site-search-results { position: absolute; top: calc(100% + 5px); width: 100%; background: #111; border-radius: 12px; box-shadow: 0 5px 18px #0005; max-height: min(252px, 55vh); overflow-y: auto; overscroll-behavior: contain; }
.site-search-results button { display: block; width: 100%; border: 0; padding: 11px 14px; line-height: 20px; text-align: left; background: #111; cursor: pointer; font: inherit; line-height: 20px; color: white; }
.site-search-results button:hover, .site-search-results button:focus { background: #333; }
.site-search-results p { margin: 0; padding: 12px 14px; color: #bcbcbc; }
</style>

<style scoped>
/* Light halos separate map controls from changing surface imagery. */
.celestial-toggle,
.site-search-field,
.regions-toggle,
.inspect-roi-action-btn,
.back-globe-btn,
.layer-pill-btn,
.find-analogs-btn,
.cand-card {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, .8), 0 0 14px 4px rgba(255, 255, 255, .6), 0 2px 8px rgba(0, 0, 0, .24);
}
.bottom-icon-btn {
  filter: drop-shadow(0 0 3px white) drop-shadow(0 0 7px rgba(255, 255, 255, .9));
}
.viewport-half button:focus-visible,
.site-search-field:focus-within {
  outline: 2px solid #78baff;
  outline-offset: 3px;
}
</style>

<style scoped>
.roi-preview { position: relative; display: block; width: 100%; height: 130px; padding: 0; overflow: hidden; border: 0; border-radius: 8px; background: #292929; color: white; cursor: pointer; text-align: left; }
.roi-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.roi-preview > span { position: absolute; inset: auto 0 0; padding: 24px 10px 9px; background: linear-gradient(transparent, rgba(0,0,0,.85)); font-size: 13px; font-weight: 600; }
.roi-preview:focus-visible { outline: 2px solid #78baff; outline-offset: 3px; }
</style>

<style scoped>
.popover-card { position: relative; }
.recenter-btn { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; display: grid; place-items: center; padding: 4px; border: 0; border-radius: 6px; background: #000; color: white; cursor: pointer; }
.recenter-btn svg { width: 24px; height: 24px; }
.recenter-btn:hover { background: #333; }
.recenter-btn:focus-visible { outline: 2px solid #78baff; outline-offset: 2px; }
</style>

<style scoped>
.roi-globe-return { position: absolute; top: 16px; left: 16px; z-index: 5; display: flex; align-items: center; gap: 8px; height: 44px; padding: 4px 14px 4px 4px; border: 2px solid white; border-radius: 999px; background: #111; color: white; font: inherit; font-size: 14px; font-weight: 600; box-shadow: 0 0 12px rgba(255,255,255,.75); cursor: pointer; }
.roi-globe-return img { width: 32px; height: 32px; display: block; object-fit: cover; border-radius: 50%; }
.roi-globe-return:focus-visible { outline: 2px solid #78baff; outline-offset: 3px; }
.roi-toolbar { flex-shrink: 0; border-top: 1px solid #e2e8f0; }
.roi-open-enter-active, .roi-open-leave-active { transition: transform .38s cubic-bezier(.2,.8,.2,1), opacity .38s ease; transform-origin: 15% 85%; }
.roi-open-enter-from, .roi-open-leave-to { transform: scale(.84); opacity: 0; }
@media (prefers-reduced-motion: reduce) { .roi-open-enter-active, .roi-open-leave-active { transition: none; } }
@media (max-width: 600px) { .roi-toolbar { height: auto; min-height: 52px; flex-wrap: wrap; gap: 8px; padding: 8px 12px; } }
</style>


<style scoped>
.roi-surface-layer:has(.crop-frame) { display: flex; align-items: center; justify-content: center; }
.crop-frame { position: relative; height: 100%; max-width: 100%; aspect-ratio: 1; }
.crop-frame img { display: block; width: 100%; height: 100%; object-fit: fill; user-select: none; }
.crop-selection { position: absolute; box-sizing: border-box; border: 2px solid #ffeb3b; box-shadow: 0 0 8px #fff, 0 0 2px 1px #000; cursor: move; touch-action: none; }
.crop-size { position: absolute; left: 4px; bottom: 4px; padding: 2px 4px; border-radius: 3px; background: #000b; color: white; font-size: 12.5px; white-space: nowrap; pointer-events: none; }
.crop-handle { position: absolute; width: 14px; height: 14px; border: 2px solid #222; border-radius: 50%; background: #ffeb3b; box-shadow: 0 0 6px white; touch-action: none; }
.crop-handle.nw { top: -8px; left: -8px; cursor: nwse-resize; }
.crop-handle.ne { top: -8px; right: -8px; cursor: nesw-resize; }
.crop-handle.sw { bottom: -8px; left: -8px; cursor: nesw-resize; }
.crop-handle.se { bottom: -8px; right: -8px; cursor: nwse-resize; }
.crop-note { color: #64748b; font-size: 12.5px; }
</style>

<style scoped>
.crop-guides { position: absolute; inset: 0; pointer-events: none; }
.crop-guides span { position: absolute; display: block; background: #ffeb3b; box-shadow: 0 0 6px #fff, 0 0 2px #000; }
.guide-horizontal { height: 2px; transform: translateY(-50%); }
.guide-vertical { width: 2px; transform: translateX(-50%); }
</style>

<style scoped>
.crop-dimension-dialog { position: absolute; inset: 0; z-index: 60; margin: auto; width: min(290px, calc(100% - 32px)); height: fit-content; box-sizing: border-box; padding: 16px; border: 1px solid #ddd; border-radius: 16px; background: white; color: #111; box-shadow: 0 12px 50px #0005; }
.dimension-inputs { display: flex; align-items: center; gap: 8px; }
.dimension-inputs input { min-width: 0; width: 0; flex: 1; }
.crop-dimension-dialog h2 { margin: 0 0 12px; font-size: 20px; }
.crop-dimension-dialog p { font-size: 13px; }
.crop-dimension-dialog label { display: grid; gap: 6px; margin-top: 14px; font-size: 14px; }
.crop-dimension-dialog input { padding: 10px; border: 1px solid #aaa; border-radius: 6px; font: inherit; }
.dimension-error { color: #b91c1c; }
.dimension-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.dimension-actions button { padding: 8px 16px; border-radius: 20px; border: 1px solid #bbb; cursor: pointer; }
.dimension-actions button[type=submit] { background: #111; color: white; }
</style>

<style scoped>
@media (min-width: 901px) {
.left-half:not(.is-fullscreen):not(.pane-expanded) { flex: 0 0 max(0px, calc(var(--left-pane-width) - 4px)); transition: flex-basis 240ms cubic-bezier(.2,.8,.2,1); min-width: 0; border-right: 0; }
.is-dragging-divider .left-half { transition: none !important; }
.right-half:not(.is-fullscreen):not(.pane-expanded) { flex: 1 1 0; min-width: 0; }
.pane-expanded { flex: 1 1 100%; }
.pane-divider { flex: 0 0 8px; background: #111; cursor: col-resize; touch-action: none; display: grid; place-items: center; z-index: 50; }
.pane-divider span { width: 3px; height: 42px; border-radius: 4px; background: #aaa; }
.pane-divider:hover span, .pane-divider:focus-visible span { background: white; }
.pane-restore { position: absolute; z-index: 60; top: 50%; transform: translateY(-50%); width: 30px; height: 56px; border: 0; background: #111; color: white; font-size: 28px; cursor: col-resize; touch-action: none; display: grid; place-items: center; user-select: none; }
.split-viewport.collapsed-left::after, .split-viewport.collapsed-right::after { content: ''; position: absolute; top: 0; bottom: 0; width: 4px; background: rgba(255,255,255,.85); box-shadow: 0 0 12px 4px rgba(255,255,255,.7); z-index: 55; pointer-events: none; }
.split-viewport.collapsed-left::after { left: 0; }
.split-viewport.collapsed-right::after { right: 0; }
.pane-restore { box-shadow: 0 0 0 1px rgba(255,255,255,.8), 0 0 16px 4px rgba(255,255,255,.7); }
.pane-restore:focus-visible { outline: 2px solid #78baff; outline-offset: 3px; }
.pane-restore.left { left: 0; border-radius: 0 8px 8px 0; }
.pane-restore.right { right: 0; border-radius: 8px 0 0 8px; }
}
@media (max-width: 900px) { .pane-divider, .pane-restore { display: none; } }
@media (prefers-reduced-motion: reduce) { .left-half { transition: none !important; } }
</style>

<style scoped>
.results-drawer { position: absolute; right: 12px; top: 64px; bottom: 76px; width: min(270px, calc(100% - 52px)); z-index: 30; transition: transform .25s ease; pointer-events: none; }
.results-drawer.is-hidden { transform: translateX(calc(100% + 12px)); }
.results-drawer .cand-list { position: static; width: 100%; max-height: 100%; padding: 3px; box-sizing: border-box; overflow-y: auto; display: grid; gap: 7px; pointer-events: auto; }
.results-toggle { position: absolute; left: -25px; top: 50%; transform: translateY(-50%); width: 25px; height: 48px; padding: 0; border: 1px solid #ddd; border-radius: 8px 0 0 8px; background: #111; color: white; font-size: 25px; cursor: pointer; pointer-events: auto; box-shadow: 0 0 8px #fff9; }
.results-drawer .cand-card { padding: 7px; gap: 8px; box-shadow: 0 1px 4px #0002; align-items: center; }
.results-drawer .cand-thumb { width: 44px; height: 44px; }
.results-drawer .cand-main { font-size: 12.5px; gap: 3px; }
.results-drawer .cand-main b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.results-drawer .chip { font-size: 12.5px; }
@media (prefers-reduced-motion: reduce) { .results-drawer { transition: none; } }
</style>

<style scoped>
.earth-preview { width: 100%; height: 130px; margin-top: 10px; border-radius: 8px; background-size: 600% 100%; background-repeat: no-repeat; background-color: #292929; }
</style>

<style scoped>
.split-view-btn { right: 66px; color: #000; }
</style>

<style scoped>
.earth-preview-button { display: block; border: 0; position: relative; overflow: hidden; cursor: pointer; color: white; text-align: left; }
.earth-preview-button span { position: absolute; inset: auto 0 0; padding: 24px 10px 9px; background: linear-gradient(transparent,#000d); font-size: 13px; font-weight: 600; }
.earth-inspector { position: absolute; inset: 0; z-index: 45; background: #f7f7f5; color: #17191b; display: flex; flex-direction: column; overflow: hidden; }
.earth-inspector-header { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid #e1e4e8; background: white; }
.earth-inspector-header > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.earth-inspector-status { padding: 3px 8px; border-radius: 30px; background: #fce9a5; font-size: 12.5px; }
.earth-inspector-status.bad { background: #e2e8f0; } .earth-inspector-status.ok { background: #bbf7d0; }
.earth-back { display: flex; align-items: center; gap: 7px; border: 0; border-radius: 99px; padding: 4px 12px 4px 4px; background: #111; color: white; cursor: pointer; }
.earth-back img { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
.earth-inspector-content { overflow-y: auto; padding: 18px; }
.earth-context, .earth-muted { color: #617080; font-size: 13px; line-height: 1.5; }
.earth-comparison { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.earth-comparison figure { margin: 0; min-width: 0; background: white; border: 1px solid #e1e4e8; border-radius: 10px; overflow: hidden; }
.earth-comparison figure > img, .earth-comparison-candidate { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; background-color: #222; }
.earth-comparison-candidate { background-size: 600% 100%; background-repeat: no-repeat; }
.earth-comparison.ilila-profiles { grid-template-columns: minmax(0,1fr); }
.earth-comparison.ilila-profiles .earth-comparison-candidate { aspect-ratio: 11/4; background-color: white; }
.earth-comparison figcaption { padding: 9px; display: grid; gap: 4px; font-size: 13px; overflow-wrap: anywhere; }
.earth-comparison figcaption span { color: #617080; font-size: 12.5px; }
.earth-tabs { display: flex; gap: 5px; overflow-x: auto; margin-top: 18px; border-bottom: 1px solid #dce1e5; }
.earth-tabs button { flex: none; padding: 10px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #647080; cursor: pointer; }
.earth-tabs button.active { border-color: #111; color: #111; font-weight: 700; }
.earth-detail { padding: 8px 0 24px; font-size: 13px; line-height: 1.55; }
.earth-detail h2 { font-size: 17px; }
.earth-detail dl { margin: 0; }
.earth-detail dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #e1e4e8; }
.earth-detail dt { color: #617080; } .earth-detail dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.earth-table-wrap { overflow-x: auto; } .earth-detail table { border-collapse: collapse; width: 100%; text-align: left; } .earth-detail th, .earth-detail td { padding: 8px; border-bottom: 1px solid #ddd; }
@media (max-width: 500px) { .earth-comparison { grid-template-columns: 1fr; } }
</style>

<style scoped>
.transect-header { align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.transect-title { flex: 1 1 240px; min-width: 0; }
.screen-caption { padding: 8px 10px; margin: 0; border-radius: 8px; background: #fff; color: #475569; font-size: 13px; line-height: 1.5; }
.no-accepted-results { position: absolute; z-index: 5; top: 90px; right: 20px; max-width: 300px; padding: 16px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; }
.evidence-description { margin: 6px 0 0; color: #64748b; font-size: 13px; line-height: 1.5; white-space: normal; }
.transect-metrics { flex-wrap: wrap; gap: 12px; }
</style>

<style scoped>
.terrain-scale-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.terrain-scale-tabs button { padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; font: inherit; cursor: pointer; }
.terrain-scale-tabs button.active { background: #111; color: white; border-color: #111; }
.terrain-comparison-table th small { display: block; margin-top: 5px; max-width: 220px; font-size: 12.5px; line-height: 1.4; font-weight: normal; color: #64748b; }
.terrain-comparison-table td { white-space: nowrap; font-variant-numeric: tabular-nums; }
.terrain-source-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 16px; }
.terrain-source-grid article { padding: 12px; border: 1px solid #cbd5e1; border-radius: 10px; }
.terrain-source-grid p { margin: 7px 0; font-size: 13px; line-height: 1.5; }
.regional-terrain-context { margin-top: 16px; padding: 14px; border: 1px solid #e2c271; border-radius: 10px; background: #fffaf0; }
.regional-terrain-context h3 { margin-top: 0; font-size: 15px; }
.compare-candidates-cta { margin: 2px 0 12px; padding: 10px 14px; border-radius: 8px; border: 1px solid #111827; background: #111827; color: white; font: inherit; cursor: pointer; }
.earth-comparison.compact figure > img, .earth-comparison.compact .earth-comparison-candidate { height: 140px; aspect-ratio: auto; }
.earth-comparison:not(.compact):not(.ilila-profiles) figure > img, .earth-comparison:not(.compact):not(.ilila-profiles) .earth-comparison-candidate { height: 240px; aspect-ratio: auto; }
.overview-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 2px; }
.overview-chips > span { padding: 5px 10px; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 13px; }
.overview-chips .compare-candidates-cta { margin: 0 0 0 auto; }
.terrain-details { margin-top: 12px; font-size: 13.5px; }
.terrain-details > summary { cursor: pointer; font-weight: 600; color: #334155; margin-bottom: 8px; }
.earth-tabs { position: sticky; top: -18px; z-index: 3; background: #f8fafc; }
.results-drawer { width: min(310px, calc(100% - 52px)); }
.results-drawer .cand-card { display: block; padding: 15px; border-radius: 14px; }
.results-drawer .cand-main { width: 100%; gap: 6px; }
.candidate-card-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 3px; }
.candidate-ranking-score { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.candidate-ranking-score strong { font-size: 30px; line-height: 1.1; font-weight: 750; letter-spacing: -1px; }
.candidate-ranking-score > span { font-size: 13px; color: #64748b; }
.results-drawer .candidate-card-top .chip { padding: 4px 9px; font-size: 12.5px; line-height: 1.4; flex-shrink: 0; }
.results-drawer .cand-main .candidate-place-name { font-size: 14px; line-height: 1.4; white-space: normal; overflow: visible; }
.results-drawer .candidate-place-location { font-size: 13px; line-height: 1.5; }
.results-drawer .candidate-origin-distance { font-size: 12.5px; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
.lighting-planner-summary { display:grid;gap:5px;margin:8px 0;padding:10px 12px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;font-size:12.5px;line-height:1.5; }
.lighting-planner-summary button { justify-self:start;background:white;border:1px solid #94a3b8;border-radius:5px;padding:5px 8px;font:inherit;cursor:pointer; }
.candidate-light-window { display:grid;gap:3px;padding:8px;border-radius:6px;background:#eff6ff;color:#1e40af!important;line-height:1.5; }
.candidate-light-window span { font-size:12.5px; }
.lighting-settings-overlay { position:fixed;inset:10vh max(16px,calc((100vw - 720px)/2));z-index:200;overflow-y:auto;padding:18px;background:white;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 0 0 100vmax #0008; }
.close-lighting-settings { display:block;margin:0 0 12px auto;padding:7px 12px;background:#111827;color:white;border:0;border-radius:6px;cursor:pointer; }
.cave-recommendations-overlay { position:fixed;inset:5vh max(12px,calc((100vw - 860px)/2));z-index:200;overflow-y:auto;padding:24px;background:white;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 0 0 100vmax #0008; }
@media (max-width: 600px) { .terrain-source-grid { grid-template-columns: 1fr; } }
</style>
