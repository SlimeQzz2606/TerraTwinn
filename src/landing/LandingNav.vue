<script setup lang="ts">
defineProps<{ scrolled: boolean }>()
const emit = defineEmits<{ go: [string] }>()
</script>

<template>
  <header class="nav" :class="{ scrolled }">
    <div class="wrap nav-in">
      <a class="brand" href="#/" aria-label="TerraTwinn home" @click.prevent="emit('go', 'top')">TerraTwinn</a>
      <nav class="links" aria-label="Page sections">
        <button class="link-btn" @click="emit('go', 'how')">How it works</button>
        <button class="link-btn" @click="emit('go', 'evidence')">Evidence</button>
      </nav>
      <a class="btn sm" href="#/setup">Open explorer <span class="arrow" aria-hidden="true">↗</span></a>
    </div>
  </header>
</template>

<style scoped>
.nav { position: sticky; top: 0; z-index: 10; height: 58px; background: rgba(255, 255, 255, 0.86); backdrop-filter: saturate(180%) blur(14px); -webkit-backdrop-filter: saturate(180%) blur(14px); border-bottom: 2px solid transparent; transition: border-color 0.3s ease; }
.nav.scrolled { border-bottom-color: #e6e7e4; }
.nav-in { height: 100%; display: flex; align-items: center; gap: 28px; }
.brand { font-size: 23px; font-weight: 700; letter-spacing: -0.3px; text-decoration: none; margin-right: auto; }
.links { display: flex; gap: 22px; }
@media (max-width: 640px) { .links { display: none; } }
</style>
