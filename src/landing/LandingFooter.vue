<template>
  <section class="close">
    <div class="wrap reveal">
      <h2>Take a closer look.</h2>
      <p>Choose a planetary site and explore the Earth candidates behind it.</p>
      <a class="btn" href="#/setup">Open explorer <span class="arrow" aria-hidden="true">→</span></a>
    </div>
  </section>
  <footer class="foot">
    <div class="wrap">
      <p>TerraTwinn is a research prototype. Results are model-generated proposals, not verified analogs.</p>
      <p>Data credits: NASA/JPL-Caltech/University of Arizona (HiRISE), CTX and THEMIS imagery, USGS, USDA NAIP, Copernicus DEM. Naming a data source does not imply endorsement.</p>
    </div>
  </footer>
</template>

<style scoped>
.close { padding: clamp(56px, 10vh, 112px) 0; border-top: 1px solid #e6e7e4; text-align: center; }
h2 { font-size: clamp(34px, 5.6vw, 60px); font-weight: 700; letter-spacing: -0.035em; line-height: 1.05; }
.close p { margin: 14px auto 28px; max-width: 520px; font-size: 19px; color: var(--muted); }
.foot { padding: 28px 0 40px; border-top: 1px solid #e5e7eb; font-size: 13px; color: var(--muted); }
.foot p { max-width: 760px; }
.foot p + p { margin-top: 6px; }
</style>
