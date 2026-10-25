import { useEffect, useRef } from 'react'
import { VERTEX_SHADER, fragmentShader } from './shader'

type Props = {
  /** Draw frames only while true (hero on screen, tab visible, not yet dissolved). */
  active: boolean
  /** Render a single still frame and never start the animation loop. */
  reduced: boolean
  onLive: () => void
  onFail: () => void
}

type Controller = { start: () => void; stop: () => void }

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[WILDSIGNAL hero] shader compile failed; using the static planet.', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/** The 3D-like planet. Pure WebGL1, one draw call per frame, no dependencies. Falls back via onFail. */
export function LivingEarth({ active, reduced, onLive, onFail }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controller = useRef<Controller | null>(null)
  const callbacks = useRef({ onLive, onFail })

  useEffect(() => { callbacks.current = { onLive, onFail } })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
    if (!gl || gl.isContextLost()) { callbacks.current.onFail(); return }

    const small = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader(small ? 4 : 5))
    const program = vertex && fragment ? gl.createProgram() : null
    if (!vertex || !fragment || !program) { callbacks.current.onFail(); return }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[WILDSIGNAL hero] shader link failed; using the static planet.', gl.getProgramInfoLog(program))
      callbacks.current.onFail()
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(program, 'uRes')
    const uTime = gl.getUniformLocation(program, 'uTime')
    const uRot = gl.getUniformLocation(program, 'uRot')
    gl.clearColor(0, 0, 0, 0)

    let raf = 0
    let running = false
    let cancelled = false
    let last = 0
    let elapsed = reduced ? 2.4 : 0
    let yaw = 0.9
    let spin = 0 // inertia from a drag, radians per frame
    let dragging = false
    let lastX = 0
    const pitch = 0.3
    const minFrame = small ? 1000 / 30 : 1000 / 50

    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, elapsed + 3)
      gl.uniform2f(uRot, yaw + elapsed * 0.032, pitch)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = now - last
      if (dt < minFrame) return
      last = now
      elapsed += Math.min(dt, 100) / 1000
      if (!dragging && spin !== 0) { yaw += spin; spin *= 0.94; if (Math.abs(spin) < 0.00005) spin = 0 }
      draw()
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75)
      const size = Math.max(2, Math.min(Math.round(canvas.clientWidth * dpr), 1500))
      if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; gl.viewport(0, 0, size, size) }
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    const liveFrame = requestAnimationFrame(() => { if (!cancelled) callbacks.current.onLive() })

    // Drag to turn the planet. The hero overlay owns touch input (touch-action: none) because the page is locked while it shows.
    const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; canvas.setPointerCapture(event.pointerId) }
    const move = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      lastX = event.clientX
      yaw += dx * 0.006
      spin = dx * 0.002
      if (!running) draw()
    }
    const up = () => { dragging = false }
    const lost = (event: Event) => { event.preventDefault(); controller.current?.stop(); callbacks.current.onFail() }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('webglcontextlost', lost)

    controller.current = {
      start: () => { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) },
      stop: () => { running = false; cancelAnimationFrame(raf) },
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(liveFrame)
      controller.current?.stop()
      controller.current = null
      observer.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('webglcontextlost', lost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [reduced])

  useEffect(() => {
    if (active) controller.current?.start()
    else controller.current?.stop()
  }, [active, reduced])

  return <canvas ref={canvasRef} className="ws-hero__canvas" />
}
