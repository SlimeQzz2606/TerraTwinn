<script setup lang="ts">
import {computed} from 'vue'
interface Part {value:number|null;weight:number;confidence:number}
interface Candidate {rank:number;region:string;region_name?:string;composite?:number;final_score?:number;distance_km?:number|null;score_missing_policy?:string;validation_assessment?:string;score_components?:Record<string,Part>;ranking_terrain?:{query_slope_p90_deg:number|null;earth_slope_p90_deg:number|null;query_source_url?:string|null;earth_source_url?:string|null;missing_reason:string|null}}
const props=defineProps<{candidate:Candidate;candidates:Candidate[]}>()
const labels:Record<string,string>={visual:'Image resemblance',lithology:'Rock / mineral classes',temperature:'Regional temperature resemblance',slope:'Slope compatibility',wind:'Regional wind resemblance',geometry:'iLILA geometry margin (line of sight, relief, route)',seismic:'Seismic noise (0.1-10 Hz, Earth NLNM/NHNM reference)',thermal:'Thermal cycling similarity',anchoring:'Loose cover over hard rock (anchoring)',anthropogenic:'Human noise (night lights, roads)'}
const shortLabels:Record<string,string>={visual:'Image',lithology:'Rock / minerals',temperature:'Temperature',slope:'Slope',wind:'Wind',geometry:'Geometry',seismic:'Seismic noise',thermal:'Thermal cycling',anchoring:'Anchoring',anthropogenic:'Human noise'}
const colours:Record<string,string>={visual:'#2563eb',lithology:'#b45309',temperature:'#dc2626',slope:'#0f766e',wind:'#7c3aed',geometry:'#0f766e',seismic:'#7c3aed',thermal:'#dc2626',anchoring:'#b45309',anthropogenic:'#475569'}
const otherName=(c:Candidate)=>c.region_name??c.region.replace(/_/g,' ')
const driverName=(label:string)=>{const r=rows.value.find(x=>x.label===label);return r?r.short:label}
const score=(c:Candidate)=>c.final_score??c.composite
function breakdown(c:Candidate){
 const entries=Object.entries(c.score_components??{})
 const denominator=entries.reduce((sum,[,p])=>sum+((p.value!=null||c.score_missing_policy==='zero_estimated')&&p.confidence>0?p.weight*p.confidence:0),0)
 const scale=c.final_score!=null?0.92:1
 return entries.map(([key,p])=>({key,label:labels[key]??key,short:shortLabels[key]??key,colour:colours[key]??'#64748b',value:p.value,available:p.value!=null&&p.confidence>0,effective:denominator&&p.value!=null?scale*p.weight*p.confidence/denominator*100:0,points:denominator&&p.value!=null?scale*p.weight*p.confidence*p.value/denominator*100:0}))
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
  <header class="re-head">
   <div class="re-score" v-if="score(candidate)!=null"><b>{{((score(candidate)??0)*100).toFixed(1)}}</b><span>/ 100</span></div>
   <div>
    <h3>Why #{{candidate.rank}}</h3>
    <p v-if="strongest.length">Biggest contributions: <strong>{{strongest.map(r=>r.short.toLowerCase()).join(' and ')}}</strong></p>
    <p v-if="competitor && gap!=null" class="re-gap">{{gap>=0?'+':'−'}}{{Math.abs(gap).toFixed(1)}} points vs #{{competitor.rank}} {{otherName(competitor)}}</p>
   </div>
  </header>
  <template v-if="rows.length">
   <div class="re-stack" role="img" :aria-label="`Score made of ${rows.filter(r=>r.available).map(r=>r.short+' '+r.points.toFixed(1)).join(', ')} points`">
    <span v-for="r in rows.filter(r=>r.available && r.points>0)" :key="r.key" :style="{width:r.points+'%',background:r.colour}" :title="`${r.label}: ${r.points.toFixed(1)} points`"></span>
    <span v-if="distancePoints!=null" class="re-distance" :style="{width:distancePoints+'%'}" :title="`Distance from your location: ${distancePoints.toFixed(1)} points`"></span>
   </div>
   <ul class="re-factors">
    <li v-for="r in rows" :key="r.key" :class="{missing:!r.available}">
     <i :style="{background:r.colour}"></i>
     <span class="re-name" :title="r.label">{{r.short}}</span>
     <span class="re-meter"><b v-if="r.available && r.value!=null" :style="{width:Math.max(2,r.value*100)+'%',background:r.colour}"></b></span>
     <em>{{r.available?r.points.toFixed(1)+' pts':'no data'}}</em>
    </li>
    <li v-if="distancePoints!=null"><i class="re-distance"></i><span class="re-name">Distance</span><span class="re-meter"><b class="re-distance" :style="{width:(distancePoints/8*100)+'%'}"></b></span><em>{{distancePoints.toFixed(1)}} pts</em></li>
   </ul>
   <p class="re-hint">Bar length = how well this site matches on that factor (0–1). Points = its share of the total score.</p>
   <div v-if="competitor && drivers.length" class="re-drivers">
    <span>Against #{{competitor.rank}}:</span>
    <b v-for="d in drivers" :key="d.label" :class="d.delta>=0?'up':'down'">{{driverName(d.label)}} {{d.delta>=0?'+':'−'}}{{Math.abs(d.delta).toFixed(1)}}</b>
   </div>
  </template>
  <p v-else>No factor breakdown was saved for this result.</p>
  <details class="re-more">
   <summary>How this score works</summary>
   <template v-if="rows.length">
    <table><thead><tr><th>Factor</th><th>Effective share</th><th>Points / 100</th></tr></thead><tbody><tr v-for="r in rows" :key="r.key"><th>{{r.label}}</th><td>{{r.available?r.effective.toFixed(1)+'%':(candidate.score_missing_policy==='zero_estimated'?'Missing (zero points)':'Excluded: missing data')}}</td><td>{{r.available?r.points.toFixed(2):'—'}}</td></tr><tr v-if="distancePoints!=null"><th>Distance from your location</th><td>8.0%</td><td>{{distancePoints.toFixed(2)}}</td></tr></tbody></table>
    <p v-if="candidate.score_missing_policy==='zero_estimated'">Missing factors contribute zero points while retaining their estimated confidence in the denominator. The score includes this missing-data penalty; it is not a probability of site suitability. Contributions are approximate because saved factor scores are rounded.</p>
    <p v-else>Effective shares include the saved confidence weights and normalization over available factors. Missing factors are excluded, not treated as evidence of a match. Contributions are approximate because saved factor scores are rounded.</p>
    <p v-if="candidate.ranking_terrain"><strong>Slope inputs:</strong> planetary ROI {{candidate.ranking_terrain.query_slope_p90_deg!=null?candidate.ranking_terrain.query_slope_p90_deg.toFixed(2)+'°':'unavailable'}}; Earth ROI {{candidate.ranking_terrain.earth_slope_p90_deg!=null?candidate.ranking_terrain.earth_slope_p90_deg.toFixed(2)+'°':'unavailable'}}. Both require a 30 m DEM grid over a centered 240 m window. <span v-if="candidate.ranking_terrain.missing_reason">{{candidate.ranking_terrain.missing_reason}}.</span> <a v-if="candidate.ranking_terrain.query_source_url" :href="candidate.ranking_terrain.query_source_url" target="_blank" rel="noopener">Planetary DEM source</a> <a v-if="candidate.ranking_terrain.earth_source_url" :href="candidate.ranking_terrain.earth_source_url" target="_blank" rel="noopener">Earth DEM source</a></p>
   </template>
   <p v-if="competitor && gap!=null">Compared with #{{competitor.rank}} {{otherName(competitor)}}: {{Math.abs(gap).toFixed(2)}} points {{gap>=0?'higher':'lower'}}{{Math.abs(gap)<0.01?' (effectively tied at this precision)':''}}.</p>
   <p v-if="candidate.validation_assessment"><strong>Interpretation:</strong> Validation tier takes precedence over engineering score. Passing both terrain models and preliminary vegetation screens is stronger evidence than a higher score with contradicted geometry. Station PSD remains a spatial proxy; this is not proof of construction suitability or Moon similarity.</p>
   <p v-else><strong>Interpretation:</strong> Rank #1 means the highest score among the screened candidates in this run, not a proven best site worldwide. Relative image, temperature and wind scores depend on the candidate pool. A close relative temperature match does not reproduce planetary temperatures; Earth wind does not reproduce lunar vacuum. Screening acceptance is not landing authorization or a radiation-shelter assessment.</p>
  </details>
 </article>
</template>

<style scoped>
.ranking-explanation{margin:14px 0;padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;line-height:1.5}
.re-head{display:flex;gap:16px;align-items:center}.re-head h3{margin:0;font-size:18px}.re-head p{margin:2px 0 0;font-size:13.5px;color:#475569}
.re-score{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:86px;height:86px;border-radius:50%;background:#0f172a;color:#fff}.re-score b{font-size:24px;line-height:1.1}.re-score span{font-size:12px;opacity:.75}
.re-gap{color:#0f172a!important;font-weight:600}
.re-stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#e2e8f0;margin:14px 0 10px}.re-stack span{height:100%}.re-stack span+span{border-left:2px solid #fff}
.re-distance{background:repeating-linear-gradient(45deg,#94a3b8 0 4px,#cbd5e1 4px 8px)!important}
.re-factors{list-style:none;padding:0;margin:0;display:grid;gap:7px}
.re-factors li{display:grid;grid-template-columns:10px 120px 1fr 64px;gap:10px;align-items:center;font-size:13.5px}
.re-factors li.missing{opacity:.5}.re-factors i{width:10px;height:10px;border-radius:3px}
.re-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.re-meter{height:8px;border-radius:4px;background:#f1f5f9;overflow:hidden}.re-meter b{display:block;height:100%;border-radius:4px}
.re-factors em{font-style:normal;text-align:right;color:#334155;font-variant-numeric:tabular-nums}
.re-hint{margin:8px 0 0;font-size:12.5px;color:#64748b}
.re-drivers{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;font-size:13px;color:#475569}
.re-drivers b{padding:3px 8px;border-radius:999px;font-weight:600}.re-drivers .up{background:#dcfce7;color:#166534}.re-drivers .down{background:#fee2e2;color:#991b1b}
.re-more{margin-top:12px;font-size:13px}.re-more summary{cursor:pointer;color:#334155;font-weight:600}.re-more p{font-size:13px}
.re-more table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}.re-more th,.re-more td{text-align:left;border-bottom:1px solid #e2e8f0;padding:7px 5px}
</style>
