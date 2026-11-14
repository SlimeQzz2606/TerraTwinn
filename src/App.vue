<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import LandingPage from './landing/LandingPage.vue'
import MissionSetupForm from './components/MissionSetup.vue'
import { readMissionSetup, saveMissionSetup, type MissionSetup } from './missionSetup'

// Load the explorer interface when someone opens it.
const PlanetaryGlobe = defineAsyncComponent(() => import('./components/PlanetaryGlobe.vue'))

const route = ref(location.hash)
const setup = ref<MissionSetup | null>(readMissionSetup())
const view = computed(() => route.value === '#/explore' && setup.value ? 'explore'
  : ['#/setup', '#/explore'].includes(route.value) ? 'setup' : 'landing')
const sync = () => { route.value = location.hash }
function startMission(value: MissionSetup) {
  setup.value = value
  saveMissionSetup(value)
  location.hash = '#/explore'
  sync()
}
function changeBody(body: MissionSetup['body']) {
  if (!setup.value) return
  setup.value = { ...setup.value, body }
  saveMissionSetup(setup.value)
}
onMounted(() => window.addEventListener('hashchange', sync))
onBeforeUnmount(() => window.removeEventListener('hashchange', sync))
</script>

<template>
  <main class="app-root">
    <PlanetaryGlobe v-if="view === 'explore' && setup" :setup="setup" @body-change="changeBody" />
    <MissionSetupForm v-else-if="view === 'setup'" :initial="setup" @complete="startMission" />
    <LandingPage v-else />
  </main>
</template>
<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app, .app-root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #05070f;
}

@media (max-width: 900px) {
  html, body, #app, .app-root { height: auto; min-height: 100%; overflow: auto; }
}
</style>
