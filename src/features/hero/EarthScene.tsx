import { useEffect, useRef } from 'react'
import {
  AdditiveBlending, BackSide, CircleGeometry, Color, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, RingGeometry, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3,
  WebGLRenderer, type BufferGeometry, type Material, type Texture,
} from 'three'
import albedoUrl from '../../assets/earth/earth-albedo.jpg'
import reliefUrl from '../../assets/earth/earth-relief.jpg'
import roughnessUrl from '../../assets/earth/earth-roughness.jpg'
import cloudsUrl from '../../assets/earth/earth-clouds.jpg'

type Props = {
  /** Draw frames only while true (hero on screen, tab visible, not yet dissolved). */
  active: boolean
  /** Render still frames only (no animation loop). */
  reduced: boolean
  onLive: () => void
  onFail: () => void
}

/* The study region (Manali–Ennore, North Chennai). The ring marks the region on the globe; it is not an observation. */
const STUDY = { lat: 13.19, lon: 80.27 }
const FOV = 30
const SUN = new Vector3(-0.62, 0.48, 0.62).normalize()

const ATMOSPHERE_VERTEX = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const GLOW_FRAGMENT = `
varying vec3 vNormal;
uniform vec3 uSun;
uniform vec3 uTint;
uniform vec3 uTint2;
void main() {
  float sun = smoothstep(-0.35, 0.65, dot(vNormal, uSun));
  float k = pow(max(0.74 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.2);
  vec3 col = mix(uTint, uTint2, sun * 0.22);
  gl_FragColor = vec4(col, 1.0) * k * (0.22 + 0.9 * sun) * 0.72;
}`
const RIM_FRAGMENT = `
varying vec3 vNormal;
uniform vec3 uSun;
uniform vec3 uTint;
uniform vec3 uTint2;
void main() {
  float sun = smoothstep(-0.2, 0.7, dot(vNormal, uSun));
  float k = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.4);
  vec3 col = mix(uTint, uTint2, sun * 0.16);
  gl_FragColor = vec4(col, 1.0) * k * (0.12 + 0.95 * sun);
}`

const atmosphere = (radius: number, fragment: string, side: typeof BackSide | 0) => {
  const material = new ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX, fragmentShader: fragment, blending: AdditiveBlending, transparent: true, depthWrite: false,
    uniforms: { uSun: { value: SUN.clone() }, uTint: { value: new Color('#D8B6D5') }, uTint2: { value: new Color('#B7C65B') } },
    ...(side ? { side } : {}),
  })
  return new Mesh(new SphereGeometry(radius, 64, 48), material)
}

const surfaceDirection = (lat: number, lon: number) => {
  const phi = (lat * Math.PI) / 180, lambda = (lon * Math.PI) / 180
  return new Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda))
}

/**
 * The hero Earth: a lit, textured sphere with a cloud shell, atmospheric scattering and a marker for the study region.
 * Surface textures are generated locally from Natural Earth coastlines (see ATTRIBUTION.md); nothing is fetched at runtime.
 * Loaded lazily, so Three.js never enters the initial bundle. Any failure calls onFail and the hero falls back.
 */
export default function EarthScene({ active, reduced, onLive, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onLive, onFail })
  const activeRef = useRef(active)
  const controller = useRef<{ start: () => void; stop: () => void } | null>(null)

  useEffect(() => { callbacks.current = { onLive, onFail } })
  useEffect(() => {
    activeRef.current = active
    if (active) controller.current?.start()
    else controller.current?.stop()
  }, [active, reduced])

  useEffect(() => {
    const node = host.current
    if (!node) return
    const coarse = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: !coarse, powerPreference: 'low-power' })
    } catch (error) {
      console.warn('[WILDSIGNAL hero] WebGL renderer unavailable.', error)
      callbacks.current.onFail()
      return
    }
    const canvas = renderer.domElement
    canvas.style.cssText = 'display:block;width:100%;height:100%'
    node.appendChild(canvas)
    renderer.setClearColor(0x000000, 0)

    const textures: Texture[] = []
    const geometries: BufferGeometry[] = []
    const materials: Material[] = []
    let disposed = false
    let raf = 0
    let running = false
    let last = 0
    let elapsed = reduced ? 1.5 : 0
    let userYaw = 0
    let spin = 0
    let dragging = false
    let lastX = 0
    let frameOnLive = 0
    let draw = () => {}
    let teardownScene = () => {}

    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75)
    const resize = () => {
      const size = Math.max(2, node.clientWidth)
      renderer.setPixelRatio(dpr)
      renderer.setSize(size, size, false)
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(node)

    const loader = new TextureLoader()
    const load = (url: string, srgb: boolean) => new Promise<Texture>((resolve, reject) => {
      loader.load(url, (texture) => {
        if (srgb) texture.colorSpace = SRGBColorSpace
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
        textures.push(texture)
        resolve(texture)
      }, undefined, reject)
    })

    Promise.all([load(albedoUrl, true), load(reliefUrl, false), load(roughnessUrl, false), load(cloudsUrl, false)]).then(([albedo, relief, roughness, clouds]) => {
      if (disposed) return
      const scene = new Scene()
      const distance = 1 / Math.sin(Math.atan(Math.tan((FOV * Math.PI) / 360) / 1.45)) // planet fills 1/1.45 of the frame, leaving room for the atmosphere
      const camera = new PerspectiveCamera(FOV, 1, 0.1, 50)
      camera.position.set(0, 0, distance)

      const tilt = new Group()
      tilt.rotation.x = 0.4
      const globe = new Group()
      const baseYaw = -Math.PI / 2 - (STUDY.lon * Math.PI) / 180 + 0.12 // bring South Asia toward the camera
      tilt.add(globe)
      scene.add(tilt)

      const surface = new SphereGeometry(1, coarse ? 72 : 128, coarse ? 48 : 96)
      const surfaceMaterial = new MeshStandardMaterial({
        map: albedo, bumpMap: relief, bumpScale: 2.2, roughnessMap: roughness, roughness: 1, metalness: 0,
        emissive: new Color('#D8B6D5'), emissiveMap: albedo, emissiveIntensity: 0.16,
      })
      geometries.push(surface); materials.push(surfaceMaterial)
      globe.add(new Mesh(surface, surfaceMaterial))

      // study-region marker: lilac, static, geographically placed (decorative, not a detection)
      const direction = surfaceDirection(STUDY.lat, STUDY.lon)
      const marker = new Group()
      marker.position.copy(direction).multiplyScalar(1.004)
      marker.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction)
      const ringMaterial = new MeshBasicMaterial({ color: '#F7E8CE', transparent: true, opacity: 0.95, side: DoubleSide })
      const haloMaterial = new MeshBasicMaterial({ color: '#D8B6D5', transparent: true, opacity: 0.55, side: DoubleSide })
      const ring = new RingGeometry(0.026, 0.031, 48), halo = new RingGeometry(0.058, 0.0605, 64), dot = new CircleGeometry(0.0065, 24)
      geometries.push(ring, halo, dot); materials.push(ringMaterial, haloMaterial)
      marker.add(new Mesh(ring, ringMaterial), new Mesh(halo, haloMaterial), new Mesh(dot, ringMaterial))
      globe.add(marker)

      let cloudShell: Group | null = null
      if (!coarse) {
        const shell = new SphereGeometry(1.011, 96, 64)
        const shellMaterial = new MeshStandardMaterial({ color: '#F7E8CE', alphaMap: clouds, transparent: true, opacity: 0.26, depthWrite: false, roughness: 1, metalness: 0 })
        geometries.push(shell); materials.push(shellMaterial)
        cloudShell = new Group()
        cloudShell.add(new Mesh(shell, shellMaterial))
        tilt.add(cloudShell)
      }

      const glow = atmosphere(1.2, GLOW_FRAGMENT, BackSide)
      const rim = atmosphere(1.018, RIM_FRAGMENT, 0)
      for (const mesh of [glow, rim]) { geometries.push(mesh.geometry); materials.push(mesh.material as Material); scene.add(mesh) }

      const sun = new DirectionalLight('#F7E8CE', 3.1)
      sun.position.copy(SUN).multiplyScalar(6)
      scene.add(sun, new HemisphereLight('#D8B6D5', '#211622', 0.38))

      draw = () => {
        const yaw = baseYaw + elapsed * 0.03 + userYaw
        globe.rotation.y = yaw
        if (cloudShell) cloudShell.rotation.y = yaw * 1.0 + 0.5 + elapsed * 0.012
        renderer.render(scene, camera)
      }
      resize()
      frameOnLive = requestAnimationFrame(() => { if (!disposed) callbacks.current.onLive() })

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        const dt = now - last
        if (dt < (coarse ? 33 : 16)) return
        last = now
        elapsed += Math.min(dt, 100) / 1000
        if (!dragging && spin !== 0) { userYaw += spin; spin *= 0.94; if (Math.abs(spin) < 0.00005) spin = 0 }
        draw()
      }
      controller.current = {
        start: () => { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) },
        stop: () => { running = false; cancelAnimationFrame(raf) },
      }
      if (activeRef.current) controller.current.start()

      // Drag to turn the globe. The hero overlay owns touch input (touch-action: none) because the page is locked while it shows.
      const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; node.setPointerCapture(event.pointerId) }
      const move = (event: PointerEvent) => {
        if (!dragging) return
        const dx = event.clientX - lastX
        lastX = event.clientX
        userYaw += dx * 0.006
        spin = dx * 0.002
        if (!running) draw()
      }
      const up = () => { dragging = false }
      node.addEventListener('pointerdown', down)
      node.addEventListener('pointermove', move)
      node.addEventListener('pointerup', up)
      node.addEventListener('pointercancel', up)
      teardownScene = () => {
        node.removeEventListener('pointerdown', down)
        node.removeEventListener('pointermove', move)
        node.removeEventListener('pointerup', up)
        node.removeEventListener('pointercancel', up)
      }
    }).catch((error) => {
      if (disposed) return
      console.warn('[WILDSIGNAL hero] Earth textures or scene failed; using the fallback.', error)
      callbacks.current.onFail()
    })

    const onContextLost = (event: Event) => { event.preventDefault(); controller.current?.stop(); callbacks.current.onFail() }
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(frameOnLive)
      controller.current?.stop()
      controller.current = null
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      teardownScene()
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      textures.forEach((texture) => texture.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [reduced])

  return <div ref={host} className="ws-hero__canvas" />
}
