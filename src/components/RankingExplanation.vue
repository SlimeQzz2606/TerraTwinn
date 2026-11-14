<script setup lang="ts">
import {computed} from 'vue'
interface Part {value:number|null;weight:number;confidence:number}
interface Candidate {rank:number;region:string;region_name?:string;composite?:number;final_score?:number;distance_km?:number|null;score_components?:Record<string,Part>;ranking_terrain?:{query_slope_p90_deg:number|null;earth_slope_p90_deg:number|null;query_source_url?:string|null;earth_source_url?:string|null;missing_reason:string|null}}
const props=defineProps<{candidate:Candidate;candidates:Candidate[]}>()
const labels:Record<string,string>={visual:'Image resemblance',lithology:'Rock / mineral classes',temperature:'Regional temperature resemblance',slope:'Slope compatibility',wind:'Regional wind resemblance'}
const score=(c:Candidate)=>c.final_score??c.composite
function breakdown(c:Candidate){
 const entries=Object.entries(c.score_components??{})
 const denominator=entries.reduce((sum,[,p])=>sum+(p.value!=null&&p.confidence>0?p.weight*p.confidence:0),0)
 const scale=c.final_score!=null?0.92:1
 return entries.map(([key,p])=>({key,label:labels[key]??key,available:p.value!=null&&p.confidence>0,effective:denominator&&p.value!=null?scale*p.weight*p.confidence/denominator*100:0,points:denominator&&p.value!=null?scale*p.weight*p.confidence*p.value/denominator*100:0}))
}
const rows=computed(()=>breakdown(props.candidate))
const strongest=computed(()=>rows.value.filter(r=>r.available).sort((a,b)=>b.points-a.points).slice(0,2))
const competitor=computed(()=>props.candidates.find(c=>c.region!==props.candidate.region&&(props.candidate.rank===1?c.rank===2:c.rank===1)))
const gap=computed(()=>{const a=score(props.candidate),b=competitor.value&&score(competitor.value);return a!=null&&b!=null?(a-b)*100:null})
const drivers=computed(()=>{
 if(!competitor.value)return []
 const other=breakdown(competitor.value)
 const differences=rows.value.map(r=>({label:r.label,delta:r.points-(other.find(p=>p.key===r.key)?.points??0)}))
 const a=props.candidate,b=competitor.value
 if(a.final_score!=null&&b.final_score!=null&&a.distance_km!=null&&b.distance_km!=null)differences.push({label:'Distance from your location',delta:8*(b.distance_km-a.distance_km)/(Math.PI*6371.0088)})
 return differences.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3)
})
const distancePoints=computed(()=>props.candidate.final_score!=null&&props.candidate.distance_km!=null?8*Math.max(0,1-props.candidate.distance_km/(Math.PI*6371.0088)):null)
</script>
<template>
 <article class="ranking-explanation">
  <h3>Why this candidate ranks #{{candidate.rank}}</h3>
  <p v-if="score(candidate)!=null"><strong>{{((score(candidate)??0)*100).toFixed(1)}} / 100</strong> in the current eligible candidate pool. <template v-if="strongest.length">The largest point contributions come from {{strongest.map(r=>r.label.toLowerCase()).join(' and ')}}.</template></p>
  <template v-if="rows.length">
   <table><thead><tr><th>Factor</th><th>Effective share</th><th>Points / 100</th></tr></thead><tbody><tr v-for="r in rows" :key="r.key"><th>{{r.label}}</th><td>{{r.available?r.effective.toFixed(1)+'%':'Excluded: missing data'}}</td><td>{{r.available?r.points.toFixed(2):'—'}}</td></tr><tr v-if="distancePoints!=null"><th>Distance from your location</th><td>8.0%</td><td>{{distancePoints.toFixed(2)}}</td></tr></tbody></table>
   <p>Effective shares include the saved confidence weights and normalization over available factors. Missing factors are excluded, not treated as evidence of a match. Contributions are approximate because saved factor scores are rounded.</p>
   <p v-if="candidate.ranking_terrain"><strong>Slope inputs:</strong> planetary ROI {{candidate.ranking_terrain.query_slope_p90_deg!=null?candidate.ranking_terrain.query_slope_p90_deg.toFixed(2)+'°':'unavailable'}}; Earth ROI {{candidate.ranking_terrain.earth_slope_p90_deg!=null?candidate.ranking_terrain.earth_slope_p90_deg.toFixed(2)+'°':'unavailable'}}. Both require a 30 m DEM grid over a centered 240 m window. <span v-if="candidate.ranking_terrain.missing_reason">{{candidate.ranking_terrain.missing_reason}}.</span> <a v-if="candidate.ranking_terrain.query_source_url" :href="candidate.ranking_terrain.query_source_url" target="_blank" rel="noopener">Planetary DEM source</a> <a v-if="candidate.ranking_terrain.earth_source_url" :href="candidate.ranking_terrain.earth_source_url" target="_blank" rel="noopener">Earth DEM source</a></p>
  </template>
  <p v-else>No factor breakdown was saved. A scientific explanation of the individual factors is unavailable for this result.</p>
  <template v-if="competitor && gap!=null">
   <h4>Compared with #{{competitor.rank}} {{competitor.region_name??competitor.region.replace(/_/g,' ')}}</h4>
   <p>This candidate scores {{Math.abs(gap).toFixed(2)}} points {{gap>=0?'higher':'lower'}}{{Math.abs(gap)<0.01?' (effectively tied at this precision)':''}}.</p>
   <ul><li v-for="driver in drivers" :key="driver.label">{{driver.label}}: {{driver.delta>=0?'+':''}}{{driver.delta.toFixed(2)}} points relative to that candidate.</li></ul>
  </template>
  <p><strong>Interpretation:</strong> Rank #1 means the highest score among the screened candidates in this run, not a proven best site worldwide. Relative image, temperature and wind scores depend on the candidate pool. A close relative temperature match does not reproduce planetary temperatures; Earth wind does not reproduce lunar vacuum. Screening acceptance is not landing authorization or a radiation-shelter assessment.</p>
 </article>
</template>
<style scoped>
.ranking-explanation{margin:20px 0;padding:18px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;line-height:1.6}.ranking-explanation h3{margin:0 0 10px;font-size:20px}.ranking-explanation h4{margin-bottom:6px}.ranking-explanation table{width:100%;border-collapse:collapse;font-size:13px}.ranking-explanation th,.ranking-explanation td{text-align:left;border-bottom:1px solid #e2e8f0;padding:9px 5px}.ranking-explanation p,.ranking-explanation li{font-size:13px}.ranking-explanation th:first-child{width:45%}
</style>
