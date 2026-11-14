<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ src: string; lon: number; lat: number; label: string; atmosphere?: boolean; focusProgress?: number; demo?: { lat: number; lng: number; title: string; description: string; image: string; sprite?: boolean } }>()
const emit = defineEmits<{ ready: [] }>()
const offset = ref(0)
const photoFailed = ref(false)
watch(() => props.demo?.image, () => { photoFailed.value = false })
let dragX: number | null = null
const position = computed(() => {
  const progress = props.focusProgress ?? 0
  const lon = props.demo && progress > 0 ? props.lon + (props.demo.lng - props.lon) * progress : props.lon
  return `${50 + lon / 3.6 + offset.value}% 50%`
})
function start(event: PointerEvent) {
  dragX = event.clientX
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (dragX == null) return
  offset.value += (event.clientX - dragX) * .15
  dragX = event.clientX
}
</script>

<template>
  <div class="planet-preview" role="img" :aria-label="`${label} illustration`" @pointerdown="start" @pointermove="move" @pointerup="dragX = null" @pointercancel="dragX = null">
    <img class="preload" :src="src" alt="" @load="emit('ready')" @error="emit('ready')" />
    <div class="surface" :class="{ atmosphere }" :style="{ backgroundImage: `url(${src})`, backgroundPosition: position }"></div>
    <div v-if="demo && (focusProgress ?? 0) > .8" class="demo-card">
      <strong>{{ demo.title }}</strong><p>{{ demo.description }}</p>
      <div class="demo-photo"><img v-if="!photoFailed" :src="demo.image" :alt="demo.title" :class="{ sprite: demo.sprite }" @error="photoFailed = true" /><small v-else>Site imagery unavailable</small></div>
    </div>
  </div>
</template>

<style scoped>
.planet-preview { width:100%; height:100%; position:relative; cursor:grab; touch-action:pan-y; }
.preload { display:none; }
.surface { width:100%; height:100%; border-radius:50%; background-size:200% 100%; box-shadow:inset -35px -8px 48px 8px #000c, inset 8px 4px 20px #ffffff30; }
.surface.atmosphere { outline:1px solid #78b8ee55; }
.demo-card { position:absolute; left:50%; top:20%; transform:translateX(-50%); width:clamp(140px,16vw,230px); padding:12px; border:1px solid #ffffff30; border-radius:12px; background:#15171cee; color:white; pointer-events:none; }
.demo-card strong { font:600 14px system-ui; }.demo-card p { margin:6px 0 10px; font:12px/1.4 system-ui; color:#c2c8d4; }
.demo-photo { height:84px; overflow:hidden; border-radius:6px; background:#252830; }.demo-photo img { width:100%; height:100%; object-fit:cover; }.demo-photo img.sprite { width:600%; max-width:none; object-fit:fill; transform:translateX(-16.6667%); }
</style>
