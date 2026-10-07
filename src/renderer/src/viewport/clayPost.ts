import {
  AlwaysDepth,
  DepthTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RGBAFormat,
  RGFormat,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer
} from 'three'

// The Clay look's finishing passes, on a picture of the set rendered into `target` (colour + depth):
//  - ambient occlusion: corners, creases and contact points darken where the sky and bounce light
//    can't reach (Alchemy AO, McGuire et al. 2011, from the depth alone), at half resolution with
//    an edge-aware blur. It isn't multiplied over the finished picture (that would also darken the
//    direct key light, smearing dark blotches round fingers and faces in close-ups): the materials
//    themselves apply it to their sky and bounce light only (see "Occlusion in the materials"
//    below), so the set is drawn with the occlusion of the previous frame live, or twice for a
//    still;
//  - depth of field (below), when a lens and focus are given;
//  - output: tone mapping and colour space, and the scene's depth (so helpers drawn afterwards are
//    still hidden behind the set).
//
// Depth of field as a real lens makes it (src/shared/depthOfField.ts has the maths): every pixel's
// blur circle comes from its distance, the focal length, the stop and the focus distance, scaled to
// pixels through the sensor. Render the set into `target` (colour + depth), then `render()`:
//  1. tiles: the largest blur in each 16 × 16 pixel tile;
//  2. spread: each tile takes the largest blur of the tiles around it that could reach it, so a
//     blurred foreground knows to spill over its neighbours;
//  3. gather (full resolution): each pixel averages samples spread evenly over the blur its area
//     needs (a disc, or an upright oval for anamorphic), turned by a per-pixel random angle so the
//     pattern can't band. A sample counts if its own blur circle reaches this pixel, so blurred
//     foregrounds spread over what's behind them while sharp things in front never get smeared by
//     the background;
//  4. blend (full resolution): sharp where the blur is under a pixel, the gathered blur elsewhere
//     (upscaled using only neighbours at a similar distance). It also writes the scene's depth, so
//     helpers drawn afterwards still hide behind the set.

export interface DofParams {
  focalLength: number
  stop: number
  /** Metres along the lens axis; Infinity allowed. */
  focus: number
  squeeze: number
  /** Output pixels per millimetre of sensor (vertical). */
  pxPerMm: number
}

const TILE = 16 // output pixels per tile side
const SAMPLES = 96
/** The largest blur drawn, as a fraction of the picture height (a real lens can exceed it). */
const MAX_RADIUS_FRACTION = 1 / 10
const MAX_SPREAD = 8 // tiles either way the spread pass looks (covers the largest blur)

const COC = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focal;     // mm
  uniform float stopN;
  uniform float focusMm;   // < 0: infinity
  uniform float pxPerMm;
  uniform float maxRadius; // output pixels
  uniform vec2 fullSize;   // output size in pixels
  float distanceMm(float depth) {
    float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * depth - cameraFar);
    return max(-viewZ * 1000.0, focal * 1.001);
  }
  // Blur circle radius in output pixels (vertical; horizontal is this / squeeze).
  float cocRadius(float depth) {
    float d = distanceMm(depth);
    float c;
    if (focusMm < 0.0) {
      c = focal * focal / (stopN * d);
    } else {
      float s = max(focusMm, focal * 1.001);
      c = focal * focal / (stopN * (s - focal)) * abs(d - s) / d;
    }
    return min(0.5 * c * pxPerMm, maxRadius);
  }
`

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const TILES = /* glsl */ `
  ${COC}
  varying vec2 vUv;
  void main() {
    // This tile's corner in output pixels; every other pixel of it (plenty to find the largest blur).
    vec2 origin = floor(gl_FragCoord.xy) * ${TILE.toFixed(1)};
    float m = 0.0;
    for (int y = 0; y < ${TILE / 2}; y++) {
      for (int x = 0; x < ${TILE / 2}; x++) {
        vec2 uv = (origin + vec2(float(x), float(y)) * 2.0 + 1.0) / fullSize;
        m = max(m, cocRadius(texture2D(tDepth, uv).x));
      }
    }
    gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
  }
`

const SPREAD = /* glsl */ `
  uniform sampler2D tTiles;
  uniform vec2 tileCount;
  uniform float tilePx;
  varying vec2 vUv;
  void main() {
    vec2 here = floor(gl_FragCoord.xy);
    float m = 0.0;
    for (int y = -${MAX_SPREAD}; y <= ${MAX_SPREAD}; y++) {
      for (int x = -${MAX_SPREAD}; x <= ${MAX_SPREAD}; x++) {
        vec2 t = here + vec2(float(x), float(y));
        if (t.x < 0.0 || t.y < 0.0 || t.x >= tileCount.x || t.y >= tileCount.y) continue;
        float r = texture2D(tTiles, (t + 0.5) / tileCount).x;
        // Can a blur this size, from that tile, reach this one?
        float gap = max(0.0, (max(abs(float(x)), abs(float(y))) - 1.0) * tilePx);
        if (r >= gap) m = max(m, r);
      }
    }
    gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
  }
`

const GATHER = /* glsl */ `
  ${COC}
  uniform sampler2D tColor;
  uniform sampler2D tSpread;
  uniform vec2 tileCount;
  uniform float squeeze;
  varying vec2 vUv;
  const float GOLDEN = 2.39996323;
  const float N = ${SAMPLES.toFixed(1)};
  // Interleaved gradient noise: a cheap, even per-pixel random number.
  float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float cDepth = texture2D(tDepth, vUv).x;
    float cRadius = cocRadius(cDepth);
    float cDist = distanceMm(cDepth);
    vec3 centre = texture2D(tColor, vUv).rgb;
    // The blur this area needs (its own or a neighbour's that spills here).
    float area = texture2D(tSpread, vUv).x;
    if (area < 0.5) {
      gl_FragColor = vec4(centre, cRadius);
      return;
    }
    vec2 texel = 1.0 / fullSize;
    float spin = noise(gl_FragCoord.xy) * 6.2831853;
    float ring = area / sqrt(N) + 0.5; // spacing between samples
    vec3 sum = centre;
    float count = 1.0;
    float cover = cRadius;
    for (int i = 0; i < ${SAMPLES}; i++) {
      float r = area * sqrt((float(i) + 0.5) / N);
      float a = float(i) * GOLDEN + spin;
      vec2 uv = vUv + vec2(cos(a) / squeeze, sin(a)) * r * texel;
      float sDepth = texture2D(tDepth, uv).x;
      float sRadius = cocRadius(sDepth);
      // Something behind this pixel can't blur over it by more than this pixel's own blur.
      if (distanceMm(sDepth) > cDist) sRadius = min(sRadius, cRadius * 2.0);
      float m = smoothstep(r - ring, r + ring, sRadius);
      sum += mix(sum / count, texture2D(tColor, uv).rgb, m);
      count += 1.0;
      cover = max(cover, sRadius * m);
    }
    gl_FragColor = vec4(sum / count, cover);
  }
`

const BLEND = /* glsl */ `
  ${COC}
  uniform sampler2D tColor;
  uniform sampler2D tBlur;
  uniform vec2 halfSize;   // size of the half-resolution blur
  varying vec2 vUv;
  // The half-resolution blur, upscaled using only neighbours at a similar distance, so a sharp
  // edge (say, a face in focus against a soft background) doesn't pick up the other side's colour.
  vec4 blurAt(float dist) {
    vec2 p = vUv * halfSize - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 uv = (base + o + 0.5) / halfSize;
        vec2 b = mix(1.0 - f, f, o);
        float near = abs(distanceMm(texture2D(tDepth, uv).x) - dist) / dist;
        float w = b.x * b.y * (1.0 / (0.02 + near));
        sum += texture2D(tBlur, uv) * w;
        total += w;
      }
    }
    return total > 0.0 ? sum / total : texture2D(tBlur, vUv);
  }
  void main() {
    float depth = texture2D(tDepth, vUv).x;
    vec4 blur = blurAt(distanceMm(depth));
    float amount = smoothstep(0.5, 1.5, max(cocRadius(depth), blur.a));
    gl_FragColor = vec4(mix(texture2D(tColor, vUv).rgb, blur.rgb, amount), 1.0);
    gl_FragDepth = depth;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

// ---------- Ambient occlusion ----------

const AO_SAMPLES = 16
/** World-space reach of the occlusion (metres). */
export const AO_RADIUS = 0.6
/** How dark full occlusion gets. */
const AO_STRENGTH = 2.0

const VIEW_POSITION = /* glsl */ `
  uniform vec2 tanHalf; // tan(half field of view): x across, y up
  float linearDepth(float depth) {
    return (cameraNear * cameraFar) / (cameraFar - depth * (cameraFar - cameraNear));
  }
  vec3 viewPosition(vec2 uv) {
    float z = linearDepth(texture2D(tDepth, uv).x);
    return vec3((uv * 2.0 - 1.0) * tanHalf * z, -z);
  }
`

const AO = /* glsl */ `
  ${COC}
  ${VIEW_POSITION}
  uniform float aoRadius;
  varying vec2 vUv;
  float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 1.0) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; } // sky
    vec3 P = viewPosition(vUv);
    // The surface's facing, from its neighbours (the flatter side, so edges stay clean).
    vec2 px = 2.0 / fullSize;
    vec3 r = viewPosition(vUv + vec2(px.x, 0.0)) - P;
    vec3 l = P - viewPosition(vUv - vec2(px.x, 0.0));
    vec3 u = viewPosition(vUv + vec2(0.0, px.y)) - P;
    vec3 d = P - viewPosition(vUv - vec2(0.0, px.y));
    vec3 N = normalize(cross(abs(r.z) < abs(l.z) ? r : l, abs(u.z) < abs(d.z) ? u : d));
    if (dot(N, -P) < 0.0) N = -N;
    // The reach in pixels at this distance.
    float reach = min(aoRadius / (-P.z * tanHalf.y) * 0.5 * fullSize.y, 0.2 * fullSize.y);
    if (reach < 1.0) { gl_FragColor = vec4(1.0, -P.z, 0.0, 1.0); return; }
    float spin = noise(gl_FragCoord.xy) * 6.2831853;
    float sum = 0.0;
    for (int i = 0; i < ${AO_SAMPLES}; i++) {
      float rr = sqrt((float(i) + 0.5) / ${AO_SAMPLES.toFixed(1)});
      float a = float(i) * 2.39996323 + spin;
      vec3 S = viewPosition(vUv + vec2(cos(a), sin(a)) * rr * reach / fullSize);
      vec3 v = S - P;
      float vv = dot(v, v);
      float falloff = max(0.0, 1.0 - vv / (aoRadius * aoRadius));
      // How steeply the sample rises above the surface (bounded, so a very close occluder can't
      // count for more than the sky it actually hides).
      sum += falloff * max(0.0, dot(v, N) * inversesqrt(vv + 1e-8) - 0.1);
    }
    float ao = max(0.0, 1.0 - ${AO_STRENGTH.toFixed(2)} * sum / ${AO_SAMPLES.toFixed(1)});
    gl_FragColor = vec4(ao, -P.z, 0.0, 1.0);
  }
`

const AO_BLUR = /* glsl */ `
  ${COC}
  ${VIEW_POSITION}
  uniform sampler2D tAo;
  uniform vec2 direction; // one texel of the half-resolution AO, across or up
  varying vec2 vUv;
  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 1.0) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; } // sky
    float z = linearDepth(depth);
    float sum = 0.0;
    float total = 0.0;
    for (int i = -4; i <= 4; i++) {
      vec2 uv = vUv + direction * float(i);
      float w = exp(-float(i * i) / 8.0) / (0.02 + abs(linearDepth(texture2D(tDepth, uv).x) - z) / z);
      sum += texture2D(tAo, uv).r * w;
      total += w;
    }
    gl_FragColor = vec4(sum / total, z, 0.0, 1.0); // occlusion, and the distance for upsampling
  }
`

/** The finished picture with no depth of field: tone mapping, colour space, and the scene's depth. */
const OUTPUT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0);
    gl_FragDepth = texture2D(tDepth, vUv).x;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const COMMON_UNIFORMS = () => ({
  tDepth: { value: null },
  tColor: { value: null },
  cameraNear: { value: 0.05 },
  cameraFar: { value: 1000 },
  focal: { value: 50 },
  stopN: { value: 2.8 },
  focusMm: { value: -1 },
  pxPerMm: { value: 40 },
  maxRadius: { value: 20 },
  fullSize: { value: new Vector2(1, 1) },
  tileCount: { value: new Vector2(1, 1) },
  tanHalf: { value: new Vector2(1, 1) }
})

function material(fragmentShader: string, extra: Record<string, { value: unknown }>, output = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: { ...COMMON_UNIFORMS(), ...extra },
    depthTest: output,
    depthWrite: output,
    toneMapped: output
  })
}

const halfTarget = (format: typeof RGFormat | typeof RGBAFormat) =>
  new WebGLRenderTarget(1, 1, { type: HalfFloatType, format, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })

const smallTarget = () =>
  new WebGLRenderTarget(1, 1, { type: FloatType, format: RedFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })

export interface ClayPostOptions {
  /** Depth of field for this lens and focus, or null for none. */
  dof: DofParams | null
  /** Work out this picture's ambient occlusion, for the next drawing of the set (`withOcclusion`). */
  ao: boolean
}

export class ClayPost {
  /** Render the set into this (multisampled colour + depth), then call render(). */
  readonly target: WebGLRenderTarget
  private tiles = smallTarget()
  private spread = smallTarget()
  private half: WebGLRenderTarget
  private aoA = halfTarget(RGFormat) // occlusion, distance
  private aoB = halfTarget(RGFormat)
  private aoValid = false // aoA holds the occlusion of the last picture at this size
  private aoMat = material(AO, { aoRadius: { value: AO_RADIUS } })
  private aoBlur = material(AO_BLUR, { tAo: { value: null }, direction: { value: new Vector2() } })
  private output = material(OUTPUT, {}, true)
  private tileMat = material(TILES, {})
  private spreadMat = material(SPREAD, { tTiles: { value: null }, tilePx: { value: TILE } })
  private gather = material(GATHER, { tSpread: { value: null }, squeeze: { value: 1 } })
  private blend = material(BLEND, { tBlur: { value: null }, halfSize: { value: new Vector2(1, 1) } }, true)
  private quad = new Mesh(new PlaneGeometry(2, 2))
  private quadScene = new Scene()
  private quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(width = 1, height = 1) {
    this.target = new WebGLRenderTarget(width, height, {
      type: HalfFloatType,
      format: RGBAFormat,
      samples: 4,
      depthTexture: new DepthTexture(width, height, UnsignedIntType)
    })
    this.target.depthTexture!.minFilter = NearestFilter
    this.target.depthTexture!.magFilter = NearestFilter
    this.half = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
    // Always draw over whatever is there, writing the scene's depth.
    this.blend.depthFunc = AlwaysDepth
    this.output.depthFunc = AlwaysDepth
    this.setSize(width, height)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h)
    const resize = (t: WebGLRenderTarget, tw: number, th: number) => {
      if (t.width !== tw || t.height !== th) t.setSize(tw, th)
    }
    const hw = Math.max(1, Math.round(w / 2))
    const hh = Math.max(1, Math.round(h / 2))
    // The depth-of-field gather runs at full resolution (half-resolution edges looked rough).
    resize(this.half, w, h)
    if (this.aoA.width !== hw || this.aoA.height !== hh) this.aoValid = false
    resize(this.aoA, hw, hh)
    resize(this.aoB, hw, hh)
    resize(this.tiles, Math.ceil(w / TILE), Math.ceil(h / TILE))
    resize(this.spread, Math.ceil(w / TILE), Math.ceil(h / TILE))
  }

  private pass(gl: WebGLRenderer, m: ShaderMaterial, output: WebGLRenderTarget | null): void {
    this.quad.material = m
    gl.setRenderTarget(output)
    gl.render(this.quadScene, this.quadCamera)
  }

  /** Finish `target` into `output` (null = the screen, 'none' = only work out the occlusion). The camera is the one the set was rendered with. */
  render(gl: WebGLRenderer, camera: PerspectiveCamera, options: ClayPostOptions, output: WebGLRenderTarget | null | 'none'): void {
    const { width, height } = this.target
    const p = options.dof
    const maxRadius = Math.max(0.5, Math.min(height * MAX_RADIUS_FRACTION, MAX_SPREAD * TILE))
    const tanY = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom
    const all = [this.aoMat, this.aoBlur, this.output, this.tileMat, this.spreadMat, this.gather, this.blend]
    for (const m of all) {
      const u = m.uniforms
      u.tDepth.value = this.target.depthTexture
      u.tColor.value = this.target.texture
      u.cameraNear.value = camera.near
      u.cameraFar.value = camera.far
      u.focal.value = p?.focalLength ?? 50
      u.stopN.value = p?.stop ?? 2.8
      u.focusMm.value = p && Number.isFinite(p.focus) ? p.focus * 1000 : -1
      u.pxPerMm.value = p?.pxPerMm ?? 0
      u.maxRadius.value = maxRadius
      u.fullSize.value.set(width, height)
      u.tileCount.value.set(this.tiles.width, this.tiles.height)
      u.tanHalf.value.set(tanY * camera.aspect, tanY)
    }
    this.spreadMat.uniforms.tTiles.value = this.tiles.texture
    this.gather.uniforms.tSpread.value = this.spread.texture
    this.gather.uniforms.squeeze.value = Math.max(1, p?.squeeze ?? 1)
    this.blend.uniforms.tBlur.value = this.half.texture
    this.blend.uniforms.halfSize.value.set(this.half.width, this.half.height)

    const previous = gl.getRenderTarget()
    const autoClear = gl.autoClear
    try {
      gl.autoClear = true
      if (options.ao) {
        this.pass(gl, this.aoMat, this.aoA)
        const blur = this.aoBlur.uniforms
        blur.tAo.value = this.aoA.texture
        blur.direction.value.set(1 / this.aoA.width, 0)
        this.pass(gl, this.aoBlur, this.aoB)
        blur.tAo.value = this.aoB.texture
        blur.direction.value.set(0, 1 / this.aoA.height)
        this.pass(gl, this.aoBlur, this.aoA)
        this.aoValid = true
      }
      if (output === 'none') {
        // Only the occlusion was wanted.
      } else if (p) {
        this.pass(gl, this.tileMat, this.tiles)
        this.pass(gl, this.spreadMat, this.spread)
        this.pass(gl, this.gather, this.half)
        this.pass(gl, this.blend, output)
      } else {
        this.pass(gl, this.output, output)
      }
    } finally {
      gl.autoClear = autoClear
      gl.setRenderTarget(previous)
    }
  }

  /**
   * Draw the set (inside `draw`) with the ambient occlusion of the last picture rendered at this
   * size applied to the materials' sky and bounce light. Call prepareOcclusion(scene) first.
   */
  withOcclusion(draw: () => void): void {
    if (!this.aoValid) {
      draw()
      return
    }
    SCREEN_AO.stAo.value = this.aoA.texture
    SCREEN_AO.stAoSize.value.set(this.aoA.width, this.aoA.height)
    SCREEN_AO.stViewSize.value.set(this.target.width, this.target.height)
    SCREEN_AO.stAoOn.value = 1
    try {
      draw()
    } finally {
      SCREEN_AO.stAoOn.value = 0
      SCREEN_AO.stAo.value = null
    }
  }

  dispose(): void {
    this.target.depthTexture?.dispose()
    this.target.dispose()
    this.tiles.dispose()
    this.spread.dispose()
    this.half.dispose()
    this.aoA.dispose()
    this.aoB.dispose()
    for (const m of [this.aoMat, this.aoBlur, this.output, this.tileMat, this.spreadMat, this.gather, this.blend]) m.dispose()
    this.quad.geometry.dispose()
  }
}

// ---------- Occlusion in the materials ----------
//
// Ambient occlusion only blocks light arriving from all around (the sky fill and bounce). Standard
// materials in the set get it through three's ambient-occlusion step (aomap_fragment), which
// already scales just their indirect light: the half-resolution occlusion is read at the pixel,
// upsampled using only neighbours at the same distance so it never bleeds across an edge (a finger
// in front of a wall keeps its own value), and ignored where the last picture saw something else.

const SCREEN_AO = {
  stAo: { value: null as Texture | null },
  stAoSize: { value: new Vector2(1, 1) },
  stViewSize: { value: new Vector2(1, 1) },
  stAoOn: { value: 0 }
}

const SCREEN_AO_PARS = /* glsl */ `
#ifdef ST_AO
uniform sampler2D stAo;   // occlusion, distance (half resolution)
uniform vec2 stAoSize;    // its size in texels
uniform vec2 stViewSize;  // the picture's size in pixels
uniform float stAoOn;

void stAoTap( vec2 texel, float weight, float z, inout float sum, inout float total ) {
	vec2 s = texture2D( stAo, ( texel + 0.5 ) / stAoSize ).rg;
	float w = weight * max( 0.0, 1.0 - abs( s.g - z ) / ( 0.03 * z + 0.002 ) );
	sum += w * s.r;
	total += w;
}

float stScreenOcclusion( float z ) {
	vec2 p = gl_FragCoord.xy / stViewSize * stAoSize - 0.5;
	vec2 b = floor( p );
	vec2 f = p - b;
	float sum = 0.0;
	float total = 0.0;
	stAoTap( b, ( 1.0 - f.x ) * ( 1.0 - f.y ), z, sum, total );
	stAoTap( b + vec2( 1.0, 0.0 ), f.x * ( 1.0 - f.y ), z, sum, total );
	stAoTap( b + vec2( 0.0, 1.0 ), ( 1.0 - f.x ) * f.y, z, sum, total );
	stAoTap( b + vec2( 1.0, 1.0 ), f.x * f.y, z, sum, total );
	if ( total < 1e-4 ) return 1.0;
	return mix( 1.0, sum / total, smoothstep( 0.0, 0.25, total ) );
}

// Light bounces around inside a crease before it gets out, so pale surfaces never go fully dark
// (multi-bounce fit, Jimenez et al., "Practical Real-Time Strategies for Accurate Indirect
// Occlusion", 2016).
vec3 stMultiBounce( float ao, vec3 albedo ) {
	vec3 a = 2.0404 * albedo - 0.3324;
	vec3 b = -4.7951 * albedo + 0.6417;
	vec3 c = 2.7552 * albedo + 0.6903;
	return max( vec3( ao ), ( ( ao * a + b ) * ao + c ) * ao );
}
#endif
`

const SCREEN_AO_APPLY = /* glsl */ `
#ifdef ST_AO
	if ( stAoOn > 0.5 ) {
		float stOcclusion = stScreenOcclusion( - vViewPosition.z );
		reflectedLight.indirectDiffuse *= stMultiBounce( stOcclusion, material.diffuseColor );
		reflectedLight.indirectSpecular *= stOcclusion;
	}
#endif
`

/** Add the occlusion to three's ambient-occlusion shader step (once). */
function patchChunks(): void {
  if (ShaderChunk.aomap_pars_fragment.includes('stScreenOcclusion')) return
  ShaderChunk.aomap_pars_fragment += SCREEN_AO_PARS
  ShaderChunk.aomap_fragment += SCREEN_AO_APPLY
}

// One shared function, so materials that are otherwise alike still share one compiled program.
function attachScreenAo(shader: { uniforms: Record<string, { value: unknown }> }): void {
  Object.assign(shader.uniforms, SCREEN_AO)
}

const attached = new WeakSet<Material>()

/**
 * Before drawing the set with `withOcclusion`: let its standard materials take the screen-space
 * occlusion. Viewport helpers are left alone. Cheap to call every frame.
 */
export function prepareOcclusion(scene: Object3D): void {
  patchChunks()
  const visit = (o: Object3D) => {
    if (o.userData.helper) return
    const mesh = o as { isMesh?: boolean; material?: Material | Material[] }
    if (mesh.isMesh && mesh.material) {
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (attached.has(m) || !(m as MeshStandardMaterial).isMeshStandardMaterial) continue
        attached.add(m)
        const standard = m as MeshStandardMaterial
        standard.defines = { ...standard.defines, ST_AO: '' }
        standard.onBeforeCompile = attachScreenAo
        standard.needsUpdate = true
      }
    }
    for (const c of o.children) visit(c)
  }
  visit(scene)
}
