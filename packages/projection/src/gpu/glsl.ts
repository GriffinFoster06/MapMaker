// GLSL ES 3.00 for the interactive flat map (ARCHITECTURE §3.7, "Interactive (GPU)"; decision 5-5). Ports of d3's raw
// inverse and forward formulas (d3-geo 3.1.1 src/projection/*.js, d3-geo-projection 4.0.0 src/mollweide.js and
// src/robinson.js; ISC), the ProjectionView domain check, and the data lookup (lookup.ts).
//
// Per fragment, mirroring ProjectionView.invert and MeshSampler:
//   1. raw coordinates from the pixel centre: x = (px − tx)/k, y = (ty − py)/k (d3's scaleTranslate, no angle/reflect);
//   2. the raw inverse, written as d3 writes it, with d3's clamped asin/acos and d3-geo-projection's clamped sqrt;
//      iteration counts as d3's, with d3's stopping tests (at float32 the tight ones simply run to the count);
//   3. the domain rules of ProjectionView: |φ| ≤ 90°, the clip circle about the raw origin, Mercator's latitude
//      limit, then the forward projection (λ wrapped as d3's rotation wraps it) must return within 0.5 px;
//   4. the canonical unit vector: v = uRot · (cos φ cos λ, cos φ sin λ, sin φ), uRot being the view's raw → geographic
//      rotation (computed in float64 on the CPU);
//   5. the cube-map start triangle, then the visibility walk of TriangleLocator (bounded by MAX_WALK steps):
//      barycentrics relative to the triangle's first vertex a, with B = b − a, C = c − a, X = v − a:
//      total = v·(B × C), w1 = X·(C × a), w2 = X·(a × B), w0 = total − w1 − w2 (the same triple products as the CPU,
//      rearranged so no term cancels at the triangle's scale), normalised by total;
//   6. the layer's sample rule: barycentric (weights clamped at 0 and renormalised, as the CPU) or nearest (the
//      closest vertex of the triangle, then the greedy Delaunay walk of SpatialIndex.nearestCell).
// Outside the domain the fragment is transparent (display) or status 0 (debug), like the CPU path's NaN.

/** Ids of the GPU projections (decision 5-5), indexing PROJ in the shader. */
export const GPU_PROJECTION_IDS = [
  'equirectangular', 'mercator', 'equalEarth', 'mollweide', 'naturalEarth1', 'robinson', 'orthographic', 'stereographic',
  'azimuthalEqualArea', 'azimuthalEquidistant',
] as const;
export type GpuProjectionId = (typeof GPU_PROJECTION_IDS)[number];

/** Upper bound on visibility-walk steps per pixel; reaching it sets a flag (tests assert it never happens). */
export const MAX_WALK = 64;
/** Upper bound on greedy nearest-cell steps per pixel. */
export const MAX_NEAREST = 64;

/**
 * Debug outputs (the debug variant renders to an RGBA32UI target): 1 (v.x, v.y, v.z as float bits, triangle + 1, or
 * all 0 outside); 2 (value bits, nearest cell + 1, walk steps | nearest steps << 8 | flags << 16, min weight bits),
 * flags: 1 walk bound reached, 2 nearest bound reached.
 */
export type DebugMode = 1 | 2;

export const MAP_VERTEX = `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ROBINSON_K = [
  [0.9986, -0.062], [1.0, 0.0], [0.9986, 0.062], [0.9954, 0.124], [0.99, 0.186], [0.9822, 0.248], [0.973, 0.31],
  [0.96, 0.372], [0.9427, 0.434], [0.9216, 0.4958], [0.8962, 0.5571], [0.8679, 0.6176], [0.835, 0.6769],
  [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435], [0.6732, 0.8936], [0.6213, 0.9394], [0.5722, 0.9761],
  [0.5322, 1.0],
].map(([x, y]) => [x!, y! * 1.593415793900743]);
const glslFloat = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** The fragment shader for one projection: the display variant (canvas colour) or the debug variant (uint bits). */
export function mapFragmentShader(projection: GpuProjectionId, debug = false): string {
  const PROJ = GPU_PROJECTION_IDS.indexOf(projection);
  if (PROJ < 0) throw new Error(`no GPU shader for ${projection}`);
  return `
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
#define PROJ ${PROJ}
#define DEBUG ${debug ? 1 : 0}
#define MAX_WALK ${MAX_WALK}
#define MAX_NEAREST ${MAX_NEAREST}
const float PI = 3.141592653589793;
const float HALF_PI = 1.5707963267948966;
const float TAU = 6.283185307179586;
const float EPSILON = 1e-6;

uniform float uK, uTx, uTy;      // d3 scale and translate (pixels)
uniform vec2 uOrigin;            // pixel position of this target's top-left corner in the view
uniform float uTargetH;          // target height (pixels)
uniform mat3 uRot;               // raw frame -> canonical frame
uniform bool uHasClip; uniform float uCosClip;
uniform bool uHasMaxLat; uniform float uMaxLat;
uniform bool uVecRot;            // the view rotates in phi or gamma (d3 round trip through the vector)
uniform int uMode;               // DebugMode (debug variant)
uniform usampler2D uCube; uniform int uCubeR;
uniform usampler2D uTri; uniform usampler2D uHalf; uniform sampler2D uPos;
uniform usampler2D uAdjOff; uniform usampler2D uAdj;
uniform int uTexW;               // width of the flat data textures
uniform int uRule;               // 0 nearest, 1 barycentric
uniform sampler2D uValue;        // per-cell value (R32F), barycentric layers
uniform sampler2D uColor;        // per-cell colour (RGBA8), nearest layers
uniform int uPalette;            // 0 orogen elevation colours, 1 ramp, 2 style lookup, 3 style lookup with nearest land colours
uniform float uLo, uHi;          // ramp range
uniform sampler2D uShade;        // per-cell relief factor (R32F), styled layers (uHasShade)
uniform sampler2D uLut;          // style lookup (RGBA32F): the ocean half then the land half, uLutN texels each
uniform int uHasShade, uLutN;
uniform float uOceanMin, uLandMax; // elevations (metres) of the ends of the lookup

#if DEBUG
layout(location = 0) out highp uvec4 outU;
#else
layout(location = 0) out highp vec4 outColor;
#endif

ivec2 at(int k) { return ivec2(k % uTexW, k / uTexW); }
uint triV(int k) { return texelFetch(uTri, at(k), 0).r; }
int half_(int k) { return int(texelFetch(uHalf, at(k), 0).r); }
vec3 pos(uint c) { int k = 3 * int(c); return vec3(texelFetch(uPos, at(k), 0).r, texelFetch(uPos, at(k + 1), 0).r, texelFetch(uPos, at(k + 2), 0).r); }


// ---- float32 elementary functions ----
// The GPU's built-in transcendental functions are not accurate enough (measured in Chromium/ANGLE-Metal: about
// 4e-4 absolute, a visible 0.1 to 0.6 px displacement at 16x zoom). These are Cephes single-precision algorithms
// (S. L. Moshier, Cephes Math Library: sinf.c, atanf.c, asinf.c, expf.c, logf.c): Cody-Waite range reduction and
// minimax polynomials, accurate to a few float32 ulp. Only sqrt and basic arithmetic come from the GPU.
float msinPoly(float x, float z) { return ((-1.9515295891e-4 * z + 8.3321608736e-3) * z - 1.6666654611e-1) * z * x + x; }
float mcosPoly(float z) { return ((2.443315711809948e-5 * z - 1.388731625493765e-3) * z + 4.166664568298827e-2) * z * z - 0.5 * z + 1.0; }
// Octant reduction (Cephes sinf.c): j = round-to-even-octant(|x| * 4/pi), x - j*pi/4 in three parts.
float mreduce(float x, out int j) {
  j = int(x * 1.2732395447351628);
  j = (j + 1) & ~1;
  float y = float(j);
  return ((x - y * 0.78515625) - y * 2.4187564849853515625e-4) - y * 3.77489497744594108e-8;
}
float msin(float x) {
  float sgn = x < 0.0 ? -1.0 : 1.0;
  int j; float r = mreduce(abs(x), j), z = r * r;
  j &= 7;
  if (j > 3) { sgn = -sgn; j -= 4; }
  float y = (j == 1 || j == 2) ? mcosPoly(z) : msinPoly(r, z);
  return sgn * y;
}
float mcos(float x) {
  int j; float r = mreduce(abs(x), j), z = r * r;
  j &= 7;
  float sgn = 1.0;
  if (j > 3) { j -= 4; sgn = -sgn; }
  if (j > 1) sgn = -sgn;
  float y = (j == 1 || j == 2) ? msinPoly(r, z) : mcosPoly(z);
  return sgn * y;
}
float matan(float x) {
  float sgn = x < 0.0 ? -1.0 : 1.0, a = abs(x), y = 0.0;
  if (a > 2.414213562373095) { y = HALF_PI; a = -1.0 / a; }
  else if (a > 0.4142135623730950) { y = 0.7853981633974483; a = (a - 1.0) / (a + 1.0); }
  float z = a * a;
  y += (((8.05374449538e-2 * z - 1.38776856032e-1) * z + 1.99777106478e-1) * z - 3.33329491539e-1) * z * a + a;
  return sgn * y;
}
float matan2(float y, float x) {
  if (x == 0.0) return y > 0.0 ? HALF_PI : y < 0.0 ? -HALF_PI : 0.0;
  float t = matan(y / x);
  if (x < 0.0) t += y < 0.0 ? -PI : PI;
  return t;
}
float masin(float x) {
  float sgn = x < 0.0 ? -1.0 : 1.0, a = abs(x), z, r;
  bool big = a > 0.5;
  if (big) { z = 0.5 * (1.0 - a); r = sqrt(z); } else { r = a; z = a * a; }
  float y = ((((4.2163199048e-2 * z + 2.4181311049e-2) * z + 4.5470025998e-2) * z + 7.4953002686e-2) * z + 1.6666752422e-1) * z * r + r;
  if (big) y = HALF_PI - 2.0 * y;
  return sgn * y;
}
float macos(float x) {
  if (x < -0.5) return PI - 2.0 * masin(sqrt(0.5 * (1.0 + x)));
  if (x > 0.5) return 2.0 * masin(sqrt(0.5 * (1.0 - x)));
  return HALF_PI - masin(x);
}
float mexp(float x) {
  float z = floor(1.4426950408889634 * x + 0.5);
  x -= z * 0.693359375;
  x -= z * -2.12194440e-4;
  float y = (((((1.9875691500e-4 * x + 1.3981999507e-3) * x + 8.3334519073e-3) * x + 4.1665795894e-2) * x + 1.6666665459e-1) * x + 5.0000001201e-1) * x * x + x + 1.0;
  int e = int(z);
  if (e > 127) return intBitsToFloat(0x7f800000);
  if (e < -126) return 0.0;
  return y * intBitsToFloat((e + 127) << 23);
}
float mlog(float x) {
  if (!(x > 0.0)) return x == 0.0 ? -intBitsToFloat(0x7f800000) : intBitsToFloat(0x7fc00000);
  int bits = floatBitsToInt(x);
  int e = ((bits >> 23) & 0xff) - 126;
  x = intBitsToFloat((bits & 0x807fffff) | 0x3f000000); // mantissa in [0.5, 1)
  if (x < 0.7071067811865476) { e -= 1; x = x + x - 1.0; } else { x = x - 1.0; }
  float z = x * x, fe = float(e);
  float y = ((((((((7.0376836292e-2 * x - 1.1514610310e-1) * x + 1.1676998740e-1) * x - 1.2420140846e-1) * x + 1.4249322787e-1) * x - 1.6668057665e-1) * x + 2.0000714765e-1) * x - 2.4999993993e-1) * x + 3.3333331174e-1) * x * z;
  y += -2.12194440e-4 * fe;
  y += -0.5 * z;
  return x + y + 0.693359375 * fe;
}
float mtan(float x) { return msin(x) / mcos(x); }

// d3-geo math.js: asin and acos clamp; d3-geo-projection's sqrt returns 0 for x <= 0.
float d3asin(float x) { return x > 1.0 ? HALF_PI : x < -1.0 ? -HALF_PI : masin(x); }
float d3acos(float x) { return x > 1.0 ? 0.0 : x < -1.0 ? PI : macos(x); }

#if PROJ == 2
const float A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, EE_M = 0.8660254037844386;
#endif
#if PROJ == 3
const float MW_CX = 0.9003163161571061, MW_CY = 1.4142135623730951, MW_CP = PI; // sqrt2 / halfPi, sqrt2, pi
#endif
#if PROJ == 5
const vec2 RK[20] = vec2[20](${ROBINSON_K.map(([x, y]) => `vec2(${glslFloat(x!)}, ${glslFloat(y!)})`).join(', ')});
#endif

// ---- raw forward (lambda already wrapped to [-pi, pi]) ----
bool rawForward(float l, float p, out vec2 xy) {
#if PROJ == 0
  xy = vec2(l, p); return true;
#elif PROJ == 1
  xy = vec2(l, mlog(mtan((HALF_PI + p) / 2.0))); return true;
#elif PROJ == 2
  float m = d3asin(EE_M * msin(p)), m2 = m * m, m6 = m2 * m2 * m2;
  xy = vec2(l * mcos(m) / (EE_M * (A1 + 3.0 * A2 * m2 + m6 * (7.0 * A3 + 9.0 * A4 * m2))), m * (A1 + A2 * m2 + m6 * (A3 + A4 * m2)));
  return true;
#elif PROJ == 3
  float cpsin = MW_CP * msin(p), th = p, delta;
  for (int i = 0; i < 30; i++) { th -= delta = (th + msin(th) - cpsin) / (1.0 + mcos(th)); if (!(abs(delta) > EPSILON)) break; }
  th /= 2.0;
  xy = vec2(MW_CX * l * mcos(th), MW_CY * msin(th)); return true;
#elif PROJ == 4
  float p2 = p * p, p4 = p2 * p2;
  xy = vec2(l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
            p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))));
  return true;
#elif PROJ == 5
  float fi = min(18.0, abs(p) * 36.0 / PI);
  int i0 = int(floor(fi)); float di = fi - float(i0);
  vec2 a = RK[i0], b = RK[i0 + 1], c = RK[min(19, i0 + 2)];
  xy = vec2(l * (b.x + di * (c.x - a.x) / 2.0 + di * di * (c.x - 2.0 * b.x + a.x) / 2.0),
            sign(p) * (b.y + di * (c.y - a.y) / 2.0 + di * di * (c.y - 2.0 * b.y + a.y) / 2.0));
  return true;
#elif PROJ == 6
  xy = vec2(mcos(p) * msin(l), msin(p)); return true;
#elif PROJ == 7
  float cy = mcos(p), k = 1.0 + mcos(l) * cy;
  xy = vec2(cy * msin(l) / k, msin(p) / k); return k != 0.0;
#else
  // d3's azimuthalRaw: k(cos c) times (cos phi sin lambda, sin phi), cos c = cos lambda cos phi. In float32, sin c is
  // taken from the components (sin c = |(cos phi sin lambda, sin phi)|) instead of from cos c, which cancels near
  // the antipode; the formulas are d3's, rearranged.
  float cy = mcos(p), ex = cy * msin(l), ey = msin(p), cc = mcos(l) * cy, sc = sqrt(ex * ex + ey * ey);
#if PROJ == 8
  if (1.0 + cc == 0.0) { xy = vec2(2.0, 0.0); return true; } // d3: k === Infinity -> [2, 0]
  // k = sqrt(2 / (1 + cos c)); for cos c < 0, 1 + cos c = sin^2 c / (1 - cos c).
  if (cc >= 0.0) { float k = sqrt(2.0 / (1.0 + cc)); xy = vec2(k * ex, k * ey); }
  else { if (sc == 0.0) { xy = vec2(2.0, 0.0); return true; } float k = sqrt(2.0 * (1.0 - cc)) / sc; xy = vec2(k * ex, k * ey); }
  return true;
#else
  // k = c / sin c, c = acos(cos c) = atan2(sin c, cos c); d3 gives k = 0 at c = 0.
  float c = matan2(sc, cc);
  float k = c == 0.0 ? 0.0 : c / sc;
  xy = vec2(k * ex, k * ey); return true;
#endif
#endif
}

// ---- raw inverse ----
// lp = (lambda, phi) as d3 returns them. The azimuthals also return the raw unit vector directly (AZ_VECTOR):
// (cos c, x sin c / z, y sin c / z) equals d3's atan2/asin form but stays accurate in float32 next to the poles and
// the antipode, where asin(y sin c / z) loses half its digits.
#if PROJ >= 6
#define AZ_VECTOR 1
#endif
bool rawInverse(float x, float y, out vec2 lp, out vec3 az) {
#if PROJ == 0
  lp = vec2(x, y); return true;
#elif PROJ == 1
  if (abs(y) > 40.0) return false; // far beyond the latitude limit (y = pi there); avoids exp overflow
  lp = vec2(x, 2.0 * matan(mexp(y)) - HALF_PI); return true;
#elif PROJ == 2
  float m = y, m2 = m * m, m6 = m2 * m2 * m2;
  for (int i = 0; i < 12; i++) {
    float fy = m * (A1 + A2 * m2 + m6 * (A3 + A4 * m2)) - y;
    float fpy = A1 + 3.0 * A2 * m2 + m6 * (7.0 * A3 + 9.0 * A4 * m2);
    float delta = fy / fpy;
    m -= delta; m2 = m * m; m6 = m2 * m2 * m2;
    if (abs(delta) < 1e-12) break;
  }
  float cm = mcos(m);
  if (cm == 0.0) return false;
  lp = vec2(EE_M * x * (A1 + 3.0 * A2 * m2 + m6 * (7.0 * A3 + 9.0 * A4 * m2)) / cm, d3asin(msin(m) / EE_M));
  return true;
#elif PROJ == 3
  // d3: t = asin(y / cy), lambda = x / (cx cos t), phi = asin((2t + sin 2t) / cp). Near the poles both asin calls lose
  // half their digits in float32, so with u = pi - 2|t| = 2 acos(|y| / cy): cos t = sin(u / 2) and
  // 1 - (2|t| + sin 2|t|) / pi = (u - sin u) / pi, summed as a series for small u; phi = atan2(s, sqrt((1 - s)(1 + s))).
  float a = abs(y) / MW_CY;
  if (a > 1.0) a = 1.0; // d3's asin clamps
  float u = 2.0 * macos(a), ct = msin(0.5 * u);
  if (ct == 0.0) return false;
  float u2 = u * u, d = u < 0.5 ? u * u2 * (1.0 / 6.0 - u2 * (1.0 / 120.0 - u2 * (1.0 / 5040.0 - u2 / 362880.0))) : u - msin(u);
  float om = d / MW_CP, sp = 1.0 - om; // 1 - s and s = (2|t| + sin 2|t|) / pi
  float p = matan2(sp, sqrt(max(0.0, om * (2.0 - om))));
  lp = vec2(x / (MW_CX * ct), y < 0.0 ? -p : p); return true;
#elif PROJ == 4
  float p = y, p2, p4, delta;
  for (int i = 0; i < 25; i++) {
    p2 = p * p; p4 = p2 * p2;
    p -= delta = (p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - y) /
        (1.007226 + p2 * (0.015085 * 3.0 + p4 * (-0.044475 * 7.0 + 0.028874 * 9.0 * p2 - 0.005916 * 11.0 * p4)));
    if (!(abs(delta) > EPSILON)) break;
  }
  p2 = p * p;
  lp = vec2(x / (0.8707 + p2 * (-0.131979 + p2 * (-0.013791 + p2 * p2 * p2 * (0.003971 - 0.001529 * p2)))), p);
  return true;
#elif PROJ == 5
  float phi = y * 90.0, fi = min(18.0, abs(phi / 5.0));
  int i0 = max(0, int(floor(fi)));
  float di = 0.0;
  for (int guard = 0; guard < 20; guard++) {
    float ay = RK[i0].y, by = RK[i0 + 1].y, cy = RK[min(19, i0 + 2)].y;
    float u = cy - ay, v = cy - 2.0 * by + ay, t = 2.0 * (abs(y) - by) / u, c = v / u;
    di = t * (1.0 - c * t * (1.0 - 2.0 * c * t));
    if (di >= 0.0 || i0 == 1) {
      phi = (y >= 0.0 ? 5.0 : -5.0) * (di + fi);
      for (int j = 0; j < 50; j++) {
        fi = min(18.0, abs(phi) / 5.0);
        i0 = int(floor(fi));
        di = fi - float(i0);
        ay = RK[i0].y; by = RK[i0 + 1].y; cy = RK[min(19, i0 + 2)].y;
        float delta = sign(y) * (by + di * (cy - ay) / 2.0 + di * di * (cy - 2.0 * by + ay) / 2.0) - y;
        phi -= delta * (180.0 / PI);
        if (!(abs(delta) > 1e-12)) break;
      }
      break;
    }
    i0--;
    if (i0 < 0) break;
  }
  if (i0 < 0) i0 = 0;
  float ax = RK[i0].x, bx = RK[i0 + 1].x, cx = RK[min(19, i0 + 2)].x;
  lp = vec2(x / (bx + di * (cx - ax) / 2.0 + di * di * (cx - 2.0 * bx + ax) / 2.0), phi * (PI / 180.0));
  return true;
#else
  float z = sqrt(x * x + y * y);
#if PROJ == 6
  float c = d3asin(z);
#elif PROJ == 7
  float c = 2.0 * matan(z);
#elif PROJ == 8
  float c = 2.0 * d3asin(z / 2.0);
#else
  float c = z;
#endif
  float sc = msin(c), cc = mcos(c);
  az = z == 0.0 ? vec3(1.0, 0.0, 0.0) : vec3(cc, x * sc / z, y * sc / z);
  lp = vec2(matan2(az.y, az.x), matan2(az.z, sqrt(az.x * az.x + az.y * az.y))); return true;
#endif
}

// Inverse with the ProjectionView domain check; out: the raw-frame unit vector.
// The round trip follows d3: with a phi or gamma rotation (uVecRot) d3 goes through geographic coordinates and its
// rotation recomputes lambda and phi from the vector, so at a raw pole lambda is lost; without one it keeps lambda
// (rotationIdentity / rotationLambda only wrap it). Pixels just beyond a pole line are therefore outside in rotated
// views and inside in unrotated ones, in both paths.
bool invertPixel(vec2 pix, out vec3 vr) {
  float x = (pix.x - uTx) / uK, y = (uTy - pix.y) / uK;
  vec2 lp; vec3 az;
  if (!rawInverse(x, y, lp, az)) return false;
  float l = lp.x, p = lp.y;
  if (abs(p) > HALF_PI) return false;
#ifdef AZ_VECTOR
  vr = az;
#else
  float cp = mcos(p);
  vr = vec3(cp * mcos(l), cp * msin(l), msin(p));
#endif
  if (uHasClip && vr.x < uCosClip) return false;
  if (uHasMaxLat && abs(p) > uMaxLat) return false;
  if (uVecRot) { l = matan2(vr.y, vr.x); p = matan2(vr.z, sqrt(vr.x * vr.x + vr.y * vr.y)); }
  else if (abs(l) > PI) l -= floor(l / TAU + 0.5) * TAU; // d3's rotation wraps longitude (Math.round)
  vec2 f;
  if (!rawForward(l, p, f)) return false;
  vec2 back = vec2(uTx + uK * f.x, uTy - uK * f.y);
  float dx = back.x - pix.x, dy = back.y - pix.y;
  return dx * dx + dy * dy <= 0.25; // within 0.5 px
}

// Cube-map texel of a direction (lookup.ts cubeTexel).
uint cubeStart(vec3 d) {
  vec3 a = abs(d);
  int face; float u, v;
  if (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0 : 1; u = d.y / a.x; v = d.z / a.x; }
  else if (a.y >= a.z) { face = d.y > 0.0 ? 2 : 3; u = d.x / a.y; v = d.z / a.y; }
  else { face = d.z > 0.0 ? 4 : 5; u = d.x / a.z; v = d.y / a.z; }
  int R = uCubeR;
  int i = clamp(int(floor((u + 1.0) / 2.0 * float(R))), 0, R - 1);
  int j = clamp(int(floor((v + 1.0) / 2.0 * float(R))), 0, R - 1);
  return texelFetch(uCube, ivec2((face % 3) * R + i, (face / 3) * R + j), 0).r;
}

// Barycentric weights of v in triangle t, normalised by their sum (orientation-independent).
vec3 bary(int t, vec3 v, out uvec3 ids) {
  ids = uvec3(triV(3 * t), triV(3 * t + 1), triV(3 * t + 2));
  vec3 a = pos(ids.x), b = pos(ids.y), c = pos(ids.z);
  vec3 B = b - a, C = c - a, X = v - a;
  float total = dot(v, cross(B, C));
  float w1 = dot(X, cross(C, a)), w2 = dot(X, cross(a, B));
  float w0 = total - w1 - w2;
  return vec3(w0, w1, w2) / total;
}

float d2(uint c, vec3 v) { vec3 d = pos(c) - v; return dot(d, d); }

vec3 elevationColor(float e) {
  if (e < -0.50) return vec3(0.04, 0.06, 0.30);
  if (e < -0.10) { float t = (e + 0.50) / 0.40; return vec3(0.04 + t * 0.07, 0.06 + t * 0.14, 0.30 + t * 0.18); }
  if (e < 0.00) { float t = (e + 0.10) / 0.10; return vec3(0.11 + t * 0.19, 0.20 + t * 0.22, 0.48 + t * 0.12); }
  if (e < 0.002) { float t = e / 0.002; return vec3(0.72 + t * 0.08, 0.68 - t * 0.02, 0.46 - t * 0.10); }
  if (e < 0.25) { float t = (e - 0.002) / 0.248; return vec3(0.20 - t * 0.06, 0.54 - t * 0.12, 0.12 + t * 0.08); }
  if (e < 0.50) { float t = (e - 0.25) / 0.25; return vec3(0.14 + t * 0.30, 0.42 - t * 0.14, 0.20 - t * 0.06); }
  if (e < 0.75) { float t = (e - 0.50) / 0.25; return vec3(0.44 + t * 0.16, 0.28 + t * 0.12, 0.14 + t * 0.18); }
  float t = min(1.0, (e - 0.75) / 0.20); return vec3(0.60 + t * 0.35, 0.40 + t * 0.50, 0.32 + t * 0.60);
}

vec3 rampColor(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 s0 = vec3(0.1, 0.15, 0.55), s1 = vec3(0.1, 0.55, 0.6), s2 = vec3(0.95, 0.9, 0.3), s3 = vec3(0.8, 0.15, 0.1);
  float f = x * 3.0; int i = min(2, int(floor(f))); float u = f - float(i);
  vec3 a = i == 0 ? s0 : i == 1 ? s1 : s2, b = i == 0 ? s1 : i == 1 ? s2 : s3;
  return a + (b - a) * u;
}

// The style's colour at elevation m (packages/carto/src/colour.ts lutColor, float32): sea (m <= 0) and land are separate
// halves of the table, so the coastline is a step, never a blend.
vec3 lutColor(float m) {
  bool sea = m <= 0.0;
  float t = sea ? (m - uOceanMin) / (0.0 - uOceanMin) : m / uLandMax;
  float x = clamp(t, 0.0, 1.0) * float(uLutN - 1);
  int i0 = min(uLutN - 2, int(floor(x)));
  float f = x - float(i0);
  int base = (sea ? 0 : uLutN) + i0;
  vec3 a = texelFetch(uLut, ivec2(base, 0), 0).rgb, b = texelFetch(uLut, ivec2(base + 1, 0), 0).rgb;
  return a + (b - a) * f;
}

// three.js's linear -> sRGB transfer (the globe's MeshBasicMaterial output), so both views show the same colours.
vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }

void main() {
  vec2 pix = vec2(uOrigin.x + gl_FragCoord.x, uOrigin.y + uTargetH - gl_FragCoord.y);
  vec3 vr;
#if DEBUG
  if (!invertPixel(pix, vr)) { outU = uvec4(0u); return; }
#else
  if (!invertPixel(pix, vr)) { outColor = vec4(0.0); return; }
#endif
  vec3 v = uRot * vr;
  // Visibility walk (TriangleLocator.locate after its start): step across the edge opposite the smallest weight.
  // A point within float32 noise of an edge can see a slightly negative weight on both sides of it; stepping back to
  // the previous triangle then means the point is on that edge, and the walk stops there.
  int t = int(cubeStart(v)), prev = -1;
  uvec3 ids; vec3 w = bary(t, v, ids);
  int steps = 0; bool done = false;
  for (int s = 0; s < MAX_WALK; s++) {
    int side = 0;
    if (w.y < w[side]) side = 1;
    if (w.z < w[side]) side = 2;
    if (w[side] >= 0.0) { done = true; break; }
    int next = half_(3 * t + (side + 1) % 3) / 3;
    if (next == prev) { done = true; break; }
    prev = t; t = next;
    w = bary(t, v, ids);
    steps++;
  }
#if DEBUG
  if (uMode == 1) { outU = uvec4(floatBitsToUint(v.x), floatBitsToUint(v.y), floatBitsToUint(v.z), uint(t) + 1u); return; }
#endif
  // Nearest cell: the closest triangle vertex, then the greedy walk on the Delaunay graph.
  uint cur = ids.x; float best = d2(ids.x, v);
  float db = d2(ids.y, v); if (db < best) { best = db; cur = ids.y; }
  float dc = d2(ids.z, v); if (dc < best) { best = dc; cur = ids.z; }
  int nsteps = 0; bool settled = false;
  for (int s = 0; s < MAX_NEAREST; s++) {
    bool moved = false;
    uint start = cur;
    int k0 = int(texelFetch(uAdjOff, at(int(start)), 0).r), k1 = int(texelFetch(uAdjOff, at(int(start) + 1), 0).r);
    for (int k = k0; k < k1; k++) {
      uint nb = texelFetch(uAdj, at(k), 0).r;
      float d = d2(nb, v);
      if (d < best) { best = d; cur = nb; moved = true; }
    }
    if (!moved) { settled = true; break; }
    nsteps++;
  }
  vec3 wc = max(w, vec3(0.0)); wc /= wc.x + wc.y + wc.z;
  float value = 0.0;
  if (uRule == 1) value = wc.x * texelFetch(uValue, at(int(ids.x)), 0).r + wc.y * texelFetch(uValue, at(int(ids.y)), 0).r + wc.z * texelFetch(uValue, at(int(ids.z)), 0).r;
#if DEBUG
  uint flags = (done ? 0u : 1u) | (settled ? 0u : 2u);
  outU = uvec4(floatBitsToUint(value), cur + 1u, uint(steps) | (uint(nsteps) << 8) | (flags << 16), floatBitsToUint(min(w.x, min(w.y, w.z))));
#else
  vec3 rgb;
  if (uRule == 0) rgb = texelFetch(uColor, at(int(cur)), 0).rgb;
  else if (uPalette == 0) rgb = elevationColor(value);
  else if (uPalette == 1) rgb = rampColor((value - uLo) / (uHi - uLo));
  else rgb = (uPalette == 3 && value > 0.0) ? texelFetch(uColor, at(int(cur)), 0).rgb : lutColor(value);
  if (uHasShade == 1) rgb *= wc.x * texelFetch(uShade, at(int(ids.x)), 0).r + wc.y * texelFetch(uShade, at(int(ids.y)), 0).r + wc.z * texelFetch(uShade, at(int(ids.z)), 0).r;
  outColor = vec4(toSRGB(rgb), 1.0);
#endif
}
`;
}
