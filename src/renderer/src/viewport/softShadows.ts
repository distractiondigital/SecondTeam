import { DoubleSide, FrontSide, ShaderChunk, ShaderLib, type Light, type Material, type Mesh, type Object3D } from 'three'

// Soft shadows that behave like a real light of a given size: percentage-closer soft shadows
// (PCSS; Fernando, NVIDIA 2005). For each point in shadow, first find how far away whatever casts
// the shadow is (the "blocker"), then blur the shadow edge by the penumbra a source that big would
// throw at that gap. So a shadow is crisp where a foot meets the floor and softens with distance,
// and a bigger source (or a hazier sun) softens it more.
//
// three.js's BASIC shadow maps hold raw depth; this swaps in our filtering for them. Each light's
// size reaches the shader through its existing `shadow.radius` (set in LightView):
//   sun (orthographic):  radius = depth range × tan(angular size) / shadow frustum width   (> 0)
//   spot (perspective):  radius = −size / (2 · tan(half cone))                              (< 0)
//   point (cube map):    radius = size in metres
// Spot shadow cameras use SPOT_SHADOW_NEAR / SPOT_SHADOW_FAR so the shader can linearise depth.
//
// A wide filter on a surface tilted towards the light would catch the surface itself: samples on
// the side nearer the light see it as closer than the point being shaded, and the random rotation
// turns that into speckles. Two allowances, both from the surface's smooth normal (the triangle's
// plane would show the facets on curved faces):
//  - finding the blockers: each sample is compared with the surface's own depth there, the plane
//    through the point square to its normal, mapped into the shadow map with the light's
//    projection worked out at this pixel (stReceiverPlane, called per light in
//    lights_fragment_begin), so a blocker right at a contact still counts;
//  - filtering the edge: a margin from the tilt in every direction (stTilt), so curved skin and
//    cloth never catch themselves.

export const SPOT_SHADOW_NEAR = 0.05
export const SPOT_SHADOW_FAR = 60
/** The sun's shadow camera sits this far "behind" the node (LightView). */
export const SUN_DISTANCE = 25
/** Metres of set covered by the sun's shadows, each way. */
export const SUN_SHADOW_HALF = 12
export const SUN_NEAR = 1
export const SUN_FAR = SUN_DISTANCE * 2.5

const SEARCH = 32
const FILTER = 128 // most samples, for the widest blurs (narrow ones use fewer)
const MAX_UV = 0.05 // the widest blur, as a fraction of the shadow map
const MAX_ANGLE = 0.25 // radians, for point lights

const HELPERS = /* glsl */ `
	#define ST_SPOT_NEAR ${SPOT_SHADOW_NEAR.toFixed(4)}
	#define ST_SPOT_FAR ${SPOT_SHADOW_FAR.toFixed(4)}
	// The sun's shadow map: depth units per unit of map width.
	#define ST_SUN_SLOPE ${((2 * SUN_SHADOW_HALF) / (SUN_FAR - SUN_NEAR)).toFixed(6)}
	float stNoise( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 stDisc( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float t = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( t ), sin( t ) ) * r;
	}
	// How much deeper a surface tilted this far from the light gets, per unit of sideways distance.
	float stTilt() {
		float c = clamp( stCosL, 0.1, 1.0 );
		return 2.5 * sqrt( 1.0 - c * c ) / c; // a margin for curved surfaces
	}
	// The surface's own depth at map offset o, relative to the point, less a margin for curvature.
	#define ST_CURVE 0.8
	float stSurface( vec2 o, float slope ) {
		float most = length( o ) * slope;
		if ( ! stPlaneOk ) return - most;
		return clamp( dot( o, stPlane ), - most, most ) - ST_CURVE * most;
	}
	float stSpotLinear( float d ) {
		return ST_SPOT_NEAR * ST_SPOT_FAR / ( ST_SPOT_FAR - d * ( ST_SPOT_FAR - ST_SPOT_NEAR ) );
	}
	// Is uv lit, blended between the four nearest texels: in a close-up a texel covers many pixels,
	// and a plain yes/no per sample would show as dither and as steps the size of a texel.
	float stLitBilinear( sampler2D map, vec2 uv, vec2 size, float ref, bool perspective ) {
		vec2 t = uv * size - 0.5;
		vec2 f = fract( t );
		vec2 base = ( floor( t ) + 0.5 ) / size;
		vec2 dx = vec2( 1.0 / size.x, 0.0 );
		vec2 dy = vec2( 0.0, 1.0 / size.y );
		vec4 d = vec4(
			texture2D( map, base ).r, texture2D( map, base + dx ).r,
			texture2D( map, base + dy ).r, texture2D( map, base + dx + dy ).r );
		if ( perspective ) d = vec4( stSpotLinear( d.x ), stSpotLinear( d.y ), stSpotLinear( d.z ), stSpotLinear( d.w ) );
		vec4 lit = step( vec4( ref ), d );
		return mix( mix( lit.x, lit.y, f.x ), mix( lit.z, lit.w, f.x ), f.y );
	}
`

const GET_SHADOW = /* glsl */ `
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		if ( ! ( inFrustum && shadowCoord.z <= 1.0 ) ) return 1.0;

		bool perspective = shadowRadius < 0.0;
		float k = abs( shadowRadius );
		float texel = 1.0 / shadowMapSize.x;
		float phi = stNoise( gl_FragCoord.xy ) * PI2;
		float receiver = perspective ? stSpotLinear( shadowCoord.z ) : shadowCoord.z;
		// Most depth the surface can gain per unit of map distance at this tilt (a spot: in metres).
		float tanHalf = k > 1e-6 ? stLampR / k : 0.0;
		float slope = stTilt() * ( perspective ? 2.0 * receiver * tanHalf : ST_SUN_SLOPE );

		// 1. Blockers: anything nearer the light within the widest penumbra this point could have.
		// (spot: the penumbra of a blocker halfway to the light)
		float search = perspective ? 0.5 * k / receiver : k * shadowCoord.z * 0.5;
		search = clamp( search, 2.0 * texel, ${MAX_UV.toFixed(3)} );
		float blockerSum = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < ${SEARCH}; i ++ ) {
			vec2 o = stDisc( i, ${SEARCH}, phi ) * search;
			float d = texture2D( shadowMap, shadowCoord.xy + o ).r;
			float depth = perspective ? stSpotLinear( d ) : d;
			if ( depth < receiver + stSurface( o, slope ) ) {
				blockerSum += depth;
				blockers += 1.0;
			}
		}
		if ( blockers == 0.0 ) return 1.0;
		float blocker = blockerSum / blockers;

		// 2. Penumbra from the source size and the blocker-to-receiver gap.
		float penumbra = perspective ? k * ( receiver - blocker ) / ( blocker * receiver ) : k * ( receiver - blocker );
		float radius = clamp( penumbra * 0.5, 1.5 * texel, ${MAX_UV.toFixed(3)} );
		// A source far bigger than the gap to the blocker leaves only a faint shadow (the blocker hides
		// a small part of it): past the widest blur, fade the shadow instead of chopping it.
		float faint = 1.0 - min( 1.0, ${MAX_UV.toFixed(3)} / max( penumbra * 0.5, 1e-6 ) );

		// 3. Filter that wide (more samples for wider blurs, so soft edges stay smooth).
		int n = int( clamp( radius / texel * 2.0, 16.0, ${FILTER.toFixed(1)} ) );
		float lit = 0.0;
		for ( int i = 0; i < ${FILTER}; i ++ ) {
			if ( i >= n ) break;
			vec2 o = stDisc( i, n, phi + 1.3 ) * radius;
			lit += stLitBilinear( shadowMap, shadowCoord.xy + o, shadowMapSize, receiver + stSurface( o, slope ), perspective );
		}
		return mix( 1.0, mix( lit / float( n ), 1.0, faint ), shadowIntensity );

	}
`

const GET_POINT_SHADOW = /* glsl */ `
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {

		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar > 0.0 || viewSpaceZ - shadowCameraNear < 0.0 ) return 1.0;

		float near = shadowCameraNear;
		float far = shadowCameraFar;
		float dp = ( far * ( viewSpaceZ - near ) ) / ( viewSpaceZ * ( far - near ) ) + shadowBias;
		vec3 dir = normalize( lightToPosition );
		vec3 up = abs( dir.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
		vec3 t1 = normalize( cross( up, dir ) );
		vec3 t2 = cross( dir, t1 );
		float phi = stNoise( gl_FragCoord.xy ) * PI2;
		float halfSize = 0.5 * shadowRadius;
		float minAngle = 2.5 / shadowMapSize.x;
		float receiver = near * far / ( far - dp * ( far - near ) ); // linear, with the bias
		float slope = stTilt() * viewSpaceZ; // metres deeper per radian sideways

		// 1. Blockers.
		float search = clamp( halfSize / viewSpaceZ, minAngle, ${MAX_ANGLE.toFixed(3)} );
		float blockerSum = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < ${SEARCH}; i ++ ) {
			vec2 o = stDisc( i, ${SEARCH}, phi ) * search;
			float d = textureCube( shadowMap, normalize( dir + t1 * o.x + t2 * o.y ) ).r;
			float depth = near * far / ( far - d * ( far - near ) );
			if ( depth < receiver - length( o ) * slope ) {
				blockerSum += depth;
				blockers += 1.0;
			}
		}
		if ( blockers == 0.0 ) return 1.0;
		float blocker = blockerSum / blockers;

		// 2–3. Penumbra (as an angle seen from the light) and filter.
		float wide = halfSize * ( viewSpaceZ - blocker ) / ( blocker * viewSpaceZ );
		float angle = clamp( wide, minAngle, ${MAX_ANGLE.toFixed(3)} );
		float faint = 1.0 - min( 1.0, ${MAX_ANGLE.toFixed(3)} / max( wide, 1e-6 ) );
		int n = int( clamp( angle / minAngle * 2.0, 16.0, ${FILTER.toFixed(1)} ) );
		float lit = 0.0;
		for ( int i = 0; i < ${FILTER}; i ++ ) {
			if ( i >= n ) break;
			vec2 o = stDisc( i, n, phi + 1.3 ) * angle;
			float d = textureCube( shadowMap, normalize( dir + t1 * o.x + t2 * o.y ) ).r;
			lit += step( receiver - length( o ) * slope, near * far / ( far - d * ( far - near ) ) );
		}
		return mix( 1.0, mix( lit / float( n ), 1.0, faint ), shadowIntensity );

	}
`

// Declared before every lit material's lights (lights_pars_begin); set per light in
// lights_fragment_begin, read by the shadow filters.
const RECEIVER_PLANE = /* glsl */ `
float stCosL = 1.0; // the surface's (smooth) facing to the current light
float stLampR = 0.0; // the current spot's radius (m)
vec2 stPlane = vec2( 0.0 ); // the surface's depth change per unit of shadow-map distance
bool stPlaneOk = false;
#ifdef USE_SHADOWMAP
// The light's projection at this pixel, from how the shadow coordinate and the position change
// across the screen plus a step towards the light (which keeps the map position for a sun or a
// spot), then the depth slope of the smooth surface's plane in the map. Depth is the map's own
// for the sun, metres for a spot.
void stReceiverPlane( vec4 coord, bool spot, vec3 P, vec3 L, vec3 N ) {
	vec3 c = coord.xyz / coord.w;
	vec3 A = dFdx( c );
	vec3 B = dFdy( c );
	vec3 a = dFdx( P );
	vec3 b = dFdy( P );
	float towardLight;
	if ( spot ) {
		float lin = ${SPOT_SHADOW_NEAR.toFixed(4)} * ${SPOT_SHADOW_FAR.toFixed(4)} / ( ${SPOT_SHADOW_FAR.toFixed(4)} - c.z * ( ${SPOT_SHADOW_FAR.toFixed(4)} - ${SPOT_SHADOW_NEAR.toFixed(4)} ) );
		float dLin = lin * lin * ( ${SPOT_SHADOW_FAR.toFixed(4)} - ${SPOT_SHADOW_NEAR.toFixed(4)} ) / ( ${SPOT_SHADOW_NEAR.toFixed(4)} * ${SPOT_SHADOW_FAR.toFixed(4)} );
		A.z *= dLin;
		B.z *= dLin;
		towardLight = - 1.0;
	} else {
		towardLight = - ${(1 / (SUN_FAR - SUN_NEAR)).toFixed(6)};
	}
	float det = A.x * B.y - A.y * B.x;
	float cN = dot( L, N );
	stPlaneOk = abs( det ) > 1e-4 * length( A.xy ) * length( B.xy ) && cN > 0.05;
	if ( ! stPlaneOk ) return;
	mat2 toScreen = inverse( mat2( A.xy, B.xy ) );
	vec2 h = vec2( A.z, B.z ) - towardLight / cN * vec2( dot( a, N ), dot( b, N ) );
	stPlane = transpose( toScreen ) * h;
}
#endif
`

/** Replace the body of the function that starts at `signature` (matching braces) in `source`. */
function replaceFunction(source: string, signature: string, from: number, replacement: string): string {
  const start = source.indexOf(signature, from)
  if (start < 0) throw new Error(`softShadows: can't find ${signature}`)
  let depth = 0
  let i = source.indexOf('{', start)
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) break
  }
  return source.slice(0, start) + replacement.trim() + source.slice(i + 1)
}

/**
 * Shadows are cast by surfaces facing the light (three's default is the back faces). Then where an
 * object meets the floor, or two faces of a box meet, nothing leaks; a small normal offset (LightView)
 * keeps lit surfaces from shadowing themselves. Call on a scene before rendering it (cheap).
 */
export function castFromFrontFaces(scene: Object3D): void {
  scene.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.castShadow) return
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      if (m.side !== DoubleSide && m.shadowSide !== FrontSide) m.shadowSide = FrontSide
    }
  })
}

// ---------- Soft light from big sources (area lights) ----------
//
// A big source doesn't just soften shadows: light wraps further round a face, because past the
// point where a small source would stop, part of a big one is still visible. Each light is treated
// as a sphere (or the sun as a disc) of its real size, and a surface's lighting uses the exact
// fraction of that source above its horizon (illuminance of a sphere or disc light, Lagarde & de
// Rousiers, "Moving Frostbite to PBR", 2014), instead of the plain cosine. Highlights widen with
// the source too (roughness + half its angular size, after Karis 2013). In the band where the
// source sits on a surface's horizon, that formula already accounts for the surface hiding part of
// the light, so the shadow map (which would darken the band as self-shadow) eases off there.

const MAX_LIGHTS = 16 // per type

/** Shared by every standard material: sine of the sun's angular radius, and lamps' radii (m). */
const SIZE_UNIFORMS = {
  stDirSin: { value: new Float32Array(MAX_LIGHTS) },
  stPointRadius: { value: new Float32Array(MAX_LIGHTS) },
  stSpotRadius: { value: new Float32Array(MAX_LIGHTS) }
}

const SOFT_LIGHT_PARS = /* glsl */ `
uniform float stDirSin[ ${MAX_LIGHTS} ];
uniform float stPointRadius[ ${MAX_LIGHTS} ];
uniform float stSpotRadius[ ${MAX_LIGHTS} ];
float stSinSigma = 0.0; // sine of the current light's angular radius, as seen from this point

float stLampSin( float radius, vec3 toLight ) {
	return clamp( radius / max( length( toLight ), 1e-3 ), 0.0, 0.999 );
}

// The cosine term for a sphere or disc source of angular radius asin( sinSigma ): equal to
// cos( theta ) while the whole source is above the horizon, then falling smoothly to zero.
float stSourceNL( float cosTheta, float sinSigma ) {
	if ( isnan( cosTheta ) || isinf( cosTheta ) ) return 0.0; // degenerate normals (e.g. card edges)
	cosTheta = clamp( cosTheta, -1.0, 1.0 );
	if ( sinSigma < 1e-3 ) return saturate( cosTheta );
	float sinSigmaSqr = sinSigma * sinSigma;
	if ( cosTheta * cosTheta > sinSigmaSqr ) return saturate( cosTheta );
	float sinTheta = sqrt( max( 1.0 - cosTheta * cosTheta, 1e-6 ) );
	float x = sqrt( 1.0 / sinSigmaSqr - 1.0 );
	float y = clamp( - x * ( cosTheta / sinTheta ), -1.0, 1.0 );
	float sinThetaSqrtY = sinTheta * sqrt( 1.0 - y * y );
	float illuminance = ( cosTheta * acos( y ) - x * sinThetaSqrtY ) * sinSigmaSqr + atan( sinThetaSqrtY / x );
	float nl = illuminance / ( PI * sinSigmaSqr );
	return ( isnan( nl ) || isinf( nl ) ) ? 0.0 : clamp( nl, 0.0, 1.0 );
}

// The shadow map's say, eased off where the source sits on the surface's horizon.
float stShadowBlend( float cosTheta, float shadow ) {
	if ( stSinSigma < 1e-3 || isnan( cosTheta ) ) return shadow;
	return mix( 1.0, shadow, smoothstep( - stSinSigma, stSinSigma, cosTheta ) );
}
`

/** Rewrite the light loops and the direct-light term. Part of installSoftShadows(). */
function installSoftLights(): void {
  let begin = ShaderChunk.lights_fragment_begin
  const after = (s: string, marker: string, insert: string) => {
    if (!s.includes(marker)) throw new Error(`softLights: can't find ${marker}`)
    return s.replace(marker, `${marker}\n\t\t${insert}`)
  }
  begin = after(begin, 'getPointLightInfo( pointLight, geometryPosition, directLight );', 'stSinSigma = stLampSin( stPointRadius[ i ], pointLight.position - geometryPosition );')
  begin = after(begin, 'getSpotLightInfo( spotLight, geometryPosition, directLight );', 'stSinSigma = stLampSin( stSpotRadius[ i ], spotLight.position - geometryPosition ); stLampR = stSpotRadius[ i ];')
  begin = after(begin, 'getDirectionalLightInfo( directionalLight, directLight );', 'stSinSigma = stDirSin[ i ];')
  if (begin.includes('getSunLightInfo( sunLight, directLight );')) begin = after(begin, 'getSunLightInfo( sunLight, directLight );', 'stSinSigma = 0.0;')
  // Every "directLight.color *= ( … ) ? <shadow> : 1.0;" line: ease the shadow off on the horizon.
  begin = begin.replace(/directLight\.color \*= \( directLight\.visible && receiveShadow \) \? (.+) : 1\.0;/g, (_, shadow: string) => {
    const coord = /(vDirectionalShadowCoord|vSpotLightCoord)\[ i \]/.exec(shadow)
    const plane = coord
      ? `stReceiverPlane( ${coord[0]}, ${coord[1] === 'vSpotLightCoord'}, geometryPosition, directLight.direction, geometryNormal );`
      : 'stPlaneOk = false;'
    return `stCosL = dot( geometryNormal, directLight.direction );\n\t\t${plane}\n\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? stShadowBlend( stCosL, ${shadow} ) : 1.0;`
  })
  ShaderChunk.lights_fragment_begin = begin
  // The surface's facing to the current light and a spot's radius, for the shadow filter's tilt.
  ShaderChunk.lights_pars_begin = RECEIVER_PLANE + ShaderChunk.lights_pars_begin

  let pars = ShaderChunk.lights_physical_pars_fragment
  const nl = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );'
  const at = pars.indexOf(nl, pars.indexOf('void RE_Direct_Physical('))
  if (at < 0) throw new Error("softLights: can't find RE_Direct_Physical's cosine")
  pars = pars.slice(0, at) + 'float dotNL = stSourceNL( dot( geometryNormal, directLight.direction ), stSinSigma );' + pars.slice(at + nl.length)
  const spec = 'vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );'
  if (!pars.includes(spec)) throw new Error("softLights: can't find RE_Direct_Physical's highlight")
  pars = pars.replace(
    spec,
    'PhysicalMaterial stWide = material;\n\tstWide.roughness = min( 1.0, material.roughness + 0.5 * stSinSigma );\n\tvec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, stWide );'
  )
  // Highlights only from the part of the source a surface faces (the wrap is for diffuse light; the
  // highlight maths divides by the facing, which blows up on the far side of the terminator).
  const highlight = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;'
  if (!pars.includes(highlight)) throw new Error("softLights: can't find RE_Direct_Physical's highlight sum")
  pars = pars.replace(
    highlight,
    'reflectedLight.directSpecular += saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color * specularBRDF * material.multiScatteringCompensation;'
  )
  ShaderChunk.lights_physical_pars_fragment = SOFT_LIGHT_PARS + pars
  for (const lib of [ShaderLib.standard, ShaderLib.physical]) Object.assign(lib.uniforms, SIZE_UNIFORMS)
}

const typeOrder = (l: Light) => ((l.castShadow ? 2 : 0) + ((l as { map?: unknown }).map ? 1 : 0))

/**
 * Before rendering a scene: put each light's size where the shader finds it, in the same order
 * three.js numbers its lights (scene order, shadow-casting first). Lights carry their size in
 * `userData.sourceSize` (LightView): sine of the angular radius for the sun, radius in metres for
 * lamps.
 */
export function updateLightSizes(scene: Object3D): void {
  const lights: Light[] = []
  const visit = (o: Object3D) => {
    if (!o.visible) return
    if ((o as Light).isLight) lights.push(o as Light)
    for (const c of o.children) visit(c)
  }
  visit(scene)
  lights.sort((a, b) => typeOrder(b) - typeOrder(a))
  const counts = { dir: 0, point: 0, spot: 0 }
  SIZE_UNIFORMS.stDirSin.value.fill(0)
  SIZE_UNIFORMS.stPointRadius.value.fill(0)
  SIZE_UNIFORMS.stSpotRadius.value.fill(0)
  for (const l of lights) {
    const size = Number(l.userData.sourceSize) || 0
    if ((l as { isDirectionalLight?: boolean }).isDirectionalLight && counts.dir < MAX_LIGHTS) SIZE_UNIFORMS.stDirSin.value[counts.dir++] = size
    else if ((l as { isSpotLight?: boolean }).isSpotLight && counts.spot < MAX_LIGHTS) SIZE_UNIFORMS.stSpotRadius.value[counts.spot++] = size
    else if ((l as { isPointLight?: boolean }).isPointLight && counts.point < MAX_LIGHTS) SIZE_UNIFORMS.stPointRadius.value[counts.point++] = size
  }
}

let installed = false

/** Swap three.js's basic shadow filtering for PCSS. Call once, before anything renders. */
export function installSoftShadows(): void {
  // Once per page (a live reload of this file finds the chunks already changed).
  if (installed || ShaderChunk.shadowmap_pars_fragment.includes('stDisc')) return
  installed = true
  let s = ShaderChunk.shadowmap_pars_fragment
  // The BASIC getShadow is the last one taking a plain sampler2D (VSM's comes first); the BASIC
  // getPointShadow is the one taking a plain samplerCube (PCF's takes samplerCubeShadow).
  s = replaceFunction(s, 'float getShadow( sampler2D shadowMap', s.lastIndexOf('float getShadow( sampler2D shadowMap'), GET_SHADOW)
  s = replaceFunction(s, 'float getPointShadow( samplerCube shadowMap', 0, GET_POINT_SHADOW)
  // Our helpers go just inside USE_SHADOWMAP.
  s = s.replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP\n${HELPERS}`)
  ShaderChunk.shadowmap_pars_fragment = s
  installSoftLights()
}
