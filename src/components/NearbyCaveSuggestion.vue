<script setup lang="ts">
import {ref,watch} from 'vue'
interface Site {id:string;name:string;country:string;admin1:string;distance_km:number;access:string;sources:string[]}
interface Target {name:string;evidence:string;distance_from_selected_roi_km?:number}
interface Evidence {sites:Site[];target:Target;sources:Record<string,{title:string;url:string}>}
const props=defineProps<{body:'moon'|'mars';queryId:string;lat:number;lon:number;locationName:string}>()
const result=ref<Evidence|null>(null),busy=ref(false),error=ref('')
let sequence=0
watch(()=>[props.body,props.queryId,props.lat,props.lon],async()=>{
 const token=++sequence;busy.value=true;result.value=null;error.value=''
 try{
  const params=new URLSearchParams({body:props.body,query_id:props.queryId,user_lat:String(props.lat),user_lon:String(props.lon),task:'mapping',sort:'distance'})
  const response=await fetch('/api/analogs/caves/recommend?'+params)
  if(!response.ok)throw new Error('Documented nearby-cave information is currently unavailable.')
  const data=await response.json();if(token===sequence)result.value=data
 }catch(e){if(token===sequence)error.value=e instanceof Error?e.message:'Cave lookup unavailable.'}
 finally{if(token===sequence)busy.value=false}
},{immediate:true})
</script>
<template>
 <aside class="nearby-cave" aria-label="Supplemental nearby cave suggestion">
  <strong>Optional · nearby cave research</strong>
  <p v-if="busy" role="status">Finding the nearest documented cave to {{locationName}}…</p>
  <p v-else-if="error" role="status">{{error}}</p>
  <template v-else-if="result">
   <template v-if="result.sites[0]">
    <p><b>{{result.sites[0].name}}</b> · {{result.sites[0].admin1}}, {{result.sites[0].country}}<br><b>{{result.sites[0].distance_km.toLocaleString('en-US')}} km</b> from {{locationName}} in a straight line.</p>
    <p>Closest documented lava-tube survey option in the current catalog. It may still be far away; no globally nearest or local cave is guaranteed.</p>
    <p><b>Access:</b> {{result.sites[0].access}}</p>
    <div class="nearby-sources"><a v-for="id in result.sites[0].sources" :key="id" :href="result.sources[id]?.url" target="_blank" rel="noopener noreferrer">{{result.sources[id]?.title}}</a></div>
   </template>
   <p v-else>No documented cave in the catalog supports this survey task.</p>
   <details><summary>Planetary subsurface research target</summary><p><b>{{result.target.name}}</b><span v-if="result.target.distance_from_selected_roi_km!=null"> · {{result.target.distance_from_selected_roi_km.toLocaleString('en-US')}} km from the selected {{body==='moon'?'lunar':'Martian'}} ROI.</span> {{result.target.evidence}} This separate target is not assumed to be underneath the landing site.</p></details>
  </template>
  <p class="nearby-note">Supplemental planning only; surface scores are unchanged. A covered interior can limit direct sunlight/UV exposure, but radiation shielding, roof stability and habitability have not been established here. Earth cave training does not reproduce lunar or Martian radiation.</p>
 </aside>
</template>
<style scoped>
.nearby-cave{margin-top:18px;padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:13px;line-height:1.6;color:#334155}.nearby-cave>strong{color:#0f172a}.nearby-cave p{margin:8px 0}.nearby-sources{display:grid;gap:4px}.nearby-sources a{color:#1d4ed8;overflow-wrap:anywhere}.nearby-note{font-size:12px;color:#64748b}.nearby-cave details{margin-top:10px}.nearby-cave summary{cursor:pointer}
</style>
