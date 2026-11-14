<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { cityForSetup, missionCities, missionTypes, searchCities, type MissionCity, type MissionSetup, type MissionType } from '../missionSetup'

const props = defineProps<{ initial?: MissionSetup | null }>()
const emit = defineEmits<{ complete: [setup: MissionSetup] }>()
const body = ref<'moon' | 'mars' | ''>(props.initial?.body ?? '')
const mission = ref<MissionType | ''>(props.initial?.mission ?? '')
const city = ref<MissionCity | null>(props.initial ? cityForSetup(props.initial) : null)
const cityLabel = (value: MissionCity) => `${value.name}, ${value.country}`
const search = ref(city.value ? cityLabel(city.value) : '')
const open = ref(false)
const active = ref(-1)
const searchBox = ref<HTMLInputElement | null>(null)
const results = computed(() => searchCities(city.value ? '' : search.value))
const valid = computed(() => !!body.value && !!mission.value && !!city.value)
const searched = () => { city.value = null; open.value = true; active.value = -1 }
function select(value: MissionCity) {
  city.value = value; search.value = cityLabel(value); open.value = false; active.value = -1
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { open.value = false; active.value = -1; return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); open.value = true
    active.value = Math.max(0, Math.min(results.value.length - 1, active.value + (event.key === 'ArrowDown' ? 1 : -1)))
    nextTick(() => document.getElementById(`city-option-${active.value}`)?.scrollIntoView({ block: 'nearest' }))
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault()
    const result = results.value[active.value >= 0 ? active.value : results.value.length === 1 ? 0 : -1]
    if (result) select(result)
  }
}
function submit() {
  if (!valid.value || !body.value || !mission.value || !city.value) return
  emit('complete', { body: body.value, mission: mission.value, cityId: city.value.id })
}
function blur(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) open.value = false
}
</script>

<template>
  <section class="setup-page" aria-labelledby="welcome-title">
    <a href="#/" class="home-link">← Back to introduction</a>
    <div class="setup-window">
      <div class="window-bar"><span class="window-mark" aria-hidden="true">T</span><span>TerraTwinn · Mission setup</span><span class="step-label">Step 1 of 2</span></div>
      <form class="setup-form" @submit.prevent="submit">
        <header><p class="eyebrow">BEFORE YOU BEGIN</p><h1 id="welcome-title">Welcome to TerraTwinn.</h1><p class="intro">Set up your mission to find comparable terrain for testing on Earth.</p></header>

        <fieldset><legend><span class="number">1</span> Which world are you planning for? <span class="required">*</span></legend>
          <div class="body-options">
            <label class="body-option" :class="{ selected: body === 'moon' }"><input v-model="body" type="radio" name="body" value="moon" required /><span class="planet-icon moon" aria-hidden="true"></span><span>Moon<small>Earth’s natural satellite</small></span><span class="check" aria-hidden="true">{{ body === 'moon' ? '✓' : '' }}</span></label>
            <label class="body-option" :class="{ selected: body === 'mars' }"><input v-model="body" type="radio" name="body" value="mars" required /><span class="planet-icon mars" aria-hidden="true"></span><span>Mars<small>The red planet</small></span><span class="check" aria-hidden="true">{{ body === 'mars' ? '✓' : '' }}</span></label>
          </div>
        </fieldset>

        <fieldset><legend><span class="number">2</span> Choose your mission type <span class="required">*</span></legend>
          <div class="mission-options"><label v-for="item in missionTypes" :key="item.id" class="mission-option" :class="{ selected: mission === item.id }"><input v-model="mission" type="radio" name="mission" :value="item.id" required /><span><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></span></label></div>
        </fieldset>

        <div class="city-field" @focusout="blur">
          <label for="mission-city" class="field-title"><span class="number">3</span> Where are you located? <span class="required">*</span></label>
          <div class="search-wrap"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input id="mission-city" ref="searchBox" v-model="search" type="search" placeholder="Search for a city, country or agency…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="mission-city-options" :aria-expanded="open" :aria-activedescendant="active >= 0 ? `city-option-${active}` : undefined" required @input="searched" @focus="open = true" @keydown="keydown" /><button v-if="search" type="button" class="clear-search" aria-label="Clear city" @click="search = ''; searched(); searchBox?.focus()">×</button></div>
          <div v-if="open" class="city-dropdown"><div class="dropdown-caption">{{ results.length }} / {{ missionCities.length }} cities</div><ul id="mission-city-options" role="listbox" aria-label="Your city"><li v-for="(item, index) in results" :id="`city-option-${index}`" :key="item.id" role="option" :aria-selected="city?.id === item.id" :class="{ active: index === active }" @pointerdown.prevent="select(item)"><span><strong>{{ item.name }}</strong><small>{{ item.country }} · {{ item.association }}</small></span><span class="country-code">{{ item.country_code }}</span></li><li v-if="!results.length" class="no-results">No matching city. Try Hanoi, Houston or Paris.</li></ul><a href="https://www.geonames.org/" target="_blank" rel="noreferrer" class="catalog-credit">Coordinates: GeoNames · CC BY 4.0 ↗</a></div>
          <p v-if="city" class="city-confirm" role="status">✓ {{ city.name }} · {{ city.lat.toFixed(4) }}°, {{ city.lon.toFixed(4) }}°</p>
          <p v-else class="field-hint">Select a city to calculate great-circle distances to Earth candidates.</p>
        </div>

        <footer class="form-footer"><span>Complete all three fields to continue.</span><button class="next-button" type="submit" :disabled="!valid">Next <span aria-hidden="true">→</span></button></footer>
      </form>
    </div>
    <p class="page-footnote">TerraTwinn · Terrain analogs for research and testing</p>
  </section>
</template>

<style scoped>
.setup-page { min-height: 100dvh; height: 100%; overflow-y: auto; background: #fff; color: #202124; font-family: Inter, 'Segoe UI', Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: safe center; padding: 60px 24px 30px; }
.home-link { position: absolute; left: 28px; top: 22px; font-size: 16px; color: #65706e; text-decoration: none; }
.home-link:hover { color: #111; text-decoration: underline; }
.setup-window { width: min(100%, 620px); border: 1px solid #d8dcd9; border-radius: 12px; box-shadow: 0 8px 32px #1b30200b, 0 1px 3px #00000007; background: white; }
.window-bar { display: flex; gap: 9px; align-items: center; height: 40px; padding: 0 16px; background: #f6f7f5; border-bottom: 1px solid #e3e6e1; border-radius: 12px 12px 0 0; font-size: 14px; color: #637062; }
.window-mark { background: #252d28; color: white; width: 18px; height: 18px; border-radius: 4px; text-align: center; font-size: 15px; line-height: 18px; font-weight: 700; }
.step-label { margin-left: auto; font-size: 13px; }
.setup-form { padding: 29px 30px 22px; display: grid; gap: 22px; }
.eyebrow { font-size: 12px; letter-spacing: .17em; font-weight: 600; color: #879080; margin-bottom: 9px; }
h1 { font-size: clamp(28px, 4vw, 34px); font-weight: 650; letter-spacing: -.035em; }
.intro { margin-top: 9px; max-width: 390px; font-size: 15px; line-height: 1.65; color: #788071; }
fieldset { border: 0; padding: 0; min-width: 0; }
legend, .field-title { display: flex; gap: 7px; align-items: center; font-size: 15px; font-weight: 600; margin-bottom: 10px; }
.number { color: #909889; font-size: 13px; font-weight: 400; margin-right: 1px; }
.required { color: #848c7e; }
.body-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.body-option { min-height: 66px; display: flex; align-items: center; gap: 11px; border: 1px solid #e0e4dc; border-radius: 7px; padding: 12px; cursor: pointer; font-size: 16px; }
.body-option input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.body-option:focus-within, .mission-option:focus-within { outline: 2px solid #5a735b; outline-offset: 3px; }
.body-option small { display: block; font-size: 13px; color: #8a9284; margin-top: 3px; }
.selected { border-color: #7f9277 !important; background: #f5f8f1; }
.planet-icon { width: 29px; height: 29px; border-radius: 50%; flex-shrink: 0; box-shadow: inset -7px -3px 7px #0003; }
.moon { background: radial-gradient(circle at 30% 38%, #969b93 0 10%, transparent 12%), radial-gradient(circle at 65% 65%, #aeb3a9 0 14%, transparent 16%), #dce0d5; }
.mars { background: radial-gradient(circle at 62% 60%, #9b5d45 0 18%, transparent 20%), #c68c69; }
.check { margin-left: auto; color: #567247; font-size: 15px; }
.mission-options { display: grid; gap: 7px; }
.mission-option { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid #e3e6de; border-radius: 6px; cursor: pointer; }
.mission-option input { accent-color: #526c45; width: 13px; height: 13px; flex-shrink: 0; }
.mission-option strong { font-weight: 500; font-size: 15px; }
.mission-option small { display: block; font-size: 13px; line-height: 1.5; color: #8b9285; margin-top: 3px; }
.city-field { position: relative; }
.search-wrap { display: flex; gap: 8px; align-items: center; border: 1px solid #d9dfd3; border-radius: 6px; padding: 0 11px; height: 41px; }
.search-wrap:focus-within { outline: 2px solid #6d8360; outline-offset: 2px; }
.search-wrap svg { width: 15px; height: 15px; fill: none; stroke: #8a9582; stroke-width: 1.5; flex-shrink: 0; }
.search-wrap input { width: 100%; min-width: 0; height: 100%; border: 0; background: transparent; outline: 0; font: inherit; font-size: 14px; color: #343e2b; }
.search-wrap input::-webkit-search-cancel-button { display: none; }
.clear-search { border: 0; background: none; font-size: 18px; cursor: pointer; color: #758369; }
.city-dropdown { position: absolute; top: 76px; left: 0; right: 0; z-index: 10; background: white; border: 1px solid #d9e0d2; border-radius: 7px; box-shadow: 0 8px 25px #1c321726; overflow: hidden; }
.dropdown-caption { padding: 9px 12px; font-size: 12px; color: #919889; background: #f7f9f4; border-bottom: 1px solid #edf0e9; }
ul { list-style: none; max-height: 190px; overflow-y: auto; }
li { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; }
li:hover, li.active { background: #f1f5ed; }
li strong { font-weight: 500; font-size: 15px; }
li small { display: block; font-size: 13px; line-height: 1.5; color: #88917e; margin-top: 3px; }
.country-code { margin-left: auto; font-size: 12px; color: #8b977f; }
.no-results { font-size: 14px; color: #7c8670; cursor: default; }
.catalog-credit { display: block; padding: 7px 12px; border-top: 1px solid #edf0e9; font-size: 12px; color: #809172; text-decoration: none; }
.field-hint, .city-confirm { font-size: 13px; line-height: 1.6; margin-top: 8px; color: #929a89; }
.city-confirm { color: #5a7747; }
.form-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #edf0e7; padding-top: 17px; }
.form-footer > span { font-size: 13px; color: #929a88; }
.next-button { border: 1px solid #252e21; background: #293323; color: white; padding: 10px 17px; border-radius: 5px; font: inherit; font-size: 14px; cursor: pointer; }
.next-button span { margin-left: 14px; }
.next-button:hover:not(:disabled) { background: #43543a; }
.next-button:disabled { border-color: #e5e9df; background: #eef1e9; color: #a6b09c; cursor: not-allowed; }
.page-footnote { margin-top: 20px; color: #a4ac9b; font-size: 12px; letter-spacing: .02em; }
@media (max-width: 560px) { .setup-page { padding: 65px 16px 30px; } .setup-form { padding: 24px 20px 20px; gap: 20px; } .home-link { left: 18px; } .form-footer > span { max-width: 160px; } }
</style>
