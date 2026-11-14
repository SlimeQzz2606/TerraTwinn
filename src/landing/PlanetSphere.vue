<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// A draggable globe drawn on a 2D canvas from an equirectangular texture. Lighter than loading three.js on the landing page.
const props = defineProps<{ src: string; lon: number; lat: number; marker?: { lat: number; lon: number }; label: string }>()
const emit = defineEmits<{ drag: [] }>()

const N = 400 // render resolution; CSS scales it to the displayed size
const canvas = ref<HTMLCanvasElement | null>(null)
const fading = ref(false)
let ctx: CanvasRenderingContext2D | null = null
let tex: ImageData | null = null
let lon0 = props.lon
let velocity = 0
let raf = 0
let dragging = false
let lastX = 0
let lastT = 0
const rad = Math.PI / 180
const tilt = props.lat * rad

// Per-pixel values that do not change while the globe turns.
const dlon = new Float32Array(N * N)
const vTex = new Float32Array(N * N)
const shade = new Float32Array(N * N)
const alpha = new Uint8ClampedArray(N * N)
const out = new ImageData(N, N)

function prepare() {
  const R = N / 2 - 2
  const st = Math.sin(tilt), ct = Math.cos(tilt)
  const light = [-0.45, 0.4, 0.8]
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const i = py * N + px
      const x = (px + 0.5 - N / 2) / R, y = -(py + 0.5 - N / 2) / R
      const r2 = x * x + y * y
      const r = Math.sqrt(r2)
      alpha[i] = Math.max(0, Math.min(1, (1 - r) * R)) * 255
      if (r2 >= 1) continue
      const z = Math.sqrt(1 - r2)
      const yw = y * ct + z * st, zw = -y * st + z * ct
      dlon[i] = Math.atan2(x, zw)
      vTex[i] = 0.5 - Math.asin(Math.max(-1, Math.min(1, yw))) / Math.PI
      shade[i] = 0.5 + 0.5 * Math.max(0, x * light[0]! + y * light[1]! + z * light[2]!) - 0.12 * r2
    }
  }
}

function render() {
  if (!ctx || !tex) return
  const w = tex.width, h = tex.height, src = tex.data, dst = out.data
  for (let i = 0; i < N * N; i++) {
    const a = alpha[i]!
    const o = i * 4
    if (!a) { dst[o + 3] = 0; continue }
    let u = ((lon0 * rad + dlon[i]!) / (2 * Math.PI) + 0.5) % 1
    if (u < 0) u += 1
    const s = (((vTex[i]! * h) | 0) * w + ((u * w) | 0)) * 4
    const k = shade[i]!
    dst[o] = src[s]! * k; dst[o + 1] = src[s + 1]! * k; dst[o + 2] = src[s + 2]! * k; dst[o + 3] = a
  }
  ctx.putImageData(out, 0, 0)
  drawMarker()
}

function drawMarker() {
  if (!ctx || !props.marker) return
  const R = N / 2 - 2
  const la = props.marker.lat * rad, d = (props.marker.lon - lon0) * rad
  const xw = Math.cos(la) * Math.sin(d), yw = Math.sin(la), zw = Math.cos(la) * Math.cos(d)
  const st = Math.sin(tilt), ct = Math.cos(tilt)
  const yv = yw * ct - zw * st, zv = yw * st + zw * ct
  if (zv <= 0.05) return
  const cx = N / 2 + xw * R, cy = N / 2 - yv * R
  ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fillStyle = 'rgba(239,68,68,0.28)'; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, 7); ctx.fillStyle = '#ef4444'; ctx.fill()
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke()
}

function loadTexture(url: string) {
  return new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(img, 0, 0)
      tex = g.getImageData(0, 0, c.width, c.height)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

function glide() {
  cancelAnimationFrame(raf)
  const step = () => {
    velocity *= 0.94
    lon0 += velocity
    render()
    if (Math.abs(velocity) > 0.02 && !dragging) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

function down(e: PointerEvent) {
  dragging = true; lastX = e.clientX; lastT = performance.now(); velocity = 0
  cancelAnimationFrame(raf)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('drag')
}
function move(e: PointerEvent) {
  if (!dragging) return
  const el = e.currentTarget as HTMLElement
  const dDeg = -((e.clientX - lastX) / el.clientWidth) * 150 // ~150 degrees across the full width
  const now = performance.now()
  velocity = dDeg * (16 / Math.max(8, now - lastT))
  lon0 += dDeg; lastX = e.clientX; lastT = now
  render()
}
function up() { if (!dragging) return; dragging = false; if (Math.abs(velocity) > 0.05 && !matchMedia('(prefers-reduced-motion: reduce)').matches) glide() }
function key(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault(); lon0 += e.key === 'ArrowLeft' ? -12 : 12; render(); emit('drag')
}

onMounted(async () => {
  ctx = canvas.value!.getContext('2d')
  prepare()
  await loadTexture(props.src)
  render()
})
watch(() => props.src, async (url) => {
  fading.value = true
  await Promise.all([loadTexture(url), new Promise((r) => setTimeout(r, 140))])
  lon0 = props.lon; velocity = 0
  render()
  fading.value = false
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="sphere" :class="{ fading }" role="img" :aria-label="`${label}. Drag or use arrow keys to rotate.`" tabindex="0"
    @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key">
    <canvas ref="canvas" :width="N" :height="N"></canvas>
  </div>
</template>

<style scoped>
.sphere { width: 100%; aspect-ratio: 1; cursor: grab; touch-action: pan-y; user-select: none; border-radius: 50%;
  filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.18)); transition: opacity 0.14s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
.sphere:active { cursor: grabbing; transform: scale(0.99); }
.sphere.fading { opacity: 0; transform: scale(0.96); }
canvas { width: 100%; height: 100%; display: block; }
@media (prefers-reduced-motion: reduce) { .sphere { transition: none; } }
</style>
