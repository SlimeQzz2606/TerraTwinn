<script setup lang="ts">
// Capsule segmented control with a sliding indicator. Used for the Moon/Mars toggle and the evidence tabs.
const props = defineProps<{ options: { value: string; label: string }[]; modelValue: string; kind: 'toggle' | 'tabs'; label: string; tone?: 'dark' | 'light' }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const index = () => Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  e.preventDefault()
  const n = props.options.length
  const next = props.options[(index() + (e.key === 'ArrowRight' ? 1 : n - 1)) % n]!
  emit('update:modelValue', next.value)
  ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')[props.options.indexOf(next)]?.focus()
}
</script>

<template>
  <div class="seg" :class="tone ?? 'dark'" :role="kind === 'tabs' ? 'tablist' : 'group'" :aria-label="label" :style="{ '--n': options.length, '--i': index() }" @keydown="onKey">
    <span class="seg-pill" aria-hidden="true"></span>
    <button v-for="o in options" :key="o.value" type="button" class="seg-btn" :class="{ on: o.value === modelValue }"
      :role="kind === 'tabs' ? 'tab' : undefined" :aria-selected="kind === 'tabs' ? o.value === modelValue : undefined"
      :aria-pressed="kind === 'toggle' ? o.value === modelValue : undefined" :tabindex="o.value === modelValue || kind === 'toggle' ? 0 : -1"
      @click="emit('update:modelValue', o.value)">{{ o.label }}</button>
  </div>
</template>

<style scoped>
.seg { position: relative; display: inline-grid; grid-template-columns: repeat(var(--n), 1fr); border-radius: 9999px; padding: 4px; }
.seg.dark { background: #000; }
.seg.light { background: #f3f4f6; }
.seg-pill {
  position: absolute; top: 4px; bottom: 4px; left: 4px;
  width: calc((100% - 8px) / var(--n)); border-radius: 9999px; background: #8b9bb4;
  transform: translateX(calc(var(--i) * 100%));
  transition: transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);
}
.seg.light .seg-pill { background: #000; }
.seg-btn {
  position: relative; z-index: 1; min-height: 38px; padding: 0 18px; border: 0; background: none; border-radius: 9999px;
  font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; white-space: nowrap; color: #fff; transition: color 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.seg.dark .seg-btn.on { color: #000; font-weight: 600; }
.seg.light .seg-btn { color: #000; }
.seg.light .seg-btn.on { color: #fff; }
.seg-btn:active { transform: scale(0.95); }
@media (prefers-reduced-motion: reduce) { .seg-pill, .seg-btn { transition: none; } }
</style>
