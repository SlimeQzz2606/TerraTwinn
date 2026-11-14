import { onBeforeUnmount, onMounted, type Ref } from 'vue'

// Adds `.in` to each `.reveal` element the first time it scrolls into view, then stops watching it.
export function useReveal(root: Ref<HTMLElement | null>) {
  let io: IntersectionObserver | undefined
  onMounted(() => {
    const el = root.value
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>('.reveal')
    if (!('IntersectionObserver' in window)) { items.forEach((n) => n.classList.add('in')); el.classList.add('js'); return }
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io?.unobserve(e.target) }
    }, { root: el, threshold: 0.12 })
    el.classList.add('js')
    items.forEach((n) => io!.observe(n))
  })
  onBeforeUnmount(() => io?.disconnect())
}
