import {
  AlwaysDepth,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
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
//  1. a half-resolution gather: for each pixel, samples on a golden-angle spiral inside the lens's
//     bokeh shape (an upright oval for anamorphic). A sample counts if its own blur circle reaches
//     this pixel, so blurred foregrounds spread over what's behind them, while sharp things in
//     front are never smeared by the blurred background behind them.
//  2. a full-resolution blend: sharp where the blur is under a pixel, the gathered blur elsewhere.
//     It also writes the scene's depth, so helpers drawn afterwards still hide behind the set.

export interface DofParams {
  focalLength: number
  stop: number
  /** Metres along the lens axis; Infinity allowed. */
  focus: number
  squeeze: number
  /** Output pixels per millimetre of sensor (vertical). */
  pxPerMm: number
}

const MAX_SAMPLES = 400
/** The largest blur drawn, as a fraction of the picture height (a real lens can exceed it). */
const MAX_RADIUS_FRACTION = 1 / 10

const COC = /* glsl */ `
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float focal;     // mm
  uniform float stopN;
  uniform float focusMm;   // < 0: infinity
  uniform float pxPerMm;
  uniform float maxRadius; // output pixels
  float distanceMm(float depth) {
    float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * depth - cameraFar);
    return max(-viewZ * 1000.0, focal * 1.001);
  }
  // Blur circle radius in output pixels.
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

const GATHER = /* glsl */ `
  ${COC}
  uniform sampler2D tColor;
  uniform vec2 fullTexel;  // 1 / output size
  uniform float squeeze;
  uniform int samples;
  varying vec2 vUv;
  const float GOLDEN = 2.39996323;
  void main() {
    float cDepth = texture2D(tDepth, vUv).x;
    float cRadius = cocRadius(cDepth);
    float cDist = distanceMm(cDepth);
    vec3 sum = texture2D(tColor, vUv).rgb;
    float count = 1.0;
    float cover = cRadius;
    float n = float(samples);
    for (int i = 0; i < ${MAX_SAMPLES}; i++) {
      if (i >= samples) break;
      float r = maxRadius * sqrt((float(i) + 0.5) / n);
      float a = float(i) * GOLDEN;
      vec2 uv = vUv + vec2(cos(a) / squeeze, sin(a)) * r * fullTexel;
      float sDepth = texture2D(tDepth, uv).x;
      float sRadius = cocRadius(sDepth);
      // Something behind this pixel can't blur over it by more than this pixel's own blur.
      if (distanceMm(sDepth) > cDist) sRadius = min(sRadius, cRadius * 2.0);
      float ring = maxRadius / sqrt(n) + 0.5;
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
    float amount = smoothstep(0.6, 1.8, max(cocRadius(depth), blur.a));
    gl_FragColor = vec4(mix(texture2D(tColor, vUv).rgb, blur.rgb, amount), 1.0);
    gl_FragDepth = depth;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function material(fragmentShader: string, extra: Record<string, { value: unknown }>, output: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: {
      tDepth: { value: null },
      cameraNear: { value: 0.05 },
      cameraFar: { value: 1000 },
      focal: { value: 50 },
      stopN: { value: 2.8 },
      focusMm: { value: -1 },
      pxPerMm: { value: 40 },
      maxRadius: { value: 20 },
      tColor: { value: null },
      ...extra
    },
    depthTest: output,
    depthWrite: output,
    toneMapped: output
  })
}

export class DepthOfField {
  /** Render the set into this (multisampled colour + depth), then call render(). */
  readonly target: WebGLRenderTarget
  private half: WebGLRenderTarget
  private gather = material(GATHER, { fullTexel: { value: new Vector2() }, squeeze: { value: 1 }, samples: { value: 64 } }, false)
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
    this.half = new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter })
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
    const hw = Math.max(1, Math.round(w / 2))
    const hh = Math.max(1, Math.round(h / 2))
    if (this.half.width !== hw || this.half.height !== hh) this.half.setSize(hw, hh)
  }

  /** Blur `target` into `output` (null = the screen). The camera is the one the set was rendered with. */
  render(gl: WebGLRenderer, camera: PerspectiveCamera, p: DofParams, output: WebGLRenderTarget | null): void {
    const { width, height } = this.target
    const maxRadius = Math.max(0.5, height * MAX_RADIUS_FRACTION)
    // Enough samples that the innermost ones sit about a (half-resolution) pixel from the centre.
    const samples = Math.min(MAX_SAMPLES, Math.max(16, Math.ceil(0.5 * maxRadius * maxRadius * 0.25)))
    for (const m of [this.gather, this.blend]) {
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
    }
    this.gather.uniforms.fullTexel.value.set(1 / width, 1 / height)
    this.gather.uniforms.squeeze.value = Math.max(1, p.squeeze)
    this.gather.uniforms.samples.value = samples
    this.blend.uniforms.tBlur.value = this.half.texture
    this.blend.uniforms.halfSize.value.set(this.half.width, this.half.height)

    const previous = gl.getRenderTarget()
    const autoClear = gl.autoClear
    try {
      gl.autoClear = true
      this.quad.material = this.gather
      gl.setRenderTarget(this.half)
      gl.render(this.quadScene, this.quadCamera)
      this.quad.material = this.blend
      gl.setRenderTarget(output)
      gl.render(this.quadScene, this.quadCamera)
    } finally {
      gl.autoClear = autoClear
      gl.setRenderTarget(previous)
    }
  }

  dispose(): void {
    this.target.depthTexture?.dispose()
    this.target.dispose()
    this.half.dispose()
    this.gather.dispose()
    this.blend.dispose()
    this.quad.geometry.dispose()
  }
}
