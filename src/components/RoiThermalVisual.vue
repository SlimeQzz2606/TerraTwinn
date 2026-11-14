<script setup lang="ts">
// Thermal tab: the target's temperature range drawn on the same Kelvin axis as the Earth candidates' MODIS night-to-day means,
// plus THEMIS thermal inertia bars on Mars. Different quantities are labelled as such, never merged into one number.
import { computed } from 'vue'

interface Ctx { midrange_K: number; range_K: number; provenance?: string; source?: string; note?: string }
interface Ti { window_250m?: { mean?: number }; square_5km?: { mean?: number }; source_url?: string; note?: string }
interface Row { name: string; night: number; day: number }
const props = defineProps<{ name: string; context: Ctx | null; inertia: Ti | null; earth: Row[]; earthTotal?: number }>()

const K = 273.15
const target = computed(() => props.context ? { lo: props.context.midrange_K - props.context.range_K / 2, hi: props.context.midrange_K + props.context.range_K / 2, mid: props.context.midrange_K } : null)
const rows = computed(() => props.earth.map(r => ({ ...r, lo: r.night + K, hi: r.day + K })))
const axis = computed(() => {
  const vals = [...rows.value.flatMap(r => [r.lo, r.hi]), ...(target.value ? [target.value.lo, target.value.hi] : [])]
  if (!vals.length) return null
  const lo = Math.floor((Math.min(...vals) - 8) / 10) * 10, hi = Math.ceil((Math.max(...vals) + 8) / 10) * 10
  const ticks: number[] = []
  const step = (hi - lo) > 220 ? 50 : 25
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t)
  return { lo, hi, ticks, x: (v: number) => 150 + (v - lo) / (hi - lo) * 540 }
})
const height = computed(() => 40 + (target.value ? 36 : 0) + rows.value.length * 30)
const tiMax = computed(() => Math.max(1, props.inertia?.window_250m?.mean ?? 0, props.inertia?.square_5km?.mean ?? 0))
const provenance = computed(() => props.context?.provenance === 'model' ? 'Climate-model estimate' : props.context?.provenance === 'measured' ? 'Satellite-derived context' : 'Estimated context')
</script>

<template>
  <div class="thermal-visual">
    <template v-if="axis">
      <svg :viewBox="`0 0 720 ${height}`" role="img" :aria-label="`Temperature range of ${name} compared with Earth candidates`">
        <g v-for="t in axis.ticks" :key="t"><line :x1="axis.x(t)" y1="6" :x2="axis.x(t)" :y2="height - 26" stroke="#e2e8f0"/><text :x="axis.x(t)" :y="height - 8" font-size="12.5" text-anchor="middle" fill="#64748b">{{ t }} K</text></g>
        <g v-if="target">
          <text x="0" y="28" font-size="13.5" font-weight="700" fill="#0f172a">{{ name.length > 20 ? name.slice(0, 19) + '…' : name }}</text>
          <rect :x="axis.x(target.lo)" y="14" :width="axis.x(target.hi) - axis.x(target.lo)" height="22" rx="11" fill="#0f172a"/>
          <line :x1="axis.x(target.mid)" y1="10" :x2="axis.x(target.mid)" y2="40" stroke="#fde047" stroke-width="3"/>
          <text :x="axis.x(target.lo)" y="52" font-size="12.5" text-anchor="middle" fill="#334155">{{ target.lo.toFixed(0) }}</text>
          <text :x="axis.x(target.hi)" y="52" font-size="12.5" text-anchor="middle" fill="#334155">{{ target.hi.toFixed(0) }}</text>
        </g>
        <g v-for="(r, i) in rows" :key="r.name">
          <text x="0" :y="(target ? 86 : 38) + i * 30 - 6" font-size="13" fill="#0f172a">{{ r.name.length > 20 ? r.name.slice(0, 19) + '…' : r.name }}</text>
          <line :x1="axis.x(r.lo)" :y1="(target ? 86 : 38) + i * 30 - 10" :x2="axis.x(r.hi)" :y2="(target ? 86 : 38) + i * 30 - 10" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
          <circle :cx="axis.x(r.lo)" :cy="(target ? 86 : 38) + i * 30 - 10" r="7" fill="#2563eb"><title>Night mean {{ (r.lo - 273.15).toFixed(1) }} °C</title></circle>
          <circle :cx="axis.x(r.hi)" :cy="(target ? 86 : 38) + i * 30 - 10" r="7" fill="#dc2626"><title>Day mean {{ (r.hi - 273.15).toFixed(1) }} °C</title></circle>
        </g>
      </svg>
      <p class="th-legend"><span class="band"></span> {{ name }}: {{ provenance.toLowerCase() }}, lowest to highest value (yellow = mid-range) &nbsp; <span class="dot n"></span> Earth night mean &nbsp; <span class="dot d"></span> Earth day mean</p>
      <p v-if="!earth.length" class="th-note">Run “Find Terrestrial Analogs” to draw the Earth candidates on this axis.</p>
      <p v-else-if="earthTotal && earthTotal > earth.length" class="th-note">{{ earthTotal - earth.length }} of {{ earthTotal }} Earth candidates have no MODIS temperature record and are not drawn.</p>
    </template>
    <template v-if="inertia && (inertia.window_250m?.mean != null || inertia.square_5km?.mean != null)">
      <h4>THEMIS thermal inertia (tiu)</h4>
      <svg :viewBox="`0 0 720 84`" role="img" aria-label="THEMIS thermal inertia of the ROI and the surrounding 5 km">
        <g v-for="(b, i) in [{ label: '250 m ROI', v: inertia.window_250m?.mean }, { label: '5 km mean', v: inertia.square_5km?.mean }]" :key="b.label">
          <text x="0" :y="i * 36 + 28" font-size="13" fill="#0f172a">{{ b.label }}</text>
          <rect x="110" :y="i * 36 + 12" :width="b.v != null ? Math.max(3, b.v / tiMax * 520) : 0" height="22" rx="4" fill="#b45309"/>
          <text :x="116 + (b.v != null ? Math.max(3, b.v / tiMax * 520) : 0)" :y="i * 36 + 28" font-size="13" fill="#0f172a">{{ b.v ?? '—' }}</text>
        </g>
      </svg>
      <p class="th-note">Thermal inertia describes how fast the surface heats and cools (a surface-property proxy, not a temperature). Roughly 20 % product accuracy, 100 m pixels.</p>
    </template>
    <p v-if="!axis && !inertia" class="th-note">No verified thermal data is available for this location.</p>
    <p v-if="context" class="th-note">{{ context.source }}. {{ context.note }}</p>
  </div>
</template>

<style scoped>
.thermal-visual { width: 100%; display: grid; gap: 8px; text-align: left }
svg { width: 100%; height: auto; display: block }
h4 { margin: 8px 0 0; font-size: 14px }
.th-legend, .th-note { margin: 0; font-size: 13px; color: #475569; line-height: 1.5 }
.band { display: inline-block; width: 22px; height: 9px; border-radius: 5px; background: #0f172a; vertical-align: middle }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle }
.dot.n { background: #2563eb }
.dot.d { background: #dc2626 }
</style>
