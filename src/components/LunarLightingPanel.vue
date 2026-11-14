<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {lightingDate,type LightingPlan,type LightingSchedule} from '../lightingPlan'
const props=withDefaults(defineProps<{plan:LightingPlan|null;busy:boolean;error:string;queryId:string;targetName:string;
  lunarTime:string;startDate:string;candidate?:{region:string;region_name?:string;lighting?:LightingSchedule};controls?:boolean}>(), {controls:true})
const emit=defineEmits<{'search':[value:{lunarTime:string;startDate:string}]}>()
const referenceTime=ref(props.lunarTime);const start=ref(props.startDate)
watch(()=>props.lunarTime,v=>referenceTime.value=v)
watch(()=>props.startDate,v=>start.value=v)
const failed=ref<Record<string,boolean>>({})
watch(()=>[props.queryId,props.candidate?.region,props.plan?.target.time_utc],()=>failed.value={})
const windows=computed(()=>props.candidate?.lighting?.windows??[])
function search(auto=false){emit('search',{lunarTime:auto?'':referenceTime.value,startDate:start.value})}
function shadow(body:'moon'|'earth') {
 if(!props.plan)return ''
 return '/api/analogs/lighting/shadow?'+new URLSearchParams({body,identifier:body==='moon'?props.queryId:props.candidate!.region,
 elevation:String(props.plan.target.elevation_deg),azimuth:String(props.plan.target.azimuth_deg)})
}
</script>
<template>
 <section class="lunar-lighting-panel">
  <header><h2>Low-Sun field-test planner</h2><p>Find Earth test windows that reproduce the lunar Sun's height and direction.</p></header>
  <form v-if="controls!==false" @submit.prevent="search()" class="lighting-controls">
   <label>Lunar reference time (UTC)<input v-model="referenceTime" type="datetime-local" min="2020-01-01T00:00" max="2048-12-31T23:59" :disabled="busy"><small>Leave blank to find the next lunar Sun elevation of 1.5–7°.</small></label>
   <label>Earth search starts<input v-model="start" type="date" min="2020-01-01" max="2048-12-31" required :disabled="busy"><small>Searches the following 365 days.</small></label>
   <div class="lighting-actions"><button type="submit" :disabled="busy">{{busy?'Calculating…':'Find matching test windows'}}</button><button type="button" :disabled="busy" @click="search(true)">Auto lunar reference</button></div>
  </form>
  <p v-if="busy" role="status">Calculating Sun positions and matching test windows across accepted Earth sites…</p>
  <p v-if="error" class="lighting-error" role="alert">{{error}}</p>
  <template v-if="plan">
   <div class="lunar-reference"><strong>{{targetName}} · lunar reference</strong><span>{{lightingDate(plan.target.time_utc)}} UTC</span><span>Sun elevation <b>{{plan.target.elevation_deg.toFixed(2)}}°</b> · azimuth <b>{{plan.target.azimuth_deg.toFixed(2)}}°</b></span><small>North = 0° · east = 90°. Match tolerances: ±{{plan.elevation_tolerance_deg}}° elevation, ±{{plan.azimuth_tolerance_deg}}° azimuth.</small></div>
   <p class="lighting-note">Earth test dates reproduce the geometry at this lunar reference time; they do not need to occur at the same UTC. Existing ranking scores are retained, and sites without a matching window are omitted.</p>
   <template v-if="candidate?.lighting">
    <h3>{{candidate.region_name}} · test windows</h3>
    <article v-for="(slot,i) in windows" :key="slot.start_utc" class="lighting-window"><strong>{{i===0?'Next matching window':'Alternative window'}} · {{lightingDate(slot.start_local)}} – {{slot.start_local.slice(0,10)===slot.end_local.slice(0,10)?slot.end_local.slice(11,16):lightingDate(slot.end_local)}}</strong><span>{{slot.timezone}} · UTC offset {{slot.start_local.slice(16)}} · {{slot.duration_minutes}} min</span><span>Best minute: {{lightingDate(slot.best_local)}} · Sun {{slot.elevation_deg.toFixed(2)}}° high, {{slot.azimuth_deg.toFixed(2)}}° azimuth</span><span>Difference from Moon: {{slot.elevation_error_deg.toFixed(2)}}° elevation / {{slot.azimuth_error_deg.toFixed(2)}}° direction</span><small>UTC window: {{lightingDate(slot.start_utc)}} – {{lightingDate(slot.end_utc)}}</small></article>
    <h3>Local terrain shadows · same Sun angles</h3>
    <div class="shadow-pair"><figure v-for="body in (['moon','earth'] as const)" :key="body"><img v-if="!failed[body]" :src="shadow(body)" :alt="`${body} local DEM shadow preview`" loading="lazy" @error="failed[body]=true"><div v-else class="shadow-unavailable">No valid local DEM preview is available.</div><figcaption>{{body==='moon'?targetName:candidate.region_name}}</figcaption></figure></div>
    <p class="lighting-note">DEM-only shadow preview over the available local tile, not a photograph. Grid north is corrected to true north. Distant mountains and shadows entering from outside the tile are not modeled; the Earth DEM is about 8–30 m per cell.</p>
   </template>
   <p class="lighting-note">NASA SPICE (DE421 / MOON_ME) + NREL SPA. One-minute geometric Sun-centre sampling. Weather, atmospheric refraction, terrain outside the tile and camera glare are not predicted. Confirm local access and sunlight before travel. <a href="https://www.nasa.gov/centers-and-facilities/nesc/characterizing-the-visual-experience-of-astronauts-at-the-lunar-south-pole/" target="_blank" rel="noopener">NASA lighting context ↗</a></p>
  </template>
 </section>
</template>
<style scoped>
.lunar-lighting-panel{padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#0f172a}.lunar-lighting-panel h2{font-size:18px;margin:0 0 6px}.lunar-lighting-panel h3{font-size:14px;margin:18px 0 10px}.lunar-lighting-panel header p{font-size:13px;color:#475569;margin:0;line-height:1.5}.lighting-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.lighting-controls label{display:grid;gap:6px;font-size:12px}.lighting-controls input{padding:9px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;min-width:0}.lighting-controls small,.lighting-note{color:#64748b;font-size:11px;line-height:1.6}.lighting-actions{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}.lighting-actions button{padding:9px 12px;background:#111827;color:white;border:0;border-radius:6px;font:inherit;font-size:12px;cursor:pointer}.lighting-actions button+button{background:white;color:#111827;border:1px solid #cbd5e1}.lighting-actions button:disabled{opacity:.5;cursor:wait}.lighting-error{color:#b91c1c;font-size:12px}.lunar-reference,.lighting-window{display:grid;gap:6px;padding:12px;background:white;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;line-height:1.5}.lighting-window{margin:8px 0}.lighting-window small,.lunar-reference small{color:#64748b}.shadow-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.shadow-pair figure{margin:0;min-width:0}.shadow-pair img,.shadow-unavailable{display:block;width:100%;aspect-ratio:1;border-radius:8px;background:#e2e8f0;object-fit:contain}.shadow-unavailable{display:grid;place-content:center;padding:12px;box-sizing:border-box;font-size:12px}.shadow-pair figcaption{font-size:12px;padding-top:7px}@media(max-width:600px){.lighting-controls{grid-template-columns:1fr}}
</style>
