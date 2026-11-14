<script setup lang="ts">
import { ref } from 'vue'
import SegControl from './SegControl.vue'

const BASE = import.meta.env.BASE_URL
const tab = ref('imagery')
const tabs = [{ value: 'imagery', label: 'Imagery' }, { value: 'evidence', label: 'Evidence' }, { value: 'limits', label: 'Limitations' }]
</script>

<template>
  <section id="evidence" class="evidence">
    <div class="wrap">
      <h2 class="reveal">Look beyond the resemblance.</h2>
      <p class="sub reveal" style="--i: 1">Explore the imagery and available measurements behind one precomputed candidate.</p>

      <div class="panel reveal" style="--i: 2">
        <div class="panel-top">
          <SegControl kind="tabs" label="Example details" :options="tabs" v-model="tab" />
          <span class="chip">Candidate · insufficient evidence</span>
        </div>

        <div v-show="tab === 'imagery'" class="body" role="tabpanel">
          <div class="imgs">
            <figure>
              <img :src="`${BASE}landing/mars-query.jpg`" width="224" height="224" alt="Mars terrain, Jezero delta, HiRISE greyscale image" />
              <figcaption><strong>Mars · Jezero delta</strong><span>HiRISE, 250 m ROI at about 1 m per pixel</span></figcaption>
            </figure>
            <figure>
              <img :src="`${BASE}landing/earth-candidate.jpg`" width="224" height="224" alt="Earth candidate terrain, Phuong Mai dunes, Vietnam" />
              <figcaption><strong>Earth · Phuong Mai dunes, Vietnam</strong><span>Candidate #1, about 10 m per pixel</span></figcaption>
            </figure>
          </div>
          <p class="note">The Mars image is about 1 m per pixel; the Earth image is about 10 m per pixel. Equal display size does not indicate equal detail.</p>
        </div>

        <div v-show="tab === 'evidence'" class="body" role="tabpanel">
          <table>
            <thead><tr><th scope="col">Measurement</th><th scope="col">Mars</th><th scope="col">Earth</th></tr></thead>
            <tbody>
              <tr><th scope="row">Slope, 90th percentile</th><td>4.15°<small>10 m baseline · HiRISE DTM</small></td><td>8.41°<small>30 m baseline · Copernicus GLO-30</small></td></tr>
              <tr><th scope="row">Elevation range in patch</th><td>6.2 m</td><td class="na">Not measured</td></tr>
              <tr><th scope="row">Surface roughness</th><td class="na">Not measured</td><td class="na">Not measured</td></tr>
            </tbody>
          </table>
          <p class="note">Slopes use different baselines, so compare them with care. "Not measured" means no value was computed, not zero.</p>
        </div>

        <div v-show="tab === 'limits'" class="body" role="tabpanel">
          <ul class="limits">
            <li>Retrieved by image similarity only. No expert or model verification has been done for this pair.</li>
            <li>The Earth image is about ten times coarser than the Mars image.</li>
            <li>The Earth coordinates are approximate and the region has not been verified.</li>
            <li>An Earth site cannot reproduce gravity, atmosphere or surface chemistry.</li>
          </ul>
        </div>

        <p class="credit">Precomputed example; not a verified analog. Mars imagery: NASA/JPL-Caltech/University of Arizona (HiRISE). Earth elevation: Copernicus DEM GLO-30. The Earth image source is not recorded in this result.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.evidence { padding: clamp(48px, 9vh, 96px) 0; border-top: 1px solid #e6e7e4; }
h2 { font-size: clamp(30px, 4.6vw, 48px); line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; }
.sub { margin-top: 14px; max-width: 640px; font-size: 18px; color: var(--muted); }
/* The black card echoes the console's information popover */
.panel { margin-top: 36px; background: #f2f3f1; color: #171819; border-radius: 18px; padding: clamp(16px, 3vw, 28px); border: 1px solid #e2e5e2; }
.panel-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.chip { padding: 5px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; background: #fde68a; color: #000; }
.body { margin-top: 22px; min-height: 300px; animation: swap 0.4s var(--ease); }
@keyframes swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.imgs { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(12px, 2vw, 24px); }
figure { margin: 0; }
img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; display: block; border-radius: 10px; background: #1b1b1b; }
figcaption { display: flex; flex-direction: column; margin-top: 10px; font-size: 14px; }
figcaption span { color: #59616b; }
.note { margin-top: 16px; font-size: 14px; color: #59616b; max-width: 680px; }
table { width: 100%; border-collapse: collapse; font-size: 16px; }
th, td { text-align: left; padding: 14px 10px 14px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.12); vertical-align: top; font-weight: 400; }
thead th { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #68717a; font-weight: 600; }
tbody th { font-weight: 500; }
td small { display: block; font-size: 12px; color: #68717a; }
.na { color: #68717a; font-style: italic; }
.limits { margin: 0; padding-left: 20px; display: grid; gap: 12px; font-size: 17px; }
.credit { margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(0, 0, 0, 0.12); font-size: 12.5px; color: #68717a; }
@media (max-width: 560px) { .imgs { grid-template-columns: 1fr; } .body { min-height: 0; } }
@media (prefers-reduced-motion: reduce) { .body { animation: none; } }
</style>
