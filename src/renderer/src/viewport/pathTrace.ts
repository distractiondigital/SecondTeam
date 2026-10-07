import {
  Color,
  HalfFloatType,
  LinearFilter,
  Object3D,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type DirectionalLight,
  type HemisphereLight,
  type Light,
  type PointLight,
  type Scene,
  type Texture,
  type WebGLRenderer
} from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { DenoiseMaterial, PhysicalCamera, ProceduralEquirectTexture, ShapedAreaLight, WebGLPathTracer } from 'three-gpu-pathtracer'
import { fieldOfView, opticsFor, type CameraKit } from '../../../shared/camera'
import { anamorphicRatio, filmGaugeFor, pointAsSpots, skyRadianceScale, SUN_DISC_DISTANCE, sunDisc } from '../../../shared/pathLights'
import type { CameraNode } from '../../../shared/project'
import { TONE_MAP_FUNCTIONS } from './clayPost'
import { isHelper, targetToCanvas, withHidden } from './renderShot'
import { cameraPose } from './shotInfo'

// The Render: a path-traced picture of a shot (three-gpu-pathtracer). Light really bounces, every
// shadow comes from the light's real size, and the lens blur comes from rays through an aperture of
// the lens's real size (focal length / stop). It's built from a shot's hidden lit copy of the set
// (ShotScenes), refined a few samples at a time, then finished like Clay (the same film curve) with
// a light denoise.
//
// Our lights are converted (shared/pathLights.ts): spots get their size as a radius; a sun becomes a
// distant round area light as wide as it looks; a sized point light becomes two back-to-back spots.
// The sky's fill (the hemisphere light) becomes an environment: its sky colour above the horizon,
// its ground colour below. Atmosphere (fog) isn't rendered yet.

/** Render quality: samples per pixel and how much the result is smoothed. */
export const QUALITY = {
  draft: { samples: 64, sigma: 2.5, threshold: 0.05 },
  final: { samples: 512, sigma: 1.5, threshold: 0.03 }
} as const
export type RenderQuality = keyof typeof QUALITY

/** Where the shot camera is (the move in progress, if any). */
export interface CameraPose {
  position: Vector3
  quaternion: Quaternion
}

const TONE = /* glsl */ `
  #include <tonemapping_pars_fragment>
  uniform sampler2D map;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    gl_FragColor = vec4(ST_TONE_MAP(max(c.rgb, 0.0)), 1.0);
  }
`
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// The shadow terminator. Our figures are fairly low-poly meshes shaded with smooth normals: where light
// grazes a curved surface (a cheek turning away from a lamp) the smooth surface still faces the light
// but its flat triangle doesn't, and the path tracer (a) gives no light there and (b) starts the
// shadow ray on the flat triangle, which runs straight back into the mesh. Whole triangles went dark
// in jagged patches. Fixed as in "Hacking the shadow terminator" (Hanika, 2021): light counts by the
// smooth normal, and shadow rays start from where the smooth surface would be (the hit point pushed
// out of each corner's tangent plane, blended by position on the triangle).
const TERMINATOR_FUNCTION = /* glsl */ `
	vec3 stSmoothPoint( SurfaceHit h, vec3 p ) {
		vec3 b = h.barycoord;
		vec3 q = p;
		for ( int i = 0; i < 3; i ++ ) {
			uint v = i == 0 ? h.faceIndices.x : i == 1 ? h.faceIndices.y : h.faceIndices.z;
			vec3 corner = texelFetch1D( bvh.position, v ).xyz;
			vec3 n = normalize( texelFetch1D( attributesArray, ATTR_NORMAL, v ).xyz );
			q -= b[ i ] * min( 0.0, dot( p - corner, n ) ) * n;
		}
		return q;
	}
`

/** Patch the path tracer's shader for the shadow terminator (see above). Throws if the library's code changed. */
function patchTerminator(source: string): string {
	const swap = (s: string, from: string, to: string) => {
		if (!s.includes(from)) throw new Error(`pathTrace: can't find "${from.slice(0, 60)}"`)
		return s.split(from).join(to)
	}
	let s = source
	// Light counts when it's above the smooth surface (not the flat triangle).
	s = swap(s, 'dot( surf.faceNormal, lightRec.direction ) < 0.0', 'dot( surf.normal, lightRec.direction ) < 0.0')
	s = swap(s, 'dot( surf.faceNormal, envDirection ) < 0.0', 'dot( surf.normal, envDirection ) < 0.0')
	s = swap(s, 'isDirectionValid( lightRec.direction, surf.normal, surf.faceNormal )', '( surf.volumeParticle || dot( lightRec.direction, surf.normal ) > 0.0 )')
	s = swap(s, 'isDirectionValid( envDirection, surf.normal, surf.faceNormal )', '( surf.volumeParticle || dot( envDirection, surf.normal ) > 0.0 )')
	// Shadow rays from the smooth surface.
	s = swap(s, 'vec3 directLightContribution(', `${TERMINATOR_FUNCTION}\n\tvec3 directLightContribution(`)
	s = swap(
		s,
		'gl_FragColor.rgb += directLightContribution( - ray.direction, surf, state, hitPoint );',
		`vec3 shadowOrigin = hitPoint;
						if ( ! surf.volumeParticle && ! isBelowSurface ) {
							vec3 smoothPoint = stSmoothPoint( surfaceHit, ray.origin + ray.direction * surfaceHit.dist );
							shadowOrigin = stepRayOrigin( smoothPoint, ray.direction, surf.faceNormal, 0.0 );
						}
						gl_FragColor.rgb += directLightContribution( - ray.direction, surf, state, shadowOrigin );`
	)
	return s
}

/** One radiance per direction: the fill's sky colour above the horizon, its ground colour below. */
function skyEnvironment(sky: Color, ground: Color): ProceduralEquirectTexture {
  const texture = new ProceduralEquirectTexture(64, 32)
  const up = new Vector3()
  texture.generationCallback = (polar, _uv, _coord, color) => {
    up.setFromSpherical(polar)
    color.copy(up.y >= 0 ? sky : ground)
  }
  texture.update()
  return texture
}

function inHelper(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (isHelper(p)) return true
  return false
}

export class PathTrace {
  readonly camera = new PhysicalCamera(40, 1, 0.02, 1000)
  readonly tracer: WebGLPathTracer
  private toneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })
  private toneMaterial = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: TONE, uniforms: { map: { value: null } }, toneMapped: false, defines: { ST_TONE_MAP: 'ACESFilmicToneMapping' } })
  private denoise = new DenoiseMaterial()
  private quad = new FullScreenQuad()
  private environment: Texture | null = null
  private size = { width: 1, height: 1 }
  /** Samples wanted. */
  target: number = QUALITY.draft.samples
  quality: RenderQuality = 'draft'

  constructor(private gl: WebGLRenderer) {
    const t = new WebGLPathTracer(gl)
    t.renderToCanvas = false
    t.rasterizeScene = false
    t.synchronizeRenderSize = false
    t.renderDelay = 0
    t.minSamples = 0
    t.fadeDuration = 0
    t.multipleImportanceSampling = true // needed for spot, sun and point lights
    t.bounces = 6
    t.filterGlossyFactor = 0.5 // fewer fireflies, at the cost of sharp caustics
    t.tiles.set(2, 2)
    const material = (t as unknown as { _pathTracer: { material: ShaderMaterial } })._pathTracer.material
    material.fragmentShader = patchTerminator(material.fragmentShader)
    material.needsUpdate = true
    this.tracer = t
    this.denoise.toneMapped = false
  }

  get samples(): number {
    return this.tracer.samples
  }

  get done(): boolean {
    return this.tracer.samples >= this.target
  }

  /** Path tracing begins once the shader has compiled (the first time takes a few seconds). */
  get compiling(): boolean {
    return Boolean((this.tracer as unknown as { isCompiling?: boolean }).isCompiling)
  }

  /**
   * Build the path tracer's copy of `scene` (a shot's hidden lit set) for `node` at width × height,
   * from `pose` if given (else the shot camera in the scene).
   */
  prepare(scene: Scene, node: CameraNode, kit: CameraKit, focus: number, width: number, height: number, quality: RenderQuality, pose?: CameraPose): void {
    this.quality = quality
    this.target = QUALITY[quality].samples
    this.setSize(width, height)
    this.placeCamera(scene, node, kit, focus, width / height, pose)

    // Lights: convert ours, keep the originals hidden while the path tracer reads the scene.
    scene.updateMatrixWorld(true)
    const added: Object3D[] = []
    const hidden: Light[] = []
    const restore: (() => void)[] = []
    let hemi: HemisphereLight | null = null
    const ambient = new Color(0, 0, 0)
    scene.traverseVisible((o) => {
      const light = o as Light
      if (!light.isLight || inHelper(o)) return
      const size = Number(o.userData.sourceSize) || 0
      if ((light as HemisphereLight).isHemisphereLight) {
        hemi = light as HemisphereLight
      } else if ((light as { isAmbientLight?: boolean }).isAmbientLight) {
        ambient.add(light.color.clone().multiplyScalar(light.intensity))
      } else if ((light as DirectionalLight).isDirectionalLight && size > 0) {
        const sun = light as DirectionalLight
        const from = new Vector3().setFromMatrixPosition(sun.matrixWorld)
        const to = new Vector3().setFromMatrixPosition(sun.target.matrixWorld)
        const dir = to.sub(from).normalize() // the way the light travels
        const { radius, radiance } = sunDisc(size, sun.intensity)
        const disc = new ShapedAreaLight(sun.color, radiance, 2 * radius, 2 * radius)
        disc.isCircular = true
        disc.position.copy(this.camera.position).addScaledVector(dir, -SUN_DISC_DISTANCE)
        // (Turned to face the set: three's lookAt points a light's -Z at the target, the side the path tracer lights from.)
        disc.lookAt(this.camera.position)
        added.push(disc)
        hidden.push(sun)
      } else if ((light as SpotLight).isSpotLight) {
        const spot = light as SpotLight & { radius?: number }
        const before = spot.radius
        spot.radius = size
        restore.push(() => (spot.radius = before))
      } else if ((light as PointLight).isPointLight) {
        const point = light as PointLight
        const halves = pointAsSpots(size)
        if (!halves) return
        const at = new Vector3().setFromMatrixPosition(point.matrixWorld)
        halves.forEach((h, i) => {
          const s = new SpotLight(point.color, point.intensity, point.distance, h.angle, h.penumbra, point.decay) as SpotLight & { radius?: number }
          s.radius = h.radius
          s.position.copy(at)
          s.target.position.copy(at).add(new Vector3(0, i === 0 ? -1 : 1, 0))
          added.push(s, s.target)
        })
        hidden.push(point)
      }
    })
    // The sky: the hemisphere fill as an environment (plus any ambient light, which is even all round).
    const h = hemi as HemisphereLight | null
    const scale = skyRadianceScale(h?.intensity ?? 0)
    const amb = ambient.multiplyScalar(1 / Math.PI)
    const skyColor = (h ? h.color.clone().multiplyScalar(scale) : new Color(0, 0, 0)).add(amb)
    const groundColor = (h ? h.groundColor.clone().multiplyScalar(scale) : new Color(0, 0, 0)).add(amb)
    this.environment?.dispose()
    this.environment = skyEnvironment(skyColor, groundColor)

    for (const o of added) scene.add(o)
    for (const l of hidden) l.visible = false
    const environment = scene.environment
    const intensity = scene.environmentIntensity
    scene.environment = this.environment
    scene.environmentIntensity = 1
    try {
      scene.updateMatrixWorld(true)
      withHidden(scene, isHelper, () => this.tracer.setScene(scene, this.camera))
    } finally {
      for (const o of added) scene.remove(o)
      for (const l of hidden) l.visible = true
      for (const r of restore) r()
      scene.environment = environment
      scene.environmentIntensity = intensity
    }
  }

  /** Move the camera (starts the picture again). */
  moveCamera(scene: Scene, node: CameraNode, kit: CameraKit, focus: number, pose?: CameraPose): void {
    this.placeCamera(scene, node, kit, focus, this.size.width / this.size.height, pose)
    this.tracer.updateCamera()
  }

  /** Start the picture again (same scene). */
  restart(): void {
    this.tracer.reset()
  }

  /** Tiles traced per frame; adapted to keep the app responsive (the GPU works behind the CPU, so time it by frames). */
  private perFrame = 4
  private lastFrame = 0

  /**
   * Trace some more, once per frame. `frameMs`: the frame time to stay under (the GPU's queue shows
   * up as longer gaps between frames): more tiles while frames come quickly, fewer when they don't.
   */
  step(frameMs = 33): void {
    const now = performance.now()
    if (this.lastFrame) {
      const gap = now - this.lastFrame
      if (gap > frameMs * 1.25) this.perFrame = Math.max(1, Math.floor(this.perFrame * 0.7))
      else if (gap < frameMs) this.perFrame = Math.min(256, this.perFrame + 1)
    }
    this.lastFrame = now
    for (let i = 0; i < this.perFrame && !this.done; i++) {
      this.tracer.renderSample()
      if (this.compiling) break
    }
  }

  /** Trace until done, without regard for frames (exports; the app waits). Calls `progress` now and then. */
  async run(progress?: (samples: number) => void, cancelled?: () => boolean): Promise<boolean> {
    while (!this.done) {
      if (cancelled?.()) return false
      for (let i = 0; i < 16 && !this.done; i++) {
        this.tracer.renderSample()
        if (this.compiling) break
      }
      progress?.(this.samples)
      // Let the window breathe between batches.
      await new Promise((r) => setTimeout(r, 0))
    }
    return true
  }

  /**
   * Draw the picture so far into `output` (null = the screen, in the current viewport): the film
   * curve, a light denoise, then colour.
   */
  present(output: WebGLRenderTarget | null): void {
    const gl = this.gl
    const curve = TONE_MAP_FUNCTIONS[gl.toneMapping] ?? 'LinearToneMapping'
    if (this.toneMaterial.defines.ST_TONE_MAP !== curve) {
      this.toneMaterial.defines.ST_TONE_MAP = curve
      this.toneMaterial.needsUpdate = true
    }
    const previous = gl.getRenderTarget()
    const scissor = gl.getScissorTest()
    const autoClear = gl.autoClear
    try {
      gl.autoClear = false
      // The film curve, into an image the denoise can compare colours in.
      gl.setScissorTest(false)
      this.toneMaterial.uniforms.map.value = this.tracer.target.texture
      this.quad.material = this.toneMaterial
      gl.setRenderTarget(this.toneTarget)
      this.quad.render(gl)
      // Denoise, and out (colour space by where it goes).
      const q = QUALITY[this.quality]
      this.denoise.uniforms.map.value = this.toneTarget.texture
      this.denoise.uniforms.sigma.value = q.sigma
      this.denoise.uniforms.threshold.value = q.threshold
      this.quad.material = this.denoise
      gl.setRenderTarget(output)
      gl.setScissorTest(scissor)
      this.quad.render(gl)
    } finally {
      gl.autoClear = autoClear
      gl.setRenderTarget(previous)
      gl.setScissorTest(scissor)
    }
  }

  /** The finished picture as a canvas. */
  toCanvas(): HTMLCanvasElement {
    const { width, height } = this.size
    const out = new WebGLRenderTarget(width, height)
    out.texture.colorSpace = SRGBColorSpace
    try {
      this.present(out)
      return targetToCanvas(this.gl, out, width, height)
    } finally {
      out.dispose()
    }
  }

  dispose(): void {
    this.tracer.dispose()
    this.toneTarget.dispose()
    this.toneMaterial.dispose()
    this.denoise.dispose()
    this.quad.dispose()
    this.environment?.dispose()
  }

  private setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    this.size = { width: w, height: h }
    // (The path tracer's own size; it would otherwise follow the canvas.)
    const inner = this.tracer as unknown as { _pathTracer: { setSize(w: number, h: number): void }; _lowResPathTracer: { setSize(w: number, h: number): void } }
    inner._pathTracer.setSize(w, h)
    inner._lowResPathTracer.setSize(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)))
    if (this.toneTarget.width !== w || this.toneTarget.height !== h) this.toneTarget.setSize(w, h)
  }

  private placeCamera(scene: Scene, node: CameraNode, kit: CameraKit, focus: number, aspect: number, pose?: CameraPose): void {
    const cam = this.camera
    const optics = opticsFor(kit, node.focalLength)
    const object = scene.getObjectByName(node.id)
    if (pose) {
      cam.position.copy(pose.position)
      cam.quaternion.copy(pose.quaternion)
    } else if (object) {
      const p = cameraPose(object)
      cam.position.copy(p.position)
      cam.quaternion.copy(p.quaternion)
    }
    cam.fov = fieldOfView(optics).vertical
    cam.aspect = aspect
    cam.filmGauge = filmGaugeFor(node.focalLength, cam.fov, aspect)
    cam.fStop = node.aperture
    cam.focusDistance = Number.isFinite(focus) ? Math.max(0.05, focus) : 1e4
    cam.anamorphicRatio = anamorphicRatio(kit.squeeze)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }
}
