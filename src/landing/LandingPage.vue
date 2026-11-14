<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import LandingPlanet from './LandingPlanetLite.vue'
const readyCount = ref(0)
const BASE = import.meta.env.BASE_URL
const root = ref<HTMLElement | null>(null)
const progress = ref(0)
const measurementScene = ref<HTMLElement | null>(null)
const extraScroll = ref(0)
const tableOffset = ref(0)
let measureObserver: ResizeObserver | null = null
const mobile = ref(false)
const reducedMotion = ref(false)
let frame = 0
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t
function update() {
  if (!root.value) return
  progress.value = Math.min(3, Math.max(0, root.value.scrollTop / (root.value.clientHeight * 2)))
  mobile.value = root.value.clientWidth <= 700
  if (measurementScene.value) extraScroll.value = Math.max(0, measurementScene.value.scrollHeight - measurementScene.value.clientHeight)
  tableOffset.value = Math.min(extraScroll.value, Math.max(0, root.value.scrollTop - root.value.clientHeight * 5.3))
}
function scroll() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update() }) }
onMounted(() => { reducedMotion.value = matchMedia('(prefers-reduced-motion: reduce)').matches; measureObserver = new ResizeObserver(update); if (measurementScene.value) measureObserver.observe(measurementScene.value); update(); window.addEventListener('resize', update) })
onBeforeUnmount(() => { cancelAnimationFrame(frame); measureObserver?.disconnect(); window.removeEventListener('resize', update) })
const demoPlanet = ref<'moon' | 'mars'>('moon')
const swapping = ref(false)
let swapTimer: ReturnType<typeof setTimeout> | undefined
function selectDemo(planet: 'moon' | 'mars') {
  if (demoPlanet.value === planet) return
  swapping.value = true
  demoPlanet.value = planet
  clearTimeout(swapTimer)
  swapTimer = setTimeout(() => { swapping.value = false }, 900)
}
onBeforeUnmount(() => clearTimeout(swapTimer))
const tableProgress = computed(() => smooth((progress.value - 2) / .65))
const demoProgress = computed(() => smooth((progress.value - 1.05) / .7))
const moonDemo = { lat: .67416, lng: 23.47314, title: 'Apollo 11 landing site', description: 'Sea of Tranquility · Moon', image: '/api/analogs/moon_judge_screen_gated_veg_div2/img/apollo11_query.png' }
const lunarEarthDemo = { lat: 35.302, lng: -111.506, title: 'Cinder Lake, Arizona', description: 'Historical lunar training analog · illustrative pairing', image: '/api/analogs/moon_judge_screen_gated_veg_div2_supp/img/apollo11_top5.png', sprite: true }
const marsDemo = { lat: 18.44, lng: 77.45, title: 'Jezero Delta', description: 'Ancient delta terrain · Mars', image: `${BASE}landing/mars-query.jpg` }
const marsEarthDemo = { lat: 13.82, lng: 109.27, title: 'Phuong Mai dunes, Vietnam', description: 'Retrieved candidate · insufficient evidence', image: `${BASE}landing/earth-candidate.jpg` }
const earthDemo = computed(() => demoPlanet.value === 'moon' ? lunarEarthDemo : marsEarthDemo)
const regroup = computed(() => smooth((progress.value - .18) / .6))
function planetStyle(body: 'mars' | 'earth' | 'moon') {
  const initial = mobile.value ? { mars: [-17, 36, 58], earth: [12, 48, 78], moon: [72, 79, 32] } : { mars: [-6, 5, 34], earth: [17, 32, 41], moon: [76, 75, 20] }
  const final = mobile.value ? { mars: [0, 55, 30], earth: [49, 55, 50], moon: [29, 55, 19] } : { mars: [4, 44, 28], earth: [60, 44, 35], moon: [31, 44, 18] }
  const start = initial[body], end = final[body], t = regroup.value
  const d = demoProgress.value
  const active = body === demoPlanet.value
  const demo = body === 'earth' ? (mobile.value ? [50, 48] : [55, 39]) : active ? (mobile.value ? [0, 48] : [5, 39]) : (mobile.value ? [14, 12] : [19, 12])
  const w = mix(mix(start[2]!, end[2]!, t), demo[1]!, d)
  return { left: `${mix(mix(start[0]!, end[0]!, t), demo[0]!, d)}vw`, top: `calc(${mix(mix(start[1]!, mobile.value ? 72 : 66, t), mobile.value ? 70 : 65, d)}vh - ${mix(end[2]! * t, demo[1]!, d) / 2}vw)`, width: `${w}vw`, opacity: (body === 'earth' || body === demoPlanet.value ? 1 : 1 - d * .15) * (1 - tableProgress.value), zIndex: body === demoPlanet.value ? 2 : 1 }

}
const headlineStyle = computed(() => {
  const p = progress.value
  const center = smooth(p / .3), exit = smooth((p - .32) / .3)
  return { left: `${mix(mobile.value ? 50 : 69, 50, center)}%`, top: `${mix(mobile.value ? 20 : 34, 45, center) - exit * 80}%`, opacity: 1 - exit, transform: `translate(-50%, -50%) scale(${1 - exit * .08})` }
})
const explanationStyle = computed(() => {
  const t = smooth((progress.value - .63) / .3)
  return { opacity: t * (1 - smooth((progress.value - 1) / .35)), transform: `translateY(${reducedMotion.value ? 0 : (1 - t) * 30 - smooth((progress.value - 1) / .4) * 300}px)`, filter: reducedMotion.value ? 'none' : `blur(${(1 - t) * 6}px)` }
})
const sunStyle = computed(() => ({ opacity: 1 - smooth(progress.value / .55), transform: `translateY(${-Math.min(progress.value, 1) * 45}vh) scale(${1 - Math.min(progress.value, 1) * .75})` }))
</script>

<template>
  <main ref="root" class="landing-scroll" :class="{ ready: readyCount >= 3, swapping }" @scroll.passive="scroll">
    <div class="scroll-story" :style="{ height: `calc(630svh + ${extraScroll}px)` }">
      <div class="landing-space">
        <div class="space-scene">
          <div class="sun-retreat" :style="sunStyle" aria-hidden="true"><div class="sun-halo"></div><div class="sun"></div></div>
          <div class="planet mars" :style="planetStyle('mars')"><div class="arrival"><LandingPlanet :src="`${BASE}textures/mars-preview.jpg`" :lon="62" :lat="14" label="Mars" :demo="marsDemo" :focus-progress="demoPlanet === 'mars' ? demoProgress : 0" @ready="readyCount++" /></div></div>
          <div class="planet earth" :style="planetStyle('earth')"><div class="arrival"><LandingPlanet :src="`${BASE}textures/earth-preview.jpg`" :lon="95" :lat="14" label="Earth" :demo="earthDemo" :focus-progress="demoProgress" atmosphere @ready="readyCount++" /></div></div>
          <div class="planet moon" :style="planetStyle('moon')"><div class="arrival"><LandingPlanet :src="`${BASE}textures/moon-preview.jpg`" :lon="0" :lat="8" label="Moon" :demo="moonDemo" :focus-progress="demoPlanet === 'moon' ? demoProgress : 0" @ready="readyCount++" /></div></div>
        </div>
        <div v-if="demoProgress > .9 && tableProgress < .15" class="demo-switch" role="group" aria-label="Choose a planetary example">
          <button :class="{ active: demoPlanet === 'moon' }" :aria-pressed="demoPlanet === 'moon'" @click="selectDemo('moon')">Moon</button>
          <button :class="{ active: demoPlanet === 'mars' }" :aria-pressed="demoPlanet === 'mars'" @click="selectDemo('mars')">Mars</button>
        </div>
        <h1 :style="headlineStyle">Other worlds.<br />Familiar ground.</h1>
        <section class="analogy-copy" :style="explanationStyle" :aria-hidden="progress < .63">
          <h2>Practice here,<br class="mobile-break" /> land there.</h2>
          <p>Places on Earth share features with the Moon and Mars. These analog sites help teams study terrain and practice exploration tasks before they fly.</p>
        </section>
        <section ref="measurementScene" class="measurement-scene" :style="{ opacity: tableProgress, pointerEvents: tableProgress > .8 ? 'auto' : 'none' }" :aria-hidden="tableProgress < .1">
          <div class="measurement-line" :style="{ transform: `scaleY(${Math.min(1, tableProgress * 2)})` }"></div>
          <div class="measurement-content" :style="{ opacity: smooth((tableProgress - .2) / .8), transform: `translateY(${(1 - tableProgress) * 35 - tableOffset}px)` }">
            <h2>See what’s measured.<br />See what’s missing.</h2>
            <p class="sample-label">Every result shows its sources and data limits.</p>
            <div class="measurement-panel">
              <div class="sample-head"><span>What supports a match?</span><span>Source-aware comparisons</span></div>
              <div class="sample-table-scroll"><table class="sample-table"><thead><tr><th>Evidence</th><th>What it tells you</th><th>What to check</th></tr></thead><tbody>
                <tr><th>Orbital images</th><td>Similar visible landforms and textures</td><td>Different sensors and pixel sizes</td></tr>
                <tr><th>Terrain &amp; slope</th><td>Elevation and slope where a DEM is available</td><td>Coverage and measurement scale</td></tr>
                <tr><th>Thermal context</th><td>Thermal inertia or temperature context</td><td>Measured data versus climate models</td></tr>
                <tr><th>Materials &amp; climate</th><td>Map, literature and regional context</td><td>Not a field measurement of each patch</td></tr>
              </tbody></table></div>
              <p class="sample-note">Open a site to see available measurements. A ranking score is a research lead, not confirmation of landing suitability.</p>
            </div>
            <div class="explorer-invitation">
              <a href="#/setup" class="explorer-link" :tabindex="tableProgress > .8 ? 0 : -1"><span>Check it out<br class="invitation-break" /> for yourself </span></a>
            </div>
          </div>
        </section>
        <span class="scroll-cue" :style="{ opacity: 1 - smooth(progress / .12) }" aria-hidden="true">Scroll to discover</span>
      </div>
    </div>
  </main>
</template>

<style scoped>
.landing-scroll { height: 100svh; overflow-y: auto; overflow-x: hidden; background: #020305; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.scroll-story { height: 700svh; }
.landing-space { position: sticky; top: 0; isolation: isolate; height: 100svh; overflow: hidden; }
.space-scene { position: absolute; inset: 0; pointer-events: none; background: #020305; }
.sun-retreat { position: absolute; inset: 0; transform-origin: 50% 0; }
.sun { position: absolute; top: -12vw; left: 50%; transform: translateX(-50%); width: 23vw; height: 23vw; border-radius: 50%; background: #fffef4; box-shadow: 0 0 35px 10px #fff5d8, 0 0 100px 35px #ffbc6880, 0 0 220px 90px #ff963b30; }
.sun-halo { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, #ffdaac33, transparent 48%); }
.planet { position: absolute; aspect-ratio: 1; pointer-events: auto; }
.arrival { width: 100%; height: 100%; opacity: 0; }
h1 { position: absolute; z-index: 2; width: max-content; max-width: calc(100% - 40px); pointer-events: none; margin: 0; font-size: clamp(40px, 5.6vw, 88px); font-weight: 700; line-height: 1.05; letter-spacing: -.035em; text-shadow: 0 4px 32px #000a; }
.analogy-copy { position: absolute; z-index: 2; top: 12%; left: 10%; right: 10%; text-align: center; pointer-events: none; }
h2 { font-size: clamp(34px, 4.7vw, 72px); line-height: 1.06; letter-spacing: -.035em; }
.analogy-copy p { max-width: 610px; margin: 22px auto 12px; color: #ccd1db; font-size: clamp(15px, 1.5vw, 20px); line-height: 1.55; }
.analogy-copy small { color: #8f99aa; font-size: 12px; }
.mobile-break { display: none; }
.scroll-cue { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); color: #b3bbc8; font-size: 12px; letter-spacing: .04em; pointer-events: none; }
.scroll-cue span { display: block; text-align: center; margin-top: 6px; font-size: 20px; }
.sun, .sun-halo { opacity: 0; }
.ready .sun, .ready .sun-halo { animation: sunrise 3.6s ease-out .35s both; }
.ready .mars .arrival { animation: planet-arrival 1.8s cubic-bezier(.16,1,.3,1) both; }
.ready .earth .arrival { animation: planet-arrival 2.3s cubic-bezier(.16,1,.3,1) both; }
.ready .moon .arrival { animation: planet-arrival 2.8s cubic-bezier(.16,1,.3,1) both; }
@keyframes sunrise { from { opacity: 0; } to { opacity: 1; } }
@keyframes planet-arrival { from { opacity: 0; transform: translateX(120vw) rotate(18deg) scale(.55); } to { opacity: 1; transform: none; } }
@media(max-width: 700px) { h1 { text-align: center; font-size: clamp(36px, 9vw, 64px); } .sun { width: 45vw; height: 45vw; top: -24vw; } .analogy-copy { top: 15%; left: 7%; right: 7%; } .mobile-break { display: block; } }
@media(prefers-reduced-motion: reduce) { .ready .arrival, .ready .sun, .ready .sun-halo { animation: none; opacity: 1; } }
</style>

<style scoped>
.earth .arrival, .moon .arrival {
  position: relative;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
  mask-composite: intersect;
}
</style>

<style scoped>
.demo-switch { position: absolute; z-index: 5; top: 5%; left: 50%; transform: translateX(-50%); display: flex; padding: 4px; border-radius: 999px; background: #080a0e; box-shadow: 0 0 0 1px #ffffff3d, 0 8px 28px #0008; }
.demo-switch button { min-width: 86px; padding: 9px 18px; border: 0; border-radius: 999px; color: white; background: transparent; font: inherit; font-weight: 600; cursor: pointer; transition: background .3s ease, color .3s ease; }
.demo-switch button.active { background: #a8bad0; color: #10151d; }
.demo-switch button:focus-visible { outline: 2px solid white; outline-offset: 2px; }
.swapping .planet { transition: left .85s cubic-bezier(.22,1,.36,1), top .85s cubic-bezier(.22,1,.36,1), width .85s cubic-bezier(.22,1,.36,1), opacity .85s ease; }
.mars .arrival { position: relative; overflow: hidden; -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent); -webkit-mask-composite: source-in; mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent), linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent); mask-composite: intersect; }
@media (prefers-reduced-motion: reduce) { .swapping .planet, .demo-switch button { transition: none; } }
</style>

<style scoped>
.measurement-scene { position: absolute; inset: 0; z-index: 6; overflow: hidden; padding: 70px 24px 32px; background: #020305; }
.measurement-line { position: absolute; top: 0; left: 50%; width: 1px; height: 55px; background: linear-gradient(transparent,#d5deeb); transform-origin: top; }
.measurement-content { max-width: 960px; margin: auto; text-align: center; }
.measurement-content h2 { font-size: clamp(30px,4vw,60px); }
.sample-label { margin: 14px 0 25px; color: #afbac9; font-size: 12px; }
.measurement-panel { text-align: left; border: 1px solid #ffffff30; border-radius: 18px; background: #101318; overflow: hidden; }
.sample-head { display: flex; justify-content: space-between; gap: 12px; padding: 17px 22px; border-bottom: 1px solid #ffffff20; font-size: 12px; color: #c0cad8; }
.sample-table-scroll { overflow-x: auto; }
.sample-table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 13px; }
.sample-table th, .sample-table td { text-align: left; padding: 13px 20px; border-bottom: 1px solid #ffffff12; vertical-align: middle; }
.sample-table thead th { color: #a7b4c5; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.sample-table tbody th { font-weight: 500; }
.sample-table small { display: block; font-weight: 400; font-size: 11px; margin-top: 4px; color: #9ca9bb; }
.sample-tag { display: block; color: #a6d7cc; font-size: 10px; margin-bottom: 3px; }
.sample-tag.missing { color: #e1bd7a; } .sample-tag.pending { color: #aabce2; }
.sample-chart { padding: 20px; }
.chart-title { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px; font-size: 12px; margin-bottom: 16px; }
.chart-title span { color: #9ca9bb; font-size: 11px; }
.chart-row { display: grid; grid-template-columns: 105px 1fr 40px; align-items: center; gap: 12px; margin: 9px 0; font-size: 11px; }
.chart-track { height: 7px; background: #ffffff0c; border-radius: 9px; }
.chart-track i { height: 100%; display: block; border-radius: inherit; background: #bac7dc; } .chart-track .earth-bar { background: #88bfb2; }
.chart-axis { display: flex; justify-content: space-between; margin: 8px 52px 0 117px; color: #7e8da1; font-size: 10px; }
.sample-note { padding: 0 20px 18px; font-size: 11px; line-height: 1.5; color: #a1afc2; }
</style>

<style scoped>
.explorer-invitation { display: grid; place-items: center; padding: clamp(70px, 12vh, 140px) 12px clamp(90px, 14vh, 160px); }
.explorer-link { display: inline-block; max-width: 100%; color: white; text-decoration: none; text-align: center; font-size: clamp(34px, 5.8vw, 82px); line-height: 1.06; letter-spacing: -.04em; font-weight: 700; transition: transform .35s cubic-bezier(.2,.8,.2,1), text-shadow .35s ease; text-shadow: 0 0 18px #d0e6ff44; }
.explorer-link > span { display: inline-block; animation: invitation-heartbeat 2.6s ease-in-out infinite; }
.explorer-link:hover, .explorer-link:focus-visible { transform: scale(1.06); text-shadow: 0 0 14px #fff9, 0 0 42px #93c5fd99, 0 0 90px #8fbfff55; }
.explorer-link:focus-visible { outline: 2px solid #bcd9ff; outline-offset: 10px; border-radius: 6px; }
.invitation-arrow { display: inline-block; font-size: .55em; vertical-align: top; }
.invitation-break { display: none; }
@keyframes invitation-heartbeat { 0%, 100% { transform: scale(1); } 12% { transform: scale(1.035); } 22% { transform: scale(1); } 32% { transform: scale(1.02); } 45% { transform: scale(1); } }
@media (max-width: 600px) { .invitation-break { display: block; } }
@media (prefers-reduced-motion: reduce) { .explorer-link, .explorer-link > span { animation: none; transition: none; } .explorer-link:hover, .explorer-link:focus-visible { transform: none; } }
</style>
