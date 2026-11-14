<script setup lang="ts">
// Terrain tab: planetary target and Earth candidate side by side (3D relief, shared colour range and vertical scale),
// then one pair of bars per DEM measurement. The numeric table stays available in the parent, folded.
import { computed, ref, watch } from 'vue'
import ElevationSurface from './ElevationSurface.vue'

interface Grid { rows: number; cols: number; spacing_m: number; z_m: number[]; relief_m: number; native_shape: number[]; scope?: string }
type Stats = Record<string, number | undefined> | null
interface Row { key: string; label: string; unit: string }
const props = defineProps<{ body: 'moon' | 'mars'; targetId: string; targetName: string; earthId: string; earthName: string; rows: readonly Row[]; target: Stats; earth: Stats; regional?: boolean }>()

const grids = ref<{ target: Grid | null; earth: Grid | null; loading: boolean }>({ target: null, earth: null, loading: true })
let token = 0
async function grab(url: string): Promise<Grid | null> {
  try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null }
}
watch(() => [props.body, props.targetId, props.earthId, props.regional], async () => {
  const mine = ++token
  grids.value = { target: null, earth: null, loading: true }
  const [t, e] = await Promise.all([
    grab(`/api/analogs/elevation?body=${props.body}&identifier=${encodeURIComponent(props.targetId)}&scope=${props.regional ? 'regional' : 'roi'}`),
    grab(`/api/analogs/elevation?body=earth&identifier=${encodeURIComponent(props.earthId)}`),
  ])
  if (mine === token) grids.value = { target: t, earth: e, loading: false }
}, { immediate: true })

// one colour range and one vertical exaggeration for both panels; a regional target is drawn on its own scale (10 km vs 240 m)
const sameScale = computed(() => !props.regional)
const reliefMax = computed(() => Math.max(0.5, grids.value.earth?.relief_m ?? 0, sameScale.value ? grids.value.target?.relief_m ?? 0 : 0))
const scaleFor = (g: Grid, max: number) => Math.min(40, Math.max(1, Math.round(0.3 * Math.max(g.rows, g.cols) * g.spacing_m / max)))
const earthScale = computed(() => grids.value.earth ? scaleFor(grids.value.earth, reliefMax.value) : 1)
const targetMax = computed(() => sameScale.value ? reliefMax.value : Math.max(0.5, grids.value.target?.relief_m ?? 0.5))
const targetScale = computed(() => grids.value.target ? (sameScale.value ? earthScale.value : scaleFor(grids.value.target, targetMax.value)) : 1)

const bars = computed(() => props.rows.map(r => {
  const a = props.target?.[r.key], b = props.earth?.[r.key]
  const max = Math.max(1e-9, a ?? 0, b ?? 0)
  return { ...r, a, b, wa: a != null ? Math.max(1.5, a / max * 100) : 0, wb: b != null ? Math.max(1.5, b / max * 100) : 0 }
}))
const fmt = (v: number | undefined, unit: string) => v != null && Number.isFinite(v) ? `${v.toFixed(2)} ${unit}` : '—'
const planet = computed(() => props.body === 'moon' ? 'Moon' : 'Mars')
</script>

<template>
  <div class="relief-pair">
    <div class="rp-figures">
      <figure>
        <ElevationSurface v-if="grids.target" :grid="grids.target" :scale="targetScale" :relief-max="targetMax" :label="targetName" />
        <div v-else class="rp-empty">{{ grids.loading ? 'Loading DEM…' : 'No DEM for this site' }}</div>
        <figcaption><b>{{ planet }} · {{ targetName }}</b><span v-if="grids.target">{{ grids.target.relief_m.toFixed(1) }} m relief{{ regional ? ' · regional 10 km' : '' }}</span></figcaption>
      </figure>
      <figure>
        <ElevationSurface v-if="grids.earth" :grid="grids.earth" :scale="earthScale" :relief-max="reliefMax" :label="earthName" />
        <div v-else class="rp-empty">{{ grids.loading ? 'Loading DEM…' : 'No DEM for this candidate' }}</div>
        <figcaption><b>Earth · {{ earthName }}</b><span v-if="grids.earth">{{ grids.earth.relief_m.toFixed(1) }} m relief · 240 m window</span></figcaption>
      </figure>
    </div>
    <p class="rp-note">{{ regional ? `No 250 m DEM exists for this ${planet} site: its panel shows the 10 km regional DEM on its own vertical scale.` : `Same colour range and vertical exaggeration (×${earthScale}) in both panels. Drag to rotate.` }}</p>
    <ul class="rp-bars">
      <li v-for="r in bars" :key="r.key">
        <span class="rp-label">{{ r.label }}</span>
        <span class="rp-track"><b class="t" :style="{ width: r.wa + '%' }"></b></span><em>{{ fmt(r.a, r.unit) }}</em>
        <span class="rp-track"><b class="e" :style="{ width: r.wb + '%' }"></b></span><em>{{ fmt(r.b, r.unit) }}</em>
      </li>
    </ul>
    <p class="rp-legend"><i class="t"></i> {{ planet }} ROI <i class="e"></i> Earth candidate · values on the common 30 m grid</p>
  </div>
</template>

<style scoped>
.relief-pair { display: grid; gap: 10px; margin: 6px 0 4px }
.rp-figures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px }
figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px; background: #fff }
figure :deep(.elevation-surface) { height: 200px }
figcaption { display: grid; gap: 2px; margin-top: 6px; font-size: 13px }
figcaption span { color: #64748b }
.rp-empty { height: 200px; display: grid; place-items: center; border-radius: 8px; background: #f1f5f9; color: #64748b; font-size: 13px }
.rp-note, .rp-legend { margin: 0; font-size: 12.5px; color: #64748b }
.rp-bars { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px }
.rp-bars li { display: grid; grid-template-columns: 130px 1fr 78px; gap: 3px 10px; align-items: center; font-size: 13.5px }
.rp-label { grid-row: span 2 }
.rp-track { height: 9px; border-radius: 5px; background: #f1f5f9; overflow: hidden }
.rp-track b { display: block; height: 100%; border-radius: 5px }
.t { background: #0f172a } .e { background: #2563eb }
.rp-bars em { font-style: normal; text-align: right; color: #334155; font-variant-numeric: tabular-nums; font-size: 12.5px }
.rp-legend i { display: inline-block; width: 12px; height: 8px; border-radius: 4px; vertical-align: middle; margin: 0 2px 0 8px }
@media (max-width: 520px) { .rp-figures { grid-template-columns: 1fr } }
</style>
