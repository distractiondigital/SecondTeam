import {
  BoxGeometry,
  Color,
  DataTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Scene,
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
  type Light,
  type Material,
  type PointLight,
  type Texture,
  type WebGLRenderer
} from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { DenoiseMaterial, PhysicalCamera, ProceduralEquirectTexture, ShapedAreaLight, WebGLPathTracer } from 'three-gpu-pathtracer'
import { DEFAULT_KIT, fieldOfView, opticsFor, type CameraKit } from '../../../shared/camera'
import { anamorphicRatio, filmGaugeFor, pointAsSpots, skyRadianceScale, spotDiscSetback, SUN_DISC_DISTANCE, sunDisc } from '../../../shared/pathLights'
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
/** The most any one bounced-light sample may add (see stCapBounce). */
const BOUNCE_CAP = '10.0'

const TERMINATOR_FUNCTION = /* glsl */ `
	// Bounced light, capped: with small bright lights close by (a lamp over a table), a few rare
	// bounce paths carry huge values and show as sparkles that take thousands of samples to settle.
	// Any one bounce sample is held to ${BOUNCE_CAP} (about 4× a white surface under a standard key), as
	// renderers' "clamp indirect" does. Light straight from the lights to what the camera sees is untouched.
	vec3 stCapBounce( vec3 c, bool direct ) {
		float m = max( c.r, max( c.g, c.b ) );
		return direct || m <= ${BOUNCE_CAP} ? c : c * ( ${BOUNCE_CAP} / m );
	}

	vec3 stSmoothPoint( SurfaceHit h, vec3 p ) {
		vec3 b = h.barycoord;
		vec3 q = p;
		for ( int i = 0; i < 3; i ++ ) {
			uint v = i == 0 ? h.faceIndices.x : i == 1 ? h.faceIndices.y : h.faceIndices.z;
			vec3 corner = texelFetch1D( bvh.position, v ).xyz;
			// (Turned to the side the ray hit, like the path tracer's own normals: hair cards are seen from both sides.)
			vec3 n = normalize( texelFetch1D( attributesArray, ATTR_NORMAL, v ).xyz ) * h.side;
			q -= b[ i ] * min( 0.0, dot( p - corner, n ) ) * n;
		}
		return q;
	}
`

// A ray continuing through a surface it doesn't stop at: from the hit point, a hair further along
// itself (a few float steps at the size of the coordinates, enough not to find the same surface again).
const PASS_THROUGH_FUNCTION = /* glsl */ `
	vec3 stPassThrough( vec3 rayOrigin, vec3 rayDirection, float dist ) {
		vec3 point = rayOrigin + rayDirection * dist;
		vec3 absPoint = abs( point );
		float maxPoint = max( absPoint.x, max( absPoint.y, absPoint.z ) );
		return point + rayDirection * ( maxPoint + 1.0 ) * 1e-6;
	}
`

/**
 * Marks a practical's glowing parts for the shader (see patchTerminator): carried in a material
 * setting none of ours use (the top of an iridescence thickness range), set only while the path
 * tracer reads the scene.
 */
const GLOW_ONLY = -7
/** Marks a Diffusion object's stand-in material the same way. */
const DIFFUSION = -8

/** Patch the path tracer's shader: the shadow terminator (see above) and finer ray restarts. Throws if the library's code changed. */
function patchTerminator(source: string): string {
	const swap = (s: string, from: string, to: string) => {
		if (!s.includes(from)) throw new Error(`pathTrace: can't find "${from.slice(0, 60)}"`)
		return s.split(from).join(to)
	}
	let s = source
	// How far rays start off a surface they bounce from (× the size of the coordinates): the
	// library's 1e-4 is ~0.2 mm on a set, coarser than the gaps between a figure's layers.
	s = swap(s, '#define RAY_OFFSET 1e-4', '#define RAY_OFFSET 1e-5')
	// Rays passing through a see-through part of a surface (the clear parts of hair and eyebrow
	// cards, anything not casting shadows) restart just past it along the ray, not pushed through
	// along the surface's normal. Pushed along the normal, they landed under any skin closer than
	// the push: hair cards lie against the scalp and dip into it, so rays restarted inside the head
	// and found darkness (dark outlines and dots along the hairline). Along the ray they can only
	// skip what lies within a few millionths of the card, whatever the hair's shape.
	s = swap(s, 'vec3 stepRayOrigin(', `${PASS_THROUGH_FUNCTION}\n\tvec3 stepRayOrigin(`)
	s = swap(
		s,
		'ray.origin = stepRayOrigin( ray.origin, ray.direction, - surfaceHit.faceNormal, surfaceHit.dist );',
		'ray.origin = stPassThrough( ray.origin, ray.direction, surfaceHit.dist );'
	)
	s = swap(s, 'rayOrigin = stepRayOrigin( rayOrigin, rayDirection, - faceNormal, dist );', 'rayOrigin = stPassThrough( rayOrigin, rayDirection, dist );')
	// The triangle test's small tolerance (so rays don't slip between neighbouring triangles) applies
	// to the edges only, not to the distance: it also accepted surfaces up to 0.01 mm *behind* a
	// ray's start, so a ray restarted just past a card found that same card again.
	s = swap(s, 'uvt += vec4( TRI_INTERSECT_EPSILON );', 'uvt.xyw += vec3( TRI_INTERSECT_EPSILON );')
	// A practical's glowing parts (a lamp shade, a bulb, a lens: GLOW_ONLY below) are seen, but don't
	// light the set themselves: the practical's own lights already carry that light, so it would
	// count twice. Their emission only counts for rays from the camera.
	s = swap(
		s,
		'gl_FragColor.rgb += ( surf.emission * state.throughputColor );',
		`if ( material.iridescenceThicknessMaximum != ${GLOW_ONLY.toFixed(1)} || state.firstRay ) gl_FragColor.rgb += ( surf.emission * state.throughputColor );`
	)
	// …and light bouncing around the set passes through them: they stand for the practical, whose
	// lights already give its light. (Otherwise the inside of a shade, a few centimetres from the
	// bulb, is so bright that every stray bounce landing there becomes a sparkle.)
	s = swap(
		s,
		"// if we've determined that this is a shadow ray and we've hit an item with no shadow casting",
		`if ( material.iridescenceThicknessMaximum == ${GLOW_ONLY.toFixed(1)} && ! state.firstRay ) {
							i -= sign( state.transmissiveTraversals );
							state.transmissiveTraversals -= sign( state.transmissiveTraversals );
							ray.origin = stPassThrough( ray.origin, ray.direction, surfaceHit.dist );
							continue;
						}
						// if we've determined that this is a shadow ray and we've hit an item with no shadow casting`
	)
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
						gl_FragColor.rgb += stCapBounce( directLightContribution( - ray.direction, surf, state, shadowOrigin ), state.firstRay );`
	)
	// A Diffusion sheet (DIFFUSION below) also shows the light that reaches its back: direct light
	// from behind it, through it, the share it lets through, as if its back were a matte surface (like
	// Clay's glow from behind). The path tracer on its own only finds that light by rare random rays.
	s = swap(
		s,
		'gl_FragColor.rgb += stCapBounce( directLightContribution( - ray.direction, surf, state, shadowOrigin ), state.firstRay );',
		`gl_FragColor.rgb += stCapBounce( directLightContribution( - ray.direction, surf, state, shadowOrigin ), state.firstRay );
						if ( material.iridescenceThicknessMaximum == ${DIFFUSION.toFixed(1)} && ! surf.volumeParticle ) {
							SurfaceRecord stBack = surf;
							stBack.normal = - surf.normal;
							stBack.faceNormal = - surf.faceNormal;
							stBack.clearcoatNormal = - surf.clearcoatNormal;
							stBack.normalBasis = getBasisFromNormal( stBack.normal );
							stBack.normalInvBasis = inverse( stBack.normalBasis );
							stBack.clearcoatBasis = getBasisFromNormal( stBack.clearcoatNormal );
							stBack.clearcoatInvBasis = inverse( stBack.clearcoatBasis );
							stBack.color = surf.color * surf.transmission;
							stBack.transmission = 0.0;
							stBack.metalness = 0.0;
							vec3 stBackOrigin = stPassThrough( ray.origin, ray.direction, surfaceHit.dist );
							gl_FragColor.rgb += stCapBounce( directLightContribution( reflect( - ray.direction, surf.normal ), stBack, state, stBackOrigin ), state.firstRay );
						}`
	)
	// Bounced light hitting a light (bounces only: the camera never gets here).
	s = swap(s, 'gl_FragColor.rgb += lightRec.emission * state.throughputColor * misWeight;', 'gl_FragColor.rgb += stCapBounce( lightRec.emission * state.throughputColor * misWeight, false );')
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

/** Shows in pictures: it and everything it sits in are visible. */
function shows(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
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
    // Rays pass through the see-through parts of hair cards, which stack up dozens deep at a hairline;
    // each crossing counts, and a ray that runs out ends black. Plenty of crossings.
    t.transmissiveBounces = 64
    t.filterGlossyFactor = 0.5 // fewer fireflies, at the cost of sharp caustics
    // Whole frames at a time (a sample of a full frame is a millisecond or two on a modern card);
    // step() still spreads the work over frames.
    t.tiles.set(1, 1)
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
        // The path tracer puts a spot's glowing disc where its cone is that wide, radius / tan(half
        // cone) in front of the light; ours is the source itself, at the light. So a stand-in whose
        // cone starts that far behind ours, putting the disc exactly where our light is.
        const spot = light as SpotLight
        const at = new Vector3().setFromMatrixPosition(spot.matrixWorld)
        const ahead = new Vector3().setFromMatrixPosition(spot.target.matrixWorld).sub(at).normalize()
        const s = new SpotLight(spot.color, spot.intensity, spot.distance, spot.angle, spot.penumbra, spot.decay) as SpotLight & { radius?: number }
        s.radius = size
        s.position.copy(at).addScaledVector(ahead, -spotDiscSetback(size, spot.angle))
        s.target.position.copy(at).add(ahead)
        added.push(s, s.target)
        hidden.push(spot)
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

    // Practicals' glowing parts: seen, not lighting (GLOW_ONLY). Diffusion objects: light passes
    // through them, dimmed by their density and tinted (a rough, thin see-through stand-in material,
    // like Clay's partial shadow and glow from behind).
    scene.traverseVisible((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material)) return
      const m = mesh.material as Material & { iridescenceThicknessRange?: [number, number]; color?: Color }
      if (m.userData?.glowOnly) {
        // Also see-through to light: a shade or bulb never blocks its own lights inside it.
        // And it shows only its glow: lit by its own light from a few centimetres inside it, its surface
        // would take thousands of samples to settle (Clay's matching look is its glow too).
        const g = m as typeof m & { castShadow?: boolean }
        const before = m.iridescenceThicknessRange
        const color = m.color?.clone()
        m.iridescenceThicknessRange = [100, GLOW_ONLY]
        g.castShadow = false
        m.color?.setRGB(0, 0, 0)
        restore.push(() => {
          if (before) m.iridescenceThicknessRange = before
          else delete m.iridescenceThicknessRange
          delete g.castShadow
          if (color) m.color?.copy(color)
        })
      }
      if (typeof mesh.userData.diffusion === 'number') {
        // (A thin sheet (thickness 0), rough, with glass's bend: light through it scatters every way, like fabric.)
        const stand = new MeshPhysicalMaterial({ color: m.color ?? new Color(1, 1, 1), roughness: 1, metalness: 0, transmission: 1 - mesh.userData.diffusion, ior: 1.5, thickness: 0, side: DoubleSide })
        stand.iridescenceThicknessRange = [100, DIFFUSION]
        mesh.material = stand
        restore.push(() => {
          mesh.material = m
          stand.dispose()
        })
      }
    })
    // Cut-out cards (hair, eyebrows): their masks are fine strands made for blending. A hard cut-off
    // at full sharpness drops most strands at the hairline and leaves dark fragments; partial
    // coverage instead (each sample passes in proportion to the mask) gives soft, natural edges.
    scene.traverseVisible((o) => {
      const mesh = o as Object3D & { isMesh?: boolean; material?: Material | Material[] }
      if (!mesh.isMesh || !mesh.material) return
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const std = m as Material & { alphaMap?: Texture | null }
        if (!std.alphaMap || std.alphaTest <= 0) continue
        const { alphaTest, transparent } = std
        std.alphaTest = 0
        std.transparent = true
        restore.push(() => {
          std.alphaTest = alphaTest
          std.transparent = transparent
        })
      }
    })
    // Lights that don't show (a hidden light, or one inside a hidden group) stay out: the path
    // tracer only checks a light's own visibility, not its parents', so a hidden sun would still
    // shine in the Render.
    scene.traverse((o) => {
      if ((o as Light).isLight && o.visible && !shows(o)) hidden.push(o as Light)
    })
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

  /** Samples traced per frame: grows while the graphics card keeps up, shrinks when it doesn't. */
  private perFrame = 1
  /** Markers after the batches still queued: the card has finished a batch once its marker is passed. */
  private fences: WebGLSync[] = []

  /**
   * Trace some more, once per frame, never queuing more work on the graphics card than it can
   * finish in about a frame (so the app stays smooth while it traces). The card works behind the
   * app: timing the app's frames can't tell how far behind it is, and a deep queue freezes
   * everything (seconds, measured), so ask the card itself through a fence. (Two batches in flight
   * was ~10% faster but brought hitches back.)
   */
  step(): void {
    const ctx = this.gl.getContext() as WebGL2RenderingContext
    // Forget the batches the card has finished.
    while (this.fences.length && ctx.clientWaitSync(this.fences[0], 0, 0) !== ctx.TIMEOUT_EXPIRED) {
      ctx.deleteSync(this.fences.shift()!)
    }
    if (this.fences.length >= 1) {
      // Still busy with the last batch: send nothing this frame, and less next time.
      this.perFrame = Math.max(1, Math.floor(this.perFrame * 0.75))
      return
    }
    this.perFrame = Math.min(64, this.perFrame + 1)
    if (this.done) return
    for (let i = 0; i < this.perFrame && !this.done; i++) {
      this.tracer.renderSample()
      if (this.compiling) break
    }
    this.fences.push(ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0)!)
    ctx.flush()
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
    for (const f of this.fences) (this.gl.getContext() as WebGL2RenderingContext).deleteSync(f)
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

// ---------- Getting ready in the background ----------
//
// The path tracer's shader is very large: compiling it takes seconds (much longer on Direct3D than
// OpenGL) and briefly stalls the app. So it's compiled once, a little after the app opens, on a
// tiny stand-in scene with the same settings every real Render uses (perspective lens with blur,
// light sampling, a sky picture, no fog volumes), and that copy is kept: every Render after it
// starts at once. (Later path tracers reuse the compiled program.)

let warm: PathTrace | null = null
let warming: Promise<void> | null = null

/** Compile the path tracer now, quietly (once per session). */
export function warmUpPathTracer(gl: WebGLRenderer): Promise<void> {
  warming ??= (async () => {
    const scene = new Scene()
    const sky = new DataTexture(new Uint8Array([200, 210, 230, 255, 200, 210, 230, 255, 120, 120, 120, 255, 120, 120, 120, 255]), 2, 2)
    sky.mapping = EquirectangularReflectionMapping
    sky.needsUpdate = true
    scene.background = sky
    scene.add(new HemisphereLight('#dce9f5', '#9a9a96', 0.5))
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#888888' }))
    box.position.set(0, 0.5, -3)
    scene.add(box)
    const lamp = new SpotLight('#ffffff', 10, 0, Math.PI / 6, 0.3, 2)
    lamp.userData.sourceSize = 0.2
    lamp.position.set(0, 3, 0)
    lamp.target.position.set(0, 0, -3)
    scene.add(lamp, lamp.target)
    const node = { id: '', focalLength: 35, aperture: 2.8 } as CameraNode
    const pose = { position: new Vector3(0, 1.5, 0), quaternion: new Quaternion() }
    warm = new PathTrace(gl)
    warm.prepare(scene, node, DEFAULT_KIT, 3, 16, 16, 'draft', pose)
    warm.target = 1
    await warm.run()
  })()
  return warming
}

/** The path tracer has been compiled this session (a Render starts at once). */
export function pathTracerWarm(): boolean {
  return Boolean(warm?.done)
}

/** A canvas as a PNG data URL, encoded in the background (toDataURL would stall the app for a large picture). */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Couldn't encode the picture"))
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    }, 'image/png')
  })
}

