<script setup lang="ts">
import {computed} from 'vue'
import metricsReportUrl from '../../docs/TERRATWINN_METRICS_REPORT_EN.pdf?url'
interface Part {value:number|null;weight:number;confidence:number;method?:string;earth_mean_speed_ms?:number|null;half_score_speed_ms?:number}
interface Environment {temperature_midrange_K?:number|null;temperature_range_K?:number|null;temperature_provenance?:string;wind_mean_ms?:number|null;wind_provenance?:string;lithology?:string[];lithology_provenance?:string}
interface Candidate {factor_score?:number;ranking_mode?:string;rank:number;region:string;region_name?:string;cosine?:number|null;earth_environment?:Environment;composite?:number;final_score?:number;distance_km?:number|null;score_missing_policy?:string;validation_assessment?:string;score_components?:Record<string,Part>;ranking_terrain?:{query_slope_p90_deg:number|null;earth_slope_p90_deg:number|null;query_source_url?:string|null;earth_source_url?:string|null;missing_reason:string|null}}
const props=defineProps<{candidate:Candidate;candidates:Candidate[];targetEnvironment?:Environment|null;body?:'moon'|'mars';crop?:boolean}>()
const labels:Record<string,string>={visual:'Image resemblance',lithology:'Rock / mineral classes',temperature:'Regional temperature resemblance',slope:'Slope compatibility',wind:'Regional wind resemblance',geometry:'iLILA geometry margin (line of sight, relief, route)',seismic:'Seismic noise (0.1-10 Hz, Earth NLNM/NHNM reference)',thermal:'Thermal cycling similarity',anchoring:'Loose cover over hard rock (anchoring)',anthropogenic:'Human noise (night lights, roads)'}
const shortLabels:Record<string,string>={visual:'Image',lithology:'Rock / minerals',temperature:'Temperature',slope:'Slope',wind:'Wind',geometry:'Geometry',seismic:'Seismic noise',thermal:'Thermal cycling',anchoring:'Anchoring',anthropogenic:'Human noise'}
const colours:Record<string,string>={visual:'#2563eb',lithology:'#b45309',temperature:'#dc2626',slope:'#0f766e',wind:'#7c3aed',geometry:'#0f766e',seismic:'#7c3aed',thermal:'#dc2626',anchoring:'#b45309',anthropogenic:'#475569'}
const otherName=(c:Candidate)=>c.region_name??c.region.replace(/_/g,' ')
const driverName=(label:string)=>{const r=rows.value.find(x=>x.label===label);return r?r.short:label}
const score=(c:Candidate)=>c.final_score??c.composite
function breakdown(c:Candidate){
 const entries=Object.entries(c.score_components??{})
 const denominator=entries.reduce((sum,[,p])=>sum+((p.value!=null||c.score_missing_policy==='zero_estimated')&&p.confidence>0?p.weight*p.confidence:0),0)
 const scale=c.final_score!=null&&c.distance_km!=null?0.92:1
 return entries.map(([key,p])=>({key,label:key==='wind'&&p.method==='lunar_absolute_zero_wind_v1'?'Absolute wind match to lunar zero-wind reference':labels[key]??key,short:shortLabels[key]??key,colour:colours[key]??'#64748b',value:p.value,available:p.value!=null&&p.confidence>0,effective:denominator&&p.value!=null?scale*p.weight*p.confidence/denominator*100:0,points:denominator&&p.value!=null?scale*p.weight*p.confidence*p.value/denominator*100:0}))
}
const rows=computed(()=>breakdown(props.candidate))
const lunarWind=computed(()=>props.candidate.score_components?.wind?.method==='lunar_absolute_zero_wind_v1'?props.candidate.score_components.wind:null)
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
const fmt=(n:number|null|undefined,unit:string,digits=2)=>n!=null&&Number.isFinite(n)?`${n.toFixed(digits)} ${unit}`:'Unavailable'
const classes=(a?:string[])=>a?.length?a.map(s=>s.replace(/_/g,' ')).join(', '):'Unavailable'
interface MetricReference { formula: string; basis: string; sources: { title: string; url: string }[] }
const references: Record<string, MetricReference> = {
 visual: {formula:'cos = (q · e) / (‖q‖ ‖e‖)\ns = (cos − cos_min) / (cos_max − cos_min)', basis:'DINOv3 ViT-L/16 SAT-493M, grayscale 224 px input. Cosine and min–max normalization are standard methods; the choice of ranking weights is a project assumption. Equal cosines score 1.', sources:[{title:'Siméoni et al. (2025) · DINOv3',url:'https://arxiv.org/abs/2508.10104'},{title:'Earth imagery · Sentinel-2 SR Harmonized (10 m)',url:'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED'},{title:'Moon imagery · LROC PDS',url:'https://pds.lroc.im-ldi.com/'},{title:'Mars imagery · CTX mosaic service',url:'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer'}]},
 slope: {formula:'tol = max(3°, 0.30 × q_p90)\ns = max(0, 1 − |e_p90 − q_p90| / (2 × tol))',basis:'p90 is the 90th percentile of DEM-derived slope. Compare a centered 240 × 240 m window on a common 30 m grid. The tolerance and similarity rule are project choices. Coarse regional terrain is excluded.',sources:[{title:'Earth DEM · Copernicus GLO-30',url:'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30_2024_1'},{title:'Lunar polar DEM · NASA LOLA',url:'https://pgda.gsfc.nasa.gov/products/90'},{title:'Mars local DEM · HiRISE stereo DTMs',url:'https://hirise.lpl.arizona.edu/dtm/'}]},
 lithology: {formula:'s = ½ [mean_a∈Q max_b∈E m(a,b) + mean_b∈E max_a∈Q m(a,b)]',basis:'Symmetric best-class overlap. Same class: 1; unlisted pair: 0. Examples: clay–clastic sediment 0.5, evaporite–carbonate 0.4, regolith–basaltic 0.3. Compatibility coefficients are team judgement, not coefficients taken from the cited geology sources.',sources:[{title:'Earth geologic map units · Macrostrat',url:'https://macrostrat.org/'},{title:'Lunar Sourcebook · Heiken, Vaniman & French (1991)',url:'https://www.lpi.usra.edu/publications/books/lunar_sourcebook/'}]},
 temperature: {formula:'Tmid = (Tmax + Tmin) / 2; ΔT = Tmax − Tmin\nd = |Earth − Planet|\ncloseness(d) = 1 − (d − d_min) / (d_max − d_min)\ns = mean(closeness(Tmid), closeness(ΔT))',basis:'Equal differences score 1; average available terms. Relative scaling is a project choice. Earth: MODIS 1 km, 8-day day/night composites, 2018–2023. Moon: polar Diviner or latitude-based estimates. Mars: MCD v6.2 modelled surface temperature. These products have different spatial and temporal sampling.',sources:[{title:'Earth · MODIS MOD11A2.061',url:'https://doi.org/10.5067/MODIS/MOD11A2.061'},{title:'Moon · Williams et al. (2017), Diviner',url:'https://doi.org/10.1016/j.icarus.2016.08.012'},{title:'Mars · Mars Climate Database',url:'https://www-mars.lmd.jussieu.fr/'}]},
 wind: {formula:'Moon: s = 2^(−v_Earth / 0.5 m/s)\nMars: d = |v_Earth − v_Mars|\ns = 1 − (d − d_min) / (d_max − d_min)',basis:'Earth: ERA5 regional 10 m wind, Jan 2015–Jul 2020, about 28 km cells. Mars: MCD modelled 10 m wind. Moon: zero atmospheric wind by physical convention. Both similarity rules are project choices. The current absolute Moon decay supersedes the relative lunar rule in the PDF; calm Earth air does not reproduce vacuum.',sources:[{title:'Hersbach et al. (2020) · ERA5 global reanalysis',url:'https://doi.org/10.1002/qj.3803'},{title:'Earth wind dataset · ERA5 DAILY',url:'https://developers.google.com/earth-engine/datasets/catalog/ECMWF_ERA5_DAILY'},{title:'Mars wind · Mars Climate Database',url:'https://www-mars.lmd.jussieu.fr/'}]}
}
const factorDetails=computed(()=>{
 const q=props.targetEnvironment, e=props.candidate.earth_environment, t=props.candidate.ranking_terrain
 const moon=props.body==='moon', crop=props.crop
 const data:Record<string,{unit:string;inputs:string;method:string}>={
  visual:{unit:'Cosine similarity: no physical unit (−1 to 1); factor score: 0–1',inputs:`DINOv3 cosine: ${fmt(props.candidate.cosine,'(unitless)',3)}`,method:crop?'Compare pooled cached DINOv3 patch features for equal-size surface windows using cosine similarity; min–max scale the cosine across eligible candidates. The crop features are an approximation, not a new model inference.':'Compare DINOv3 image features using cosine similarity; min–max scale the cosine across eligible candidates. A factor score of 1 means best in this pool, not identical images.'},
  slope:{unit:'Slope p90: degrees (°); factor score: 0–1',inputs:`Planet: ${fmt(t?.query_slope_p90_deg,'°')} · Earth: ${fmt(t?.earth_slope_p90_deg,'°')}`,method:crop?'Local slope is not scored for the selected crop.':'Let q and e be the planetary and Earth slope p90 in degrees. Similarity = max(0, 1 − |e − q| / (2 × max(3°, 0.3 × q))). Both inputs require compatible local DEMs.'},
  temperature:{unit:'Temperature midpoint: kelvin (K); day–night range: K; factor score: 0–1',inputs:`Planet: midpoint ${fmt(q?.temperature_midrange_K,'K')}, range ${fmt(q?.temperature_range_K,'K')} (${q?.temperature_provenance??'source unavailable'}) · Earth: midpoint ${fmt(e?.temperature_midrange_K,'K')}, range ${fmt(e?.temperature_range_K,'K')} (${e?.temperature_provenance??'source unavailable'})`,method:'Calculate the absolute difference for midpoint and for range. For each, scale the differences within the eligible candidate pool so the closest scores 1 and the farthest 0; average the available results. Temperatures may come from models or regional products with different methods.'},
  wind:{unit:'Mean wind speed: metres per second (m/s); factor score: 0–1',inputs:`Planet: ${moon?'0.00 m/s (lunar atmospheric reference)':fmt(q?.wind_mean_ms,'m/s')} · Earth: ${fmt(e?.wind_mean_ms??lunarWind.value?.earth_mean_speed_ms,'m/s')}`,method:moon?'Lunar rule: similarity = 2^(−Earth mean wind speed / 0.5 m/s). The score halves for every 0.5 m/s. This is a project convention, not a physical vacuum equivalent.':'For Mars, take the absolute difference in mean wind speed and min–max scale the differences across eligible candidates: closest scores 1, farthest 0.'},
  lithology:{unit:'Rock / mineral classes: categories; factor score: 0–1 (unitless)',inputs:`Planet: ${classes(q?.lithology)} · Earth: ${classes(e?.lithology)}`,method:'Compare each class with its best match on the other body, then average in both directions. Identical classes score 1; selected related classes receive partial credit. These categories do not measure soil hardness.'}
 }
 return rows.value.filter(r=>data[r.key]).map(r=>({...r,...data[r.key]}))
})
</script>
<template>
 <article v-if="candidate.ranking_mode" class="ranking-explanation factor-explanation">
  <h3>#{{candidate.rank}} · {{labels[candidate.ranking_mode] ?? candidate.ranking_mode}}</h3>
  <p><strong>{{((candidate.factor_score??0)*100).toFixed(1)}} / 100</strong> · single-factor similarity, not a probability.</p>
  <p>Only this factor determines the order. Existing acceptance, country/continent and applicable low-Sun screens still apply. Distance and the other factor weights do not contribute.</p>
  <div v-for="factor in factorDetails.filter(r=>r.key===candidate.ranking_mode)" :key="factor.key" class="re-unit-item">
   <p><b>Units:</b> {{factor.unit}}</p><p><b>Inputs:</b> {{factor.inputs}}</p><p><b>Similarity:</b> {{factor.method}}</p>
  </div>
  <details v-if="references[candidate.ranking_mode]" class="re-more"><summary>Formula, data sources &amp; references</summary><pre>{{references[candidate.ranking_mode]?.formula}}</pre><p>{{references[candidate.ranking_mode]?.basis}}</p><ul><li v-for="source in references[candidate.ranking_mode]?.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{source.title}}</a></li></ul><a :href="metricsReportUrl" target="_blank" rel="noopener noreferrer">Read the original metrics report (PDF)</a></details>
  <p v-if="candidate.ranking_mode==='visual'">Raw cosine breaks ties between rounded image-factor scores; remaining ties use site ID.</p>
  <p>Overall remains available from Rank by → Overall (original formula).</p>
 </article>
 <article v-else class="ranking-explanation">
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
     <span class="re-meter"><b v-if="r.available && r.value!=null" :style="{width:Math.max(0,r.value*100)+'%',background:r.colour}"></b></span>
     <em>{{r.available?r.points.toFixed(1)+' pts':'no data'}}</em>
    </li>
    <li v-if="distancePoints!=null"><i class="re-distance"></i><span class="re-name">Distance</span><span class="re-meter"><b class="re-distance" :style="{width:(distancePoints/8*100)+'%'}"></b></span><em>{{distancePoints.toFixed(1)}} pts</em></li>
   </ul>
   <p class="re-hint">Bar length = how well this site matches on that factor (0–1). Points = its share of the total score.</p>
   <p v-if="lunarWind" class="re-hint">The Moon has no atmospheric wind (0 m/s). Earth regional mean: {{lunarWind.earth_mean_speed_ms??'not available'}} m/s. Wind match uses an absolute decay, halving every {{lunarWind.half_score_speed_ms}} m/s; it is not normalized to the best candidate. This is a project screening rule; calm air does not reproduce lunar vacuum.</p>
   <details :key="candidate.region" v-if="factorDetails.length" class="re-units">
    <summary>Metrics explained <span>Measurements, formulas &amp; references</span></summary>
    <p>Factor similarities are unitless, from 0 to 1. Points below are weighted contributions to the total, not physical units or probabilities.</p>
    <details v-for="factor in factorDetails" :key="factor.key" class="re-unit-item">
     <summary>{{factor.short}}<span class="re-unit-score">{{factor.available && factor.value!=null ? `${factor.value.toFixed(3)} / 1 · ${factor.points.toFixed(1)} pts` : 'Not scored: no data'}}</span></summary>
     <p><b>Units:</b> {{factor.unit}}</p><p><b>Inputs:</b> {{factor.inputs}}</p><p><b>Similarity:</b> {{factor.method}}</p>
     <pre>{{references[factor.key]?.formula}}</pre>
     <p>{{references[factor.key]?.basis}}</p>
     <p v-if="factor.key==='slope' && candidate.ranking_terrain"><a v-if="candidate.ranking_terrain.query_source_url" :href="candidate.ranking_terrain.query_source_url" target="_blank" rel="noopener noreferrer">This planetary DEM product</a> <a v-if="candidate.ranking_terrain.earth_source_url" :href="candidate.ranking_terrain.earth_source_url" target="_blank" rel="noopener noreferrer">This Earth DEM product</a></p>
     <ul class="re-citations"><li v-for="source in references[factor.key]?.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{source.title}}</a></li></ul>
    </details>
    <details v-if="distancePoints!=null" class="re-unit-item"><summary>Distance · formula &amp; inputs</summary><strong>Distance</strong><span class="re-unit-score">{{distancePoints.toFixed(1)}} pts</span><p><b>Unit:</b> kilometres (km), great-circle distance. <b>Input:</b> {{fmt(candidate.distance_km,'km',1)}}.</p><p><b>Contribution:</b> 8 × max(0, 1 − distance / 20,015 km) points. The remaining 92 points come from the weighted factor score. Haversine uses mean Earth radius 6371.0088 km; the linear decay and 8% weight are project choices. City coordinates come from GeoNames; site coordinates come from the curated catalog.</p><a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames city data</a></details>
    <p>Weighted factor score = Σ(weight × confidence × similarity) / Σ(weight × confidence), using the result's missing-data policy. Similarity scores are not measured quantities, and displayed components may be rounded.</p>
    <details class="re-unit-item"><summary>Composite, weights &amp; data confidence</summary><pre>composite = Σ(W × c × s) / Σ(W × c)
with city: final = 0.92 × composite + 0.08 × distance_score
without city: final = composite</pre><p>Base weights with city: image 40%, lithology 20%, temperature 15%, slope 15%, wind 10%. Without city: 35%, 21.6667%, 16.25%, 16.25%, 10.8333%. The result's actual saved weights and effective shares are shown under “How this score works”.</p><p>Environmental confidence = query provenance factor × Earth provenance factor. Measured/physical: 1; map/literature: 0.9; model: 0.85; regional literature: 0.7; estimated/unknown: 0.5. Visual and available comparable slope use 1. Weights and confidence coefficients are team assumptions, not fitted to verified analog labels.</p><p v-if="candidate.score_missing_policy==='zero_estimated'">This result retains missing factors with estimated confidence in the denominator and assigns zero points.</p><p v-else>Missing factors are excluded from numerator and denominator. Remaining factors are renormalized.</p></details>
    <p><a :href="metricsReportUrl" target="_blank" rel="noopener noreferrer">Read the original metrics report (PDF)</a> · Current crop retrieval and lunar wind updates are explained above. Dataset references describe the source products; they do not independently validate this candidate.</p>
   </details>
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
.re-units{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:13px;color:#334155}.re-units h4{margin:0;font-size:15px;color:#0f172a}.re-units>p{margin:6px 0}.re-unit-item{padding:10px 0;border-bottom:1px solid #e2e8f0}.re-unit-item>strong{color:#0f172a}.re-unit-score{margin-left:auto;font-variant-numeric:tabular-nums}.re-unit-item p{margin:4px 0;overflow-wrap:anywhere}
.re-drivers{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;font-size:13px;color:#475569}
.re-drivers b{padding:3px 8px;border-radius:999px;font-weight:600}.re-drivers .up{background:#dcfce7;color:#166534}.re-drivers .down{background:#fee2e2;color:#991b1b}
.re-more{margin-top:12px;font-size:13px}.re-more summary{cursor:pointer;color:#334155;font-weight:600}.re-more p{font-size:13px}
.re-more table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}.re-more th,.re-more td{text-align:left;border-bottom:1px solid #e2e8f0;padding:7px 5px}
</style>

<style scoped>
.re-units>summary{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;cursor:pointer;font-size:15px;font-weight:650;color:#0f172a;padding:8px 0;list-style:revert}
.re-units>summary span{font-size:12px;font-weight:400;color:#64748b}
.re-unit-item>summary{display:flex;align-items:center;gap:12px;cursor:pointer;font-weight:600;color:#0f172a;padding:5px 0}
.re-unit-item>summary::before{content:'+';color:#64748b;font-size:16px;flex-shrink:0}.re-unit-item[open]>summary::before{content:'−'}
.re-unit-score{font-size:12px;font-weight:400;text-align:right;color:#475569}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:12px;line-height:1.7;color:#0f172a}
.re-citations{padding-left:20px;line-height:1.8}a{color:#1d4ed8;text-underline-offset:3px}summary:focus-visible{outline:2px solid #2563eb;outline-offset:4px;border-radius:4px}
@media(max-width:480px){.re-unit-item>summary{flex-wrap:wrap}.re-unit-score{margin-left:24px;width:100%;text-align:left}}
</style>
