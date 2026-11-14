<script setup lang="ts">
// Slope / DEM tab: the DEM-derived slope map next to a 3D relief of the same area. Numbers are only captions.
// Without a 250 m DEM the stored 10 km regional MOLA / LOLA grid is drawn instead, and labelled as regional context.
import { computed, nextTick, ref, watch } from 'vue'
import ElevationSurface from './ElevationSurface.vue'

interface Terrain { image_url?: string; slope_p90_deg: number; slope_mean_deg: number; elevation_range_m: number; baseline_m: number; posting_m: number; source: string; source_url?: string }
interface Regional { slope_p90_deg: number; slope_mean_deg: number; elevation_range_m: number; source?: string; source_url?: string; native_posting_m?: number; n_valid?: number }
interface Grid { rows: number; cols: number; spacing_m: number; z_m: number[]; relief_m: number; native_shape: number[] }
const props = defineProps<{ body: 'moon' | 'mars'; id: string; name: string; terrain: Terrain | null; regional?: Regional | null; note?: string }>()

const scope = computed<'roi' | 'regional' | null>(() => props.terrain ? 'roi' : props.regional?.n_valid ? 'regional' : null)
const grid = ref<Grid | null>(null)
const state = ref<'loading' | 'ready' | 'none'>('loading')
const canvas = ref<HTMLCanvasElement | null>(null)
let token = 0

// same fixed 0..45 degree palette as the stored slope maps
const STOPS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]]
function colour(t: number): [number, number, number] {
  const x = Math.min(0.9999, Math.max(0, t)) * 4, i = Math.floor(x), f = x - i
  return [0, 1, 2].map(k => STOPS[i][k] + (STOPS[i + 1][k] - STOPS[i][k]) * f) as [number, number, number]
}
async function drawSlope() {
  await nextTick()
  const g = grid.value, c = canvas.value
  if (!g || !c) return
  const { rows, cols, spacing_m: s, z_m: z } = g
  c.width = cols; c.height = rows
  const ctx = c.getContext('2d')!, img = ctx.createImageData(cols, rows)
  const at = (r: number, k: number) => z[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, k))]
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const gx = (at(r, k + 1) - at(r, k - 1)) / (2 * s), gy = (at(r + 1, k) - at(r - 1, k)) / (2 * s)
    const deg = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI
    const [R, G, B] = colour(deg / 45)
    img.data.set([R, G, B, 255], (r * cols + k) * 4)
  }
  ctx.putImageData(img, 0, 0)
}

watch(() => [props.body, props.id, scope.value], async () => {
  const mine = ++token
  grid.value = null
  if (!scope.value) { state.value = 'none'; return }
  state.value = 'loading'
  try {
    const r = await fetch(`/api/analogs/elevation?body=${props.body}&identifier=${encodeURIComponent(props.id)}&scope=${scope.value}`)
    const data = r.ok ? await r.json() : null
    if (mine !== token) return
    grid.value = data; state.value = data ? 'ready' : 'none'
    if (data && scope.value === 'regional') drawSlope()
  } catch { if (mine === token) state.value = 'none' }
}, { immediate: true })

const reliefMax = computed(() => Math.max(0.5, grid.value?.relief_m ?? 0.5))
// a flat area would be invisible at true scale: exaggerate so the relief spans about 30 % of the width, capped at 40x
const extent = computed(() => grid.value ? Math.max(grid.value.rows, grid.value.cols) * grid.value.spacing_m : 240)
const scale = computed(() => Math.min(40, Math.max(1, Math.round(0.3 * extent.value / reliefMax.value))))
const stats = computed(() => props.terrain
  ? [{ v: props.terrain.slope_p90_deg.toFixed(2) + '°', l: 'slope p90' }, { v: props.terrain.slope_mean_deg + '°', l: 'mean slope' },
     { v: props.terrain.elevation_range_m + ' m', l: 'relief' }, { v: props.terrain.posting_m.toFixed(1) + ' m', l: 'DEM grid' }]
  : props.regional
    ? [{ v: props.regional.slope_p90_deg.toFixed(2) + '°', l: 'slope p90 (10 km)' }, { v: props.regional.slope_mean_deg + '°', l: 'mean slope' },
       { v: props.regional.elevation_range_m + ' m', l: 'relief over 10 km' }, { v: (props.regional.native_posting_m ?? 463).toFixed(0) + ' m', l: 'native grid' }]
    : [])
const link = computed(() => props.terrain?.source_url ? { href: props.terrain.source_url, text: `${props.terrain.source} · source raster` }
  : props.regional?.source_url ? { href: props.regional.source_url, text: `${props.regional.source ?? 'Regional DEM'} · source raster` } : null)
</script>

<template>
  <div class="terrain-visual">
    <template v-if="scope">
      <p v-if="scope === 'regional'" class="tv-banner">No 250 m DEM exists for this site. Showing the <b>regional</b> {{ regional?.source ?? 'DEM' }} (10 km square, coarse grid). The 250 m ROI is a small area at the centre, so this describes the surroundings, not the ROI itself.</p>
      <div class="tv-figures">
        <figure>
          <img v-if="scope === 'roi' && terrain?.image_url" :src="terrain.image_url" :alt="`DEM-derived slope map of ${name}, purple 0 degrees to yellow 45 degrees`" />
          <canvas v-else-if="scope === 'regional' && grid" ref="canvas" class="tv-canvas" role="img" :aria-label="`Regional slope map of ${name}`"></canvas>
          <div v-else class="tv-empty">{{ state === 'loading' ? 'Loading…' : 'Slope map unavailable' }}</div>
          <div class="tv-legend" aria-hidden="true"><i></i><span>0°</span><span>45°</span></div>
          <figcaption>Slope map{{ scope === 'regional' ? ' · regional, 10 km' : '' }}</figcaption>
        </figure>
        <figure>
          <ElevationSurface v-if="grid" :grid="grid" :scale="scale" :relief-max="reliefMax" :label="name" />
          <div v-else class="tv-empty">{{ state === 'loading' ? 'Loading DEM…' : 'No DEM grid for 3D' }}</div>
          <div class="tv-legend height" aria-hidden="true"><i></i><span>0 m</span><span>{{ reliefMax.toFixed(1) }} m</span></div>
          <figcaption>3D relief · drag to rotate<span v-if="grid"> · vertical ×{{ scale }}</span></figcaption>
        </figure>
      </div>
      <ul class="tv-stats"><li v-for="s in stats" :key="s.l"><b>{{ s.v }}</b> {{ s.l }}</li></ul>
      <a v-if="link" :href="link.href" target="_blank" rel="noreferrer">{{ link.text }}</a>
    </template>
    <p v-else class="tv-none">{{ note ?? 'No verified high-resolution DEM window is available at this exact location, so no slope map or 3D relief can be drawn.' }}</p>
  </div>
</template>

<style scoped>
.terrain-visual { display: grid; gap: 12px; width: 100% }
.tv-figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px }
figure { margin: 0; display: grid; gap: 6px; justify-items: center }
figure > img, .tv-canvas { width: 100%; max-width: 280px; aspect-ratio: 1; object-fit: contain; border-radius: 8px; background: #f1f5f9; image-rendering: pixelated }
figure > :deep(.elevation-surface) { max-width: 300px; height: 230px }
figcaption { font-size: 13px; color: #475569 }
.tv-empty { width: 100%; max-width: 280px; height: 230px; display: grid; place-items: center; border-radius: 8px; background: #f1f5f9; color: #64748b; font-size: 13px }
.tv-legend { display: grid; grid-template-columns: 1fr auto; width: 100%; max-width: 280px; font-size: 12.5px; color: #64748b }
.tv-legend i { grid-column: 1 / -1; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #440154, #3b528b, #21908c, #5dc863, #fde725) }
.tv-legend.height i { background: linear-gradient(90deg, #2b55b0, #21a39e, #f7d640, #cc5433) }
.tv-legend span:nth-of-type(2) { text-align: right }
.tv-legend span:first-of-type { grid-column: 1 }
.tv-banner { margin: 0; padding: 8px 10px; border-radius: 8px; background: #fef3c7; color: #78350f; font-size: 13px; line-height: 1.5; text-align: left }
.tv-stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; list-style: none; padding: 0; margin: 0; font-size: 13px; color: #475569 }
.tv-stats b { color: #0f172a; font-size: 15px }
.tv-none { margin: 0; color: #64748b; font-size: 14px; line-height: 1.5 }
</style>
