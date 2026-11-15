import type { GlobeInstance } from 'globe.gl'

/** Illustrative sky only: fixed directions and exaggerated sizes, no ephemeris. */
export function createCelestialBackdrop(THREE: typeof import('three'), globe: GlobeInstance, moon: boolean, base: string) {
  const group = new THREE.Group(); group.name = 'illustrative-sky-bodies'
  const sun = new THREE.Mesh(new THREE.SphereGeometry(115, 32, 24), new THREE.MeshBasicMaterial({color:0xfff4d0}))
  const sunPoint=globe.getCoords(18,55,70);sun.position.set(sunPoint.x,sunPoint.y,sunPoint.z)
  sun.name = 'illustrative-sun'; group.add(sun)
  const canvas = document.createElement('canvas'); canvas.width=canvas.height=128
  const context=canvas.getContext('2d')!
  const halo=context.createRadialGradient(64,64,0,64,64,64)
  halo.addColorStop(0,'rgba(255,245,210,.9)'); halo.addColorStop(.15,'rgba(255,210,125,.45)'); halo.addColorStop(1,'rgba(255,170,65,0)')
  context.fillStyle=halo; context.fillRect(0,0,128,128)
  context.save(); context.translate(64,64)
  for(let i=0;i<8;i++){
    context.rotate(Math.PI/4)
    const ray=context.createLinearGradient(0,0,48,0)
    ray.addColorStop(0,'rgba(255,245,218,.5)');ray.addColorStop(1,'rgba(255,218,150,0)')
    context.strokeStyle=ray;context.lineWidth=i%2===0?1.2:.7
    context.beginPath();context.moveTo(0,0);context.lineTo(48,0);context.stroke()
  }
  context.restore()
  const glowTexture=new THREE.CanvasTexture(canvas)
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}))
  glow.position.copy(sun.position); glow.scale.set(1100,1100,1); group.add(glow)
  let earth: import('three').Mesh | undefined
  let earthTexture: import('three').Texture | undefined
  if(moon){
    earthTexture=new THREE.TextureLoader().load(`${base}textures/earth.jpg`)
    earthTexture.colorSpace=THREE.SRGBColorSpace
    earth=new THREE.Mesh(new THREE.SphereGeometry(65,48,32),new THREE.MeshBasicMaterial({map:earthTexture}))
    const point=globe.getCoords(8,0,24); earth.position.set(point.x,point.y,point.z)
    earth.rotation.y=-Math.PI/2; earth.name='illustrative-earth';group.add(earth)
  }
  group.traverse(object=>{object.raycast=()=>{}});globe.scene().add(group)
  return {
    dispose(){
      group.removeFromParent()
      group.traverse((object:any)=>{object.geometry?.dispose();object.material?.dispose()})
      glowTexture.dispose();earthTexture?.dispose()
    },
  }
}
