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
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type WebGLRenderer
} from 'three'

// Depth of field as a real lens makes it (src/shared/depthOfField.ts has the maths): every pixel's
// blur circle comes from its distance, the focal length, the stop and the focus distance, scaled to
// pixels through the sensor. Render the set into `target` (colour + depth), then `render()`:
//  1. tiles: the largest blur in each 16 × 16 pixel tile;
//  2. spread: each tile takes the largest blur of the tiles around it that could reach it, so a
//     blurred foreground knows to spill over its neighbours;
//  3. gather (half resolution): each pixel averages samples spread evenly over the blur its area
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
  tileCount: { value: new Vector2(1, 1) }
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

const smallTarget = () =>
  new WebGLRenderTarget(1, 1, { type: FloatType, format: RedFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false })

export class DepthOfField {
  /** Render the set into this (multisampled colour + depth), then call render(). */
  readonly target: WebGLRenderTarget
  private tiles = smallTarget()
  private spread = smallTarget()
  private half: WebGLRenderTarget
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
    this.setSize(width, height)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h)
    const resize = (t: WebGLRenderTarget, tw: number, th: number) => {
      if (t.width !== tw || t.height !== th) t.setSize(tw, th)
    }
    resize(this.half, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)))
    resize(this.tiles, Math.ceil(w / TILE), Math.ceil(h / TILE))
    resize(this.spread, Math.ceil(w / TILE), Math.ceil(h / TILE))
  }

  private pass(gl: WebGLRenderer, m: ShaderMaterial, output: WebGLRenderTarget | null): void {
    this.quad.material = m
    gl.setRenderTarget(output)
    gl.render(this.quadScene, this.quadCamera)
  }

  /** Blur `target` into `output` (null = the screen). The camera is the one the set was rendered with. */
  render(gl: WebGLRenderer, camera: PerspectiveCamera, p: DofParams, output: WebGLRenderTarget | null): void {
    const { width, height } = this.target
    const maxRadius = Math.max(0.5, Math.min(height * MAX_RADIUS_FRACTION, MAX_SPREAD * TILE))
    for (const m of [this.tileMat, this.spreadMat, this.gather, this.blend]) {
      const u = m.uniforms
      u.tDepth.value = this.target.depthTexture
      u.tColor.value = this.target.texture
      u.cameraNear.value = camera.near
      u.cameraFar.value = camera.far
      u.focal.value = p.focalLength
      u.stopN.value = p.stop
      u.focusMm.value = Number.isFinite(p.focus) ? p.focus * 1000 : -1
      u.pxPerMm.value = p.pxPerMm
      u.maxRadius.value = maxRadius
      u.fullSize.value.set(width, height)
      u.tileCount.value.set(this.tiles.width, this.tiles.height)
    }
    this.spreadMat.uniforms.tTiles.value = this.tiles.texture
    this.gather.uniforms.tSpread.value = this.spread.texture
    this.gather.uniforms.squeeze.value = Math.max(1, p.squeeze)
    this.blend.uniforms.tBlur.value = this.half.texture
    this.blend.uniforms.halfSize.value.set(this.half.width, this.half.height)

    const previous = gl.getRenderTarget()
    const autoClear = gl.autoClear
    try {
      gl.autoClear = true
      this.pass(gl, this.tileMat, this.tiles)
      this.pass(gl, this.spreadMat, this.spread)
      this.pass(gl, this.gather, this.half)
      this.pass(gl, this.blend, output)
    } finally {
      gl.autoClear = autoClear
      gl.setRenderTarget(previous)
    }
  }

  dispose(): void {
    this.target.depthTexture?.dispose()
    this.target.dispose()
    this.tiles.dispose()
    this.spread.dispose()
    this.half.dispose()
    for (const m of [this.tileMat, this.spreadMat, this.gather, this.blend]) m.dispose()
    this.quad.geometry.dispose()
  }
}
