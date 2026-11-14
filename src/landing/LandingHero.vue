<script setup lang="ts">
const BASE = import.meta.env.BASE_URL
</script>

<template>
  <section class="hero">
    <div class="wrap">
      <p class="eyebrow reveal">Moon · Mars · Earth</p>
      <h1 class="reveal" style="--i: 1">Explore other worlds.<br />Start with Earth.</h1>
      <p class="lede reveal" style="--i: 2">Find Earth terrain to investigate for Moon and Mars exploration tasks.</p>
      <div class="cta reveal" style="--i: 3"><a class="btn" href="#/setup">Open explorer</a><a class="learn" href="#how" @click.prevent="($event.currentTarget as HTMLElement).closest('.lp')?.querySelector('#how')?.scrollIntoView({ behavior: 'smooth' })">See how it works</a></div>
      <p class="scope reveal" style="--i: 4">Research prototype · selected indexed regions</p>
      <div class="hero-comparison reveal" style="--i: 5">
        <figure><img :src="`${BASE}landing/mars-query.jpg`" alt="Mars terrain at Jezero delta" /><figcaption><span>MARS</span><strong>Jezero delta</strong><small>Planetary query · 250 m ROI</small></figcaption></figure>
        <figure><img :src="`${BASE}landing/earth-candidate.jpg`" alt="Earth candidate terrain at Phuong Mai dunes" /><figcaption><span>EARTH</span><strong>Phuong Mai dunes</strong><small>Retrieved candidate · source not recorded</small></figcaption></figure>
      </div>
      <p class="hero-note">Precomputed example · insufficient evidence for a verified analog</p>
    </div>
  </section>
</template>

<style scoped>
.hero { padding: clamp(52px, 9vh, 100px) 0 clamp(60px, 9vh, 100px); text-align: center; }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; color: #9d563c; }
h1 { margin-top: 14px; font-size: clamp(40px, 7.4vw, 80px); line-height: 1.04; font-weight: 700; letter-spacing: -.035em; }
.lede { max-width: 590px; margin: 22px auto 0; font-size: clamp(17px, 2.2vw, 21px); line-height: 1.45; color: var(--muted); }
.cta { margin-top: 30px; display: flex; justify-content: center; align-items: center; gap: 22px; flex-wrap: wrap; }
.learn { color: #34383d; font-size: 15px; text-underline-offset: 4px; }
.scope, .hero-note { margin-top: 14px; font-size: 13px; color: var(--muted); }
.hero-comparison { margin: clamp(40px, 7vh, 72px) auto 0; max-width: 880px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; text-align: left; }
figure { margin: 0; overflow: hidden; border-radius: 18px; background: #eeefed; }
figure img { width: 100%; aspect-ratio: 1.35; object-fit: cover; display: block; }
figcaption { display: grid; gap: 4px; padding: 17px 20px 20px; }
figcaption span { color: #9d563c; font-size: 11px; letter-spacing: .12em; font-weight: 700; }
figcaption strong { font-size: 18px; } figcaption small { color: var(--muted); font-size: 12px; }
@media(max-width: 600px) { .hero-comparison { grid-template-columns: 1fr; } figure img { aspect-ratio: 1.6; } }
</style>
