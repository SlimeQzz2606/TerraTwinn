<script setup lang="ts">
const steps = [
  { n: 1, title: 'Start with terrain you want to study.', body: 'Choose an available site on the Moon or Mars.' },
  { n: 2, title: 'Find Earth locations worth investigating.', body: 'Explore terrain candidates from selected indexed regions.' },
  { n: 3, title: 'Understand what matches and what differs.', body: 'Inspect measurements, limitations and sources.' },
]
</script>

<template>
  <section id="how" class="steps">
    <div class="wrap">
      <h2 class="reveal">From a planetary site to an Earth shortlist.</h2>
      <ol>
        <li v-for="(s, k) in steps" :key="s.n" class="reveal" :style="{ '--i': k + 1 }">
          <span class="num" aria-hidden="true">{{ s.n }}</span>
          <h3>{{ s.title }}</h3>
          <p>{{ s.body }}</p>
        </li>
      </ol>
      <p class="defs reveal" style="--i: 4">
        <strong>Analog:</strong> an Earth location that shares useful characteristics with another world. No Earth site reproduces every planetary condition.
        <strong>ROI:</strong> the region of interest, the area selected for inspection.
      </p>
    </div>
  </section>
</template>

<style scoped>
.steps { padding: clamp(48px, 9vh, 96px) 0; border-top: 1px solid #e6e7e4; }
h2 { font-size: clamp(30px, 4.6vw, 48px); line-height: 1.1; font-weight: 700; letter-spacing: -0.03em; max-width: 640px; }
ol { list-style: none; padding: 0; margin: 40px 0 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 3vw, 40px); }
.num { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 2.6px solid #000; border-radius: 50%; font-weight: 800; font-size: 16px; }
h3 { margin-top: 16px; font-size: 21px; font-weight: 650; letter-spacing: -0.01em; }
li p { margin-top: 6px; color: var(--muted); font-size: 17px; }
.defs { margin-top: 44px; max-width: 720px; font-size: 15px; color: var(--muted); }
.defs strong { color: #000; font-weight: 600; }
@media (max-width: 720px) { ol { grid-template-columns: 1fr; } }
</style>
