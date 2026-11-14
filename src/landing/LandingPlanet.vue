<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Globe, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'

const props = defineProps<{ src: string; lon: number; lat: number; label: string; atmosphere?: boolean; focusProgress?: number; demo?: { lat: number; lng: number; title: string; description: string; image: string; sprite?: boolean } }>()
const emit = defineEmits<{ ready: [] }>()
const host = ref<HTMLDivElement | null>(null)
let globe: GlobeInstance | null = null
let observer: ResizeObserver | null = null
let focusOrigin: { lat: number; lng: number; altitude: number } | null = null
function focusDemo() {
  if (!globe || !props.demo) return
  const t = props.focusProgress ?? 0
  globe.controls().autoRotate = t === 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches
  if (t > 0) {
    if (!focusOrigin) focusOrigin = globe.pointOfView()
    const delta = ((props.demo.lng - focusOrigin.lng + 540) % 360) - 180
    globe.pointOfView({ lat: focusOrigin.lat + (props.demo.lat - focusOrigin.lat) * t, lng: focusOrigin.lng + delta * t, altitude: 1.7 }, 0)
  } else focusOrigin = null
  globe.htmlElementsData(t > .8 ? [props.demo] : [])
}
watch(() => props.focusProgress, (next, previous) => {
  if (globe && props.demo && (previous ?? 0) === 0 && (next ?? 0) > .9) {
    globe.controls().autoRotate = false
    focusOrigin = { lat: props.demo.lat, lng: props.demo.lng, altitude: 1.7 }
    globe.pointOfView({ lat: props.demo.lat, lng: props.demo.lng, altitude: 1.7 }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200)
    window.setTimeout(() => { if (globe && props.demo && (props.focusProgress ?? 0) > .8) globe.htmlElementsData([props.demo]) }, 1200)
  } else focusDemo()
})
watch(() => props.demo, (demo) => {
  if (!globe || !demo || (props.focusProgress ?? 0) <= .8) return
  globe.htmlElementsData([])
  focusOrigin = { lat: demo.lat, lng: demo.lng, altitude: 1.7 }
  globe.pointOfView({ lat: demo.lat, lng: demo.lng, altitude: 1.7 }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200)
  window.setTimeout(() => { if (globe && props.demo === demo && (props.focusProgress ?? 0) > .8) globe.htmlElementsData([demo]) }, 1200)
})
function rotate(event: KeyboardEvent) {
  if (!globe || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const point = globe.pointOfView()
  globe.pointOfView({ ...point, lng: point.lng + (event.key === 'ArrowLeft' ? -12 : event.key === 'ArrowRight' ? 12 : 0), lat: Math.max(-85, Math.min(85, point.lat + (event.key === 'ArrowUp' ? 10 : event.key === 'ArrowDown' ? -10 : 0))) }, 0)
}
onMounted(() => {
  if (!host.value) return
  globe = new Globe(host.value, { animateIn: false, rendererConfig: { alpha: true, antialias: true } })
    .width(host.value.clientWidth).height(host.value.clientHeight)
    .backgroundColor('rgba(0,0,0,0)').globeImageUrl(props.src)
    .showAtmosphere(!!props.atmosphere).atmosphereColor('#7cbaff').atmosphereAltitude(.08)
    .onGlobeReady(() => emit('ready'))
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  globe.pointOfView({ lat: props.lat, lng: props.lon, altitude: 1.7 }, 0)
  const light = new THREE.DirectionalLight('#fff0d8', 2.4)
  light.position.set(0, 300, 150)
  globe.lights([new THREE.AmbientLight('#aebad0', .35), light])
  globe.htmlElementsData([]).htmlLat('lat').htmlLng('lng').htmlAltitude(.015).htmlElement(() => {
    const anchor = document.createElement('div')
    anchor.className = 'landing-demo-anchor'
    const pin = document.createElement('div'); pin.className = 'landing-demo-pin'; anchor.append(pin)
    const card = document.createElement('div'); card.className = 'landing-demo-card'
    const title = document.createElement('strong'); title.textContent = props.demo?.title ?? ''; card.append(title)
    const text = document.createElement('p'); text.textContent = props.demo?.description ?? ''; card.append(text)
    const photo = document.createElement('div'); photo.className = 'landing-demo-photo'
    const img = document.createElement('img'); img.src = props.demo?.image ?? ''; img.alt = props.demo?.title ?? ''; img.draggable = false
    if (props.demo?.sprite) img.className = 'sprite-first-candidate'
    img.onerror = () => { photo.replaceChildren(); const fallback = document.createElement('small'); fallback.textContent = 'Site imagery unavailable'; photo.append(fallback) }
    photo.append(img); card.append(photo); anchor.append(card)
    return anchor
  })
  const controls = globe.controls()
  controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches
  controls.autoRotateSpeed = 0.35
  controls.enableZoom = false
  controls.enablePan = false
  controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches
  controls.dampingFactor = .045
  controls.rotateSpeed = .65
  observer = new ResizeObserver(([entry]) => {
    if (entry && globe) globe.width(entry.contentRect.width).height(entry.contentRect.height)
  })
  observer.observe(host.value)
  focusDemo()
})
onBeforeUnmount(() => { observer?.disconnect(); globe?._destructor(); globe = null })
</script>

<template>
  <div ref="host" class="landing-planet" tabindex="0" role="group" :aria-label="`${label}. Drag or use arrow keys to rotate.`" @keydown="rotate"></div>
</template>

<style scoped>
.landing-planet { width: 100%; height: 100%; border-radius: 50%; overflow: visible; cursor: grab; touch-action: none; }
.landing-planet:active { cursor: grabbing; }
.landing-planet:focus-visible { outline: 2px solid #d9e6ff; outline-offset: -6px; }
</style>

<style>
.landing-demo-anchor { position: relative; pointer-events: none; }
.landing-demo-pin { width: 12px; height: 12px; border-radius: 50%; background: #ff665b; border: 2px solid white; box-shadow: 0 0 12px #ff665b80; transform: translate(-50%,-50%); }
.landing-demo-card { position: absolute; left: 0; bottom: 24px; transform: translateX(-50%); width: clamp(130px,16vw,230px); padding: 12px; background: #15171cee; color: white; border: 1px solid #ffffff30; border-radius: 12px; box-shadow: 0 8px 24px #0005; animation: demo-card-in .5s ease both; }
.landing-demo-card::after { content: ''; position: absolute; bottom: -7px; left: calc(50% - 6px); width: 12px; height: 12px; transform: rotate(45deg); background: #15171c; border-right: 1px solid #ffffff30; border-bottom: 1px solid #ffffff30; }
.landing-demo-card strong { font: 600 14px system-ui; } .landing-demo-card p { font: 12px/1.4 system-ui; color: #c2c8d4; margin: 6px 0 10px; }
.landing-demo-photo { height: 84px; overflow: hidden; border-radius: 6px; background: #252830; display: grid; place-items: center; }
.landing-demo-photo img { width: 100%; height: 100%; object-fit: cover; }
.landing-demo-photo img.sprite-first-candidate { width: 600%; max-width: none; object-fit: fill; transform: translateX(-16.6667%); justify-self: start; }
@keyframes demo-card-in { from { opacity: 0; translate: 0 10px; } to { opacity: 1; translate: 0 0; } }
@media(prefers-reduced-motion: reduce) { .landing-demo-card { animation: none; } }
</style>
