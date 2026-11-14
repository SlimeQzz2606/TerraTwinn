<script setup lang="ts">
// 3D relief of a real DEM. Drag to rotate, wheel to zoom. Height is coloured by elevation above the lowest cell.
// All panels in one comparison share `scale` (vertical exaggeration) and `reliefMax`, so a rougher site looks rougher.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface Grid { rows: number; cols: number; spacing_m: number; z_m: number[]; relief_m: number }
const props = defineProps<{ grid: Grid; scale: number; reliefMax: number; label: string }>()
const host = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let frame = 0
let mesh: THREE.Mesh | null = null
let scene: THREE.Scene | null = null
let observer: ResizeObserver | null = null

// blue-green-yellow ramp, readable on a light background
function ramp(t: number): [number, number, number] {
  const stops: [number, number, number][] = [[0.17, 0.33, 0.69], [0.13, 0.64, 0.62], [0.97, 0.84, 0.25], [0.80, 0.33, 0.20]]
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1), i = Math.floor(x), f = x - i
  return [0, 1, 2].map(k => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as [number, number, number]
}

function build() {
  if (!scene) return
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }
  const { rows, cols, spacing_m: s, z_m: z } = props.grid
  const width = (cols - 1) * s, depth = (rows - 1) * s, unit = 1 / Math.max(width, depth)
  const geo = new THREE.PlaneGeometry(width * unit, depth * unit, cols - 1, rows - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const h = z[i]
    pos.setY(i, h * unit * props.scale)
    const [r, g, b] = ramp(props.reliefMax > 0 ? h / props.reliefMax : 0)
    colors.set([r, g, b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: rows <= 12 }))
  scene.add(mesh)
}

onMounted(() => {
  const el = host.value!
  scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 20)
  camera.position.set(0.95, 0.85, 1.15)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  el.appendChild(renderer.domElement)
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-1, 2, 1); scene.add(sun)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 0.8; controls.maxDistance = 3.2
  controls.target.set(0, 0.08, 0)
  const resize = () => {
    const w = el.clientWidth || 240, h = el.clientHeight || 190
    renderer!.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  resize(); observer = new ResizeObserver(resize); observer.observe(el)
  build()
  const loop = () => { controls!.update(); renderer!.render(scene!, camera); frame = requestAnimationFrame(loop) }
  loop()
})
watch(() => [props.grid, props.scale, props.reliefMax], build)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose()
  if (mesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }
  // release the WebGL context now: browsers allow only ~16, and the globes need theirs when panels are toggled often
  renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); renderer = null
})
</script>

<template>
  <div ref="host" class="elevation-surface" role="img" :aria-label="`3D relief of ${label}: ${grid.relief_m.toFixed(1)} m of relief`"></div>
</template>

<style scoped>
.elevation-surface { width: 100%; height: 190px; border-radius: 8px; background: linear-gradient(#f1f5f9, #e2e8f0); cursor: grab; touch-action: none }
.elevation-surface:active { cursor: grabbing }
</style>
