<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ElevationSurface from './ElevationSurface.vue'

type Metric = 'ranking' | 'temperature' | 'slope' | 'roughness' | 'wind' | 'materials'
interface Candidate {
  rank: number; region: string; region_name?: string; admin1?: string; country?: string;
  composite?: number; final_score?: number; distance_km?: number | null;
  roughness?: { comparison?: { slope_p90_deg: number; roughness_rms_m: number; source: string; source_url: string } };
  environment?: { lst_modis?: { lst_day_mean_c?: number; lst_night_mean_c?: number; source?: string }; wind_era5?: { source?: string; stats?: { mean_speed_ms?: number } } };
  earth_environment?: { lithology?: string[]; minerals?: string; lithology_provenance?: string };
  terrain_description?: string;
}
const props = defineProps<{ candidates: Candidate[]; activeRegion: string; targetName: string; targetTerrain?: { slope_p90_deg?: number; roughness_rms_m?: number } | null; targetMaterials?: string[]; targetBody?: 'moon' | 'mars'; targetId?: string }>()
const selected = ref<string[]>([])
const metric = ref<Metric>('ranking')
const temperaturePeriod = ref<'day' | 'night'>('day')
const choices: { key: Metric; label: string }[] = [
  {key:'ranking',label:'Ranking score'}, {key:'temperature',label:'Temperature'},
  {key:'slope',label:'Slope'}, {key:'roughness',label:'Roughness'},
  {key:'wind',label:'Wind'}, {key:'materials',label:'Rock & terrain'},
]
watch(() => [props.candidates.map(c=>c.region).join('|'), props.activeRegion], () => {
  const valid = props.candidates.map(c=>c.region)
  selected.value = selected.value.filter(id=>valid.includes(id))
  if (!selected.value.length) selected.value = valid.slice(0,5)
  if (valid.includes(props.activeRegion) && !selected.value.includes(props.activeRegion)) {
    selected.value = [...selected.value.slice(0,4),props.activeRegion]
  }
}, {immediate:true})
const compared = computed(() => props.candidates.filter(c=>selected.value.includes(c.region)))
function toggle(id:string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(v=>v!==id)
    : [...selected.value.slice(0,4),id]
}
const name = (c:Candidate) => c.region_name ?? c.region.replace(/_/g,' ')
const label = (s:string) => s.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())
const colors=['#2563eb','#0f766e','#b45309','#7c3aed','#be185d']
const unit = computed(()=>({ranking:'/100',temperature:'°C',slope:'°',roughness:'m RMS',wind:'m/s',materials:''})[metric.value])
const explanation = computed(()=>({
  ranking:'Final saved ranking score, including the distance term when available. Higher scores rank ahead; this is not a probability.',
  temperature:'Regional MODIS land-surface temperature, averaged over 2018–2023 at about 1 km resolution. Day and night are separate observations, not daily minima or maxima. Planetary climate estimates use different methods and are not plotted as equivalent measurements.',
  slope:'Slope p90 on the common 30 m DEM grid, over a centered 240 m square. 90% of sampled slopes are below this value. Lower does not automatically mean a better terrain analog.',
  roughness:'Plane-residual RMS height on the common 30 m DEM grid, over a centered 240 m square. This describes resolved relief, not individual rocks.',
  wind:'ERA5 regional mean 10 m wind speed. Reanalysis grid cells are about 28 km wide; these values do not describe gusts at the exact ROI.',
  materials:'Regional rock and mineral classes from maps or literature. These are categories, not soil composition percentages or laboratory measurements. Terrain descriptions describe the catalog location.',
})[metric.value])
function value(c:Candidate):number|null {
  let v:number|undefined
  if(metric.value==='ranking') v=(c.final_score ?? c.composite) != null ? (c.final_score ?? c.composite)!*100 : undefined
  if(metric.value==='temperature') v=temperaturePeriod.value==='day' ? c.environment?.lst_modis?.lst_day_mean_c : c.environment?.lst_modis?.lst_night_mean_c
  if(metric.value==='slope') v=c.roughness?.comparison?.slope_p90_deg
  if(metric.value==='roughness') v=c.roughness?.comparison?.roughness_rms_m
  if(metric.value==='wind') v=c.environment?.wind_era5?.stats?.mean_speed_ms
  return v!=null&&Number.isFinite(v)?v:null
}
function source(c:Candidate) {
  if(metric.value==='temperature') return c.environment?.lst_modis?.source ?? 'Source unavailable'
  if(metric.value==='wind') return c.environment?.wind_era5?.source ?? 'Source unavailable'
  if(metric.value==='slope'||metric.value==='roughness') return `${c.roughness?.comparison?.source ?? 'No suitable DEM'} · 30 m grid / 240 m window`
  if(metric.value==='materials') return c.earth_environment?.lithology_provenance ?? 'No classification'
  return 'Saved multi-factor ranking; not a new calculation'
}
interface Grid { rows: number; cols: number; spacing_m: number; z_m: number[]; relief_m: number; native_shape: number[]; source: string }
const grids = ref<Record<string, Grid | null>>({})
const requested = new Set<string>()
async function loadGrid(key: string, body: string, id: string) {
  if (requested.has(key)) return
  requested.add(key)
  let data: Grid | null = null
  try {
    const r = await fetch(`/api/analogs/elevation?body=${body}&identifier=${encodeURIComponent(id)}`)
    data = r.ok ? await r.json() : null
  } catch { data = null }
  grids.value = { ...grids.value, [key]: data }   // merge only after the await: parallel loads must not overwrite each other
}
const showRelief = computed(() => metric.value === 'slope' || metric.value === 'roughness')
watch([compared, showRelief, () => props.targetId], () => {
  if (!showRelief.value) return
  compared.value.forEach(c => loadGrid(`earth:${c.region}`, 'earth', c.region))
  if (props.targetBody && props.targetId) loadGrid(`${props.targetBody}:${props.targetId}`, props.targetBody, props.targetId)
}, { immediate: true })
const reliefPanels = computed(() => {
  const out: { key: string; title: string; grid: Grid | null; loading: boolean }[] = []
  if (props.targetBody && props.targetId) {
    const k = `${props.targetBody}:${props.targetId}`
    out.push({ key: k, title: `${props.targetName} (target)`, grid: grids.value[k] ?? null, loading: !(k in grids.value) })
  }
  for (const c of compared.value) { const k = `earth:${c.region}`; out.push({ key: k, title: `#${c.rank} ${name(c)}`, grid: grids.value[k] ?? null, loading: !(k in grids.value) }) }
  return out
})
// one vertical exaggeration and one colour range for every panel, so rougher sites look rougher
const reliefMax = computed(() => Math.max(0.5, ...reliefPanels.value.map(p => p.grid?.relief_m ?? 0)))
const reliefScale = computed(() => Math.min(60, Math.max(1, Math.round(0.3 * 240 / reliefMax.value))))
const thermal = computed(() => {
  const rows = compared.value.map(c => ({ c, day: c.environment?.lst_modis?.lst_day_mean_c, night: c.environment?.lst_modis?.lst_night_mean_c }))
    .filter(r => r.day != null && r.night != null) as { c: Candidate; day: number; night: number }[]
  const lo = Math.min(0, ...rows.map(r => r.night)) - 2, hi = Math.max(...rows.map(r => r.day), 1) + 2
  return { rows, lo, hi, tx: (v: number) => 130 + (v - lo) / (hi - lo) * 560 }
})
const reference = computed(()=>metric.value==='slope'?props.targetTerrain?.slope_p90_deg:metric.value==='roughness'?props.targetTerrain?.roughness_rms_m:null)
const domain = computed(()=>{
  const values=compared.value.map(value).filter((v):v is number=>v!==null)
  if(reference.value!=null) values.push(reference.value)
  const min=Math.min(0,...values), max=metric.value==='ranking'?100:Math.max(0,...values)
  return {min,max:max===min?min+1:max}
})
const x = (v:number) => 16+(v-domain.value.min)/(domain.value.max-domain.value.min)*688
const chartHeight = computed(()=>compared.value.length*76+48)
const classes = computed(()=>Array.from(new Set([...(props.targetMaterials??[]),...compared.value.flatMap(c=>c.earth_environment?.lithology??[])])))
const formatted = (v:number|null|undefined) => v==null?'Unavailable':`${v.toFixed(metric.value==='ranking'||metric.value==='temperature'?1:2)} ${unit.value}`
function exportCsv() {
  const rows=[['Location','Province / region','Country','Metric','Value','Unit','Source'],...compared.value.map(c=>[name(c),c.admin1??'',c.country??'',metric.value,metric.value==='materials'?(c.earth_environment?.lithology??[]).join('; '):value(c)??'',unit.value,source(c)])]
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`terratwinn-comparison-${metric.value}.csv`;a.click();URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="candidate-comparison">
    <div class="comparison-heading"><div><h2>Compare Earth candidates</h2><p>Compare all 5 locations from your Top 5, or select a smaller group.</p></div><button class="export-comparison" :disabled="!compared.length" @click="exportCsv">Download CSV</button></div>
    <fieldset class="comparison-picker"><legend>Locations · {{ selected.length }}/5 selected</legend><label v-for="c in candidates" :key="c.region" :class="{chosen:selected.includes(c.region)}"><input type="checkbox" :checked="selected.includes(c.region)" @change="toggle(c.region)"><span>#{{c.rank}} {{name(c)}}</span></label></fieldset>
    <div class="comparison-metrics" role="group" aria-label="Comparison metric"><button v-for="choice in choices" :key="choice.key" :aria-pressed="metric===choice.key" :class="{active:metric===choice.key}" @click="metric=choice.key">{{choice.label}}</button></div>
    <div v-if="metric==='temperature'" class="temperature-period" role="group" aria-label="Temperature period"><button :aria-pressed="temperaturePeriod==='day'" @click="temperaturePeriod='day'">Daytime surface</button><button :aria-pressed="temperaturePeriod==='night'" @click="temperaturePeriod='night'">Nighttime surface</button></div>
    <p class="comparison-explanation">{{explanation}}</p>
    <p v-if="!compared.length" class="comparison-empty">Select a location to begin comparing.</p>
    <template v-else-if="metric!=='materials'">
      <div class="comparison-chart">
        <svg :viewBox="`0 0 720 ${chartHeight}`" role="img" :aria-label="`${choices.find(c=>c.key===metric)?.label} for ${compared.length} Earth candidates`">
          <line :x1="x(0)" y1="16" :x2="x(0)" :y2="chartHeight-28" stroke="#cbd5e1"/>
          <g v-for="(c,i) in compared" :key="c.region">
            <text x="16" :y="i*76+18" fill="#0f172a" font-size="13" font-weight="600">#{{c.rank}} {{name(c)}}</text>
            <rect x="16" :y="i*76+30" width="688" height="24" rx="4" fill="#f1f5f9"/>
            <rect v-if="value(c)!==null" :x="Math.min(x(0),x(value(c)!))" :y="i*76+30" :width="Math.max(1,Math.abs(x(value(c)!)-x(0)))" height="24" rx="4" :fill="colors[i]"><title>{{name(c)}}: {{formatted(value(c))}} · {{source(c)}}</title></rect>
            <text x="704" :y="i*76+70" text-anchor="end" fill="#334155" font-size="12">{{formatted(value(c))}}</text>
          </g>
          <line v-if="reference!=null" :x1="x(reference)" y1="23" :x2="x(reference)" :y2="chartHeight-30" stroke="#111827" stroke-dasharray="5 4" stroke-width="2"/>
          <text x="16" :y="chartHeight-5" font-size="11" fill="#64748b">{{domain.min.toFixed(1)}} {{unit}}</text><text x="704" :y="chartHeight-5" font-size="11" text-anchor="end" fill="#64748b">{{domain.max.toFixed(1)}} {{unit}}</text>
        </svg>
      </div>
      <div v-if="metric==='temperature' && thermal.rows.length" class="comparison-chart thermal-range">
        <svg :viewBox="`0 0 720 ${thermal.rows.length * 34 + 40}`" role="img" aria-label="Night to day surface temperature range per candidate">
          <line :x1="thermal.tx(0)" y1="6" :x2="thermal.tx(0)" :y2="thermal.rows.length * 34 + 8" stroke="#cbd5e1" stroke-dasharray="3 3"/>
          <g v-for="(r,i) in thermal.rows" :key="r.c.region">
            <text x="0" :y="i*34+24" font-size="13" fill="#0f172a">#{{r.c.rank}} {{name(r.c)}}</text>
            <line :x1="thermal.tx(r.night)" :y1="i*34+19" :x2="thermal.tx(r.day)" :y2="i*34+19" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
            <circle :cx="thermal.tx(r.night)" :cy="i*34+19" r="7" fill="#2563eb"><title>Night {{r.night.toFixed(1)}} °C</title></circle>
            <circle :cx="thermal.tx(r.day)" :cy="i*34+19" r="7" fill="#dc2626"><title>Day {{r.day.toFixed(1)}} °C</title></circle>
          </g>
          <text :x="thermal.tx(thermal.lo)" :y="thermal.rows.length*34+30" font-size="12" fill="#64748b">{{thermal.lo.toFixed(0)}} °C</text>
          <text :x="thermal.tx(thermal.hi)" :y="thermal.rows.length*34+30" font-size="12" text-anchor="end" fill="#64748b">{{thermal.hi.toFixed(0)}} °C</text>
          <text x="130" :y="thermal.rows.length*34+30" font-size="12" fill="#64748b" dx="60"><tspan fill="#2563eb">night</tspan> to <tspan fill="#dc2626">day</tspan> mean</text>
        </svg>
      </div>
      <p v-if="metric==='temperature' && thermal.rows.length && thermal.rows.length < compared.length" class="relief-note">{{ compared.length - thermal.rows.length }} of {{ compared.length }} selected locations have no MODIS temperature record and are not drawn.</p>
      <div v-if="showRelief" class="relief-block">
        <h3>3D relief of each ROI</h3>
        <div class="relief-grid">
          <figure v-for="p in reliefPanels" :key="p.key">
            <ElevationSurface v-if="p.grid" :grid="p.grid" :scale="reliefScale" :relief-max="reliefMax" :label="p.title" />
            <div v-else class="relief-empty">{{ p.loading ? 'Loading DEM…' : 'No local DEM for this location' }}</div>
            <figcaption><strong>{{ p.title }}</strong><span v-if="p.grid">{{ p.grid.relief_m.toFixed(1) }} m relief · {{ p.grid.native_shape.join('×') }} cells at {{ p.grid.spacing_m.toFixed(1) }} m</span></figcaption>
          </figure>
        </div>
        <p class="relief-note">Every panel uses the same colour range (0 to {{ reliefMax.toFixed(1) }} m above the lowest cell) and the same vertical exaggeration (×{{ reliefScale }}). Drag to rotate. Earth candidates use the common 30 m DEM grid (8×8 cells), so their surfaces are coarse; planetary targets use their native DEM resampled for display.</p>
      </div>
      <p v-if="metric==='slope'||metric==='roughness'" class="comparison-reference">{{reference!=null?`Dashed reference: ${targetName} · ${formatted(reference)}`:'No comparable local planetary DEM; no reference line is drawn.'}}</p>
      <div class="comparison-table-wrap"><table><thead><tr><th>Location</th><th>Value</th><th>Source / scale</th></tr></thead><tbody><tr v-for="c in compared" :key="c.region"><th>{{name(c)}}<small>{{[c.admin1,c.country].filter(Boolean).join(', ')}}</small></th><td>{{formatted(value(c))}}</td><td>{{source(c)}}</td></tr></tbody></table></div>
    </template>
    <template v-else>
      <div v-if="classes.length" class="comparison-table-wrap"><table class="materials-matrix"><caption>Presence in the reported regional classification; a dash means not reported, not proven absence.</caption><thead><tr><th>Location</th><th v-for="cls in classes" :key="cls">{{label(cls)}}</th></tr></thead><tbody><tr v-if="targetMaterials?.length"><th>{{targetName}} · target</th><td v-for="cls in classes" :key="cls">{{targetMaterials.includes(cls)?'Reported':'—'}}</td></tr><tr v-for="c in compared" :key="c.region"><th>{{name(c)}}</th><td v-for="cls in classes" :key="cls"><span :class="{present:c.earth_environment?.lithology?.includes(cls)}">{{c.earth_environment?.lithology?.includes(cls)?'Reported':'—'}}</span></td></tr></tbody></table></div>
      <article v-for="c in compared" :key="c.region" class="material-description"><h3>{{name(c)}}</h3><p><strong>Rock / minerals:</strong> {{c.earth_environment?.minerals||'Not documented'}}</p><p><strong>Terrain:</strong> {{c.terrain_description||'No catalog description'}}</p><small>Classification source: {{source(c)}}. No laboratory soil measurements are available here.</small></article>
    </template>
  </section>
</template>

<style scoped>
.candidate-comparison { color:#0f172a; }
.comparison-heading {display:flex;justify-content:space-between;align-items:start;gap:12px}.comparison-heading h2{margin:0 0 6px;font-size:20px}.comparison-heading p{margin:0;color:#64748b}
button{font:inherit;cursor:pointer}button:disabled{cursor:default;opacity:.5}.export-comparison{border:1px solid #cbd5e1;background:white;border-radius:8px;padding:8px 12px;white-space:nowrap}
.comparison-picker{border:0;padding:0;margin:20px 0;display:flex;flex-wrap:wrap;gap:8px}.comparison-picker legend{font-size:13px;color:#64748b;margin-bottom:8px}.comparison-picker label{display:flex;align-items:center;gap:7px;border:1px solid #cbd5e1;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer}.comparison-picker label.chosen{background:#eff6ff;border-color:#93c5fd}.comparison-picker input{accent-color:#2563eb}
.comparison-metrics,.temperature-period{display:flex;gap:7px;flex-wrap:wrap}.comparison-metrics button,.temperature-period button{border:1px solid #cbd5e1;background:white;border-radius:8px;padding:8px 11px}.comparison-metrics button.active{background:#111827;color:white;border-color:#111827}.temperature-period{margin-top:12px}.temperature-period button[aria-pressed=true]{border-color:#2563eb;color:#1d4ed8;background:#eff6ff}
.comparison-explanation,.comparison-reference{font-size:13px;line-height:1.6;color:#475569}.comparison-chart{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px;overflow-x:auto}.comparison-chart svg{display:block;width:100%;min-width:540px;height:auto}.comparison-reference{border-left:2px dashed #111827;padding-left:10px}
.comparison-table-wrap{overflow-x:auto;margin-top:16px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}td{line-height:1.5}th small{display:block;font-weight:normal;color:#64748b;margin-top:4px}caption{text-align:left;color:#64748b;padding-bottom:10px;font-size:13px}.present{background:#dcfce7;color:#166534;border-radius:4px;padding:3px 6px}.materials-matrix td{white-space:nowrap}.material-description{padding:12px 0;border-bottom:1px solid #e2e8f0}.material-description h3{font-size:14px;margin:0}.material-description p{font-size:13px;line-height:1.5}.material-description small{color:#64748b}.comparison-empty{padding:24px;border:1px dashed #cbd5e1;border-radius:10px}
.relief-block h3{margin:22px 0 10px;font-size:16px}.relief-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.relief-grid figure{margin:0;border:1px solid #e2e8f0;border-radius:10px;padding:8px;background:#fff}.relief-grid figcaption{display:flex;flex-direction:column;gap:2px;margin-top:8px;font-size:13px}.relief-grid figcaption span{color:#64748b}.relief-empty{height:190px;display:grid;place-items:center;border-radius:8px;background:#f1f5f9;color:#64748b;font-size:13px}.relief-note{font-size:13px;color:#64748b;line-height:1.6}.thermal-range{margin-top:12px}
@media(max-width:600px){.comparison-heading{flex-wrap:wrap}.comparison-chart{padding:6px}.comparison-metrics button{font-size:13px}}
</style>
