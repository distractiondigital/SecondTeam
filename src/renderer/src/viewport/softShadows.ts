import { DoubleSide, FrontSide, ShaderChunk, type Material, type Mesh, type Object3D } from 'three'

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

export const SPOT_SHADOW_NEAR = 0.05
export const SPOT_SHADOW_FAR = 60

const SEARCH = 32
const FILTER = 128 // most samples, for the widest blurs (narrow ones use fewer)
const MAX_UV = 0.03 // the widest blur, as a fraction of the shadow map
const MAX_ANGLE = 0.25 // radians, for point lights

const HELPERS = /* glsl */ `
	#define ST_SPOT_NEAR ${SPOT_SHADOW_NEAR.toFixed(4)}
	#define ST_SPOT_FAR ${SPOT_SHADOW_FAR.toFixed(4)}
	float stNoise( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 stDisc( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float t = float( i ) * 2.399963229728653 + phi;
		return vec2( cos( t ), sin( t ) ) * r;
	}
	// How depth changes across the shadow map on this surface (receiver plane depth bias, Isidoro
	// 2006): samples spread over a sloped surface compare against where the surface itself would be,
	// so a wide soft-shadow filter doesn't shadow the surface onto itself.
	vec2 stDepthSlope( vec3 c ) {
		vec3 dx = dFdx( c );
		vec3 dy = dFdy( c );
		float det = dx.x * dy.y - dx.y * dy.x;
		if ( abs( det ) < 1e-12 ) return vec2( 0.0 );
		vec2 b = vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det;
		return clamp( b, vec2( -2.0 ), vec2( 2.0 ) );
	}
	float stSpotLinear( float d ) {
		return ST_SPOT_NEAR * ST_SPOT_FAR / ( ST_SPOT_FAR - d * ( ST_SPOT_FAR - ST_SPOT_NEAR ) );
	}
`

const GET_SHADOW = /* glsl */ `
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

		shadowCoord.xyz /= shadowCoord.w;
		vec2 slope = stDepthSlope( shadowCoord.xyz ); // before any branching (derivatives)
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		if ( ! ( inFrustum && shadowCoord.z <= 1.0 ) ) return 1.0;

		bool perspective = shadowRadius < 0.0;
		float k = abs( shadowRadius );
		float texel = 1.0 / shadowMapSize.x;
		float phi = stNoise( gl_FragCoord.xy ) * PI2;
		float receiver = perspective ? stSpotLinear( shadowCoord.z ) : shadowCoord.z;

		// 1. Blockers: anything nearer the light within the widest penumbra this point could have.
		float search = perspective
			? k * ( receiver - ST_SPOT_NEAR ) / ( receiver * ST_SPOT_NEAR ) * 0.5
			: k * shadowCoord.z * 0.5;
		search = clamp( search, 2.0 * texel, ${MAX_UV.toFixed(3)} );
		float blockerSum = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < ${SEARCH}; i ++ ) {
			vec2 o = stDisc( i, ${SEARCH}, phi ) * search;
			float d = texture2D( shadowMap, shadowCoord.xy + o ).r;
			if ( d < shadowCoord.z + dot( o, slope ) - 0.5 * texel * length( slope ) ) {
				blockerSum += perspective ? stSpotLinear( d ) : d;
				blockers += 1.0;
			}
		}
		if ( blockers == 0.0 ) return 1.0;
		float blocker = blockerSum / blockers;

		// 2. Penumbra from the source size and the blocker-to-receiver gap.
		float penumbra = perspective ? k * ( receiver - blocker ) / ( blocker * receiver ) : k * ( receiver - blocker );
		float radius = clamp( penumbra * 0.5, 1.5 * texel, ${MAX_UV.toFixed(3)} );

		// 3. Filter that wide (more samples for wider blurs, so soft edges stay smooth).
		int n = int( clamp( radius / texel * 2.0, 16.0, ${FILTER.toFixed(1)} ) );
		float lit = 0.0;
		for ( int i = 0; i < ${FILTER}; i ++ ) {
			if ( i >= n ) break;
			vec2 o = stDisc( i, n, phi + 1.3 ) * radius;
			float d = texture2D( shadowMap, shadowCoord.xy + o ).r;
			lit += step( shadowCoord.z + dot( o, slope ) - 0.5 * texel * length( slope ), d );
		}
		return mix( 1.0, lit / float( n ), shadowIntensity );

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

		// 1. Blockers.
		float search = clamp( halfSize * ( viewSpaceZ - near ) / ( viewSpaceZ * near ), minAngle, ${MAX_ANGLE.toFixed(3)} );
		float blockerSum = 0.0;
		float blockers = 0.0;
		for ( int i = 0; i < ${SEARCH}; i ++ ) {
			vec2 o = stDisc( i, ${SEARCH}, phi ) * search;
			float d = textureCube( shadowMap, normalize( dir + t1 * o.x + t2 * o.y ) ).r;
			if ( d < dp ) {
				blockerSum += near * far / ( far - d * ( far - near ) );
				blockers += 1.0;
			}
		}
		if ( blockers == 0.0 ) return 1.0;
		float blocker = blockerSum / blockers;

		// 2–3. Penumbra (as an angle seen from the light) and filter.
		float angle = clamp( halfSize * ( viewSpaceZ - blocker ) / ( blocker * viewSpaceZ ), minAngle, ${MAX_ANGLE.toFixed(3)} );
		int n = int( clamp( angle / minAngle * 2.0, 16.0, ${FILTER.toFixed(1)} ) );
		float lit = 0.0;
		for ( int i = 0; i < ${FILTER}; i ++ ) {
			if ( i >= n ) break;
			vec2 o = stDisc( i, n, phi + 1.3 ) * angle;
			lit += step( dp, textureCube( shadowMap, normalize( dir + t1 * o.x + t2 * o.y ) ).r );
		}
		return mix( 1.0, lit / float( n ), shadowIntensity );

	}
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
 * object meets the floor, or two faces of a box meet, nothing leaks; the receiver-plane bias above
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

let installed = false

/** Swap three.js's basic shadow filtering for PCSS. Call once, before anything renders. */
export function installSoftShadows(): void {
  if (installed) return
  installed = true
  let s = ShaderChunk.shadowmap_pars_fragment
  // The BASIC getShadow is the last one taking a plain sampler2D (VSM's comes first); the BASIC
  // getPointShadow is the one taking a plain samplerCube (PCF's takes samplerCubeShadow).
  s = replaceFunction(s, 'float getShadow( sampler2D shadowMap', s.lastIndexOf('float getShadow( sampler2D shadowMap'), GET_SHADOW)
  s = replaceFunction(s, 'float getPointShadow( samplerCube shadowMap', 0, GET_POINT_SHADOW)
  // Our helpers go just inside USE_SHADOWMAP.
  s = s.replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP\n${HELPERS}`)
  ShaderChunk.shadowmap_pars_fragment = s
}
