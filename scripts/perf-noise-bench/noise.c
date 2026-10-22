// Native port of SimplexNoise.noise3D / fbm (packages/gen-orogen/src/port/simplex-noise.ts) for the performance study.
// Same operations in the same order; build WITHOUT fused multiply-add and fast-math so the doubles equal the JS results:
//   clang -O2 -ffp-contract=off -fno-fast-math noise.c -o noise
// Usage: ./noise <perm512.bin> <points.f64> <count> <out.f64> [octaves]   (prints seconds for the noise loop only)
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static const int G[12][3] = {{1,1,0},{-1,1,0},{1,-1,0},{-1,-1,0},{1,0,1},{-1,0,1},{1,0,-1},{-1,0,-1},{0,1,1},{0,-1,1},{0,1,-1},{0,-1,-1}};
static uint8_t P[512], M[512];

static double noise3d(double x, double y, double z) {
  const double F = 1.0 / 3.0, H = 1.0 / 6.0, s = (x + y + z) * F;
  const double fi = floor(x + s), fj = floor(y + s), fk = floor(z + s);
  const double t = (fi + fj + fk) * H, x0 = x - fi + t, y0 = y - fj + t, z0 = z - fk + t;
  int i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) { if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; } else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; } else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; } }
  else { if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; } else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; } else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; } }
  const double x1 = x0 - i1 + H, y1 = y0 - j1 + H, z1 = z0 - k1 + H, x2 = x0 - i2 + 2 * H, y2 = y0 - j2 + 2 * H, z2 = z0 - k2 + 2 * H;
  const double x3 = x0 - 1 + 3 * H, y3 = y0 - 1 + 3 * H, z3 = z0 - 1 + 3 * H;
  const int ii = (int)((int64_t)fi & 255), jj = (int)((int64_t)fj & 255), kk = (int)((int64_t)fk & 255);
  double n0 = 0, n1 = 0, n2 = 0, n3 = 0, a, b, c, d;
  a = 0.6 - x0*x0 - y0*y0 - z0*z0; if (a > 0) { a *= a; const int* v = G[M[ii + P[jj + P[kk]]]]; n0 = a*a*(v[0]*x0 + v[1]*y0 + v[2]*z0); }
  b = 0.6 - x1*x1 - y1*y1 - z1*z1; if (b > 0) { b *= b; const int* v = G[M[ii + i1 + P[jj + j1 + P[kk + k1]]]]; n1 = b*b*(v[0]*x1 + v[1]*y1 + v[2]*z1); }
  c = 0.6 - x2*x2 - y2*y2 - z2*z2; if (c > 0) { c *= c; const int* v = G[M[ii + i2 + P[jj + j2 + P[kk + k2]]]]; n2 = c*c*(v[0]*x2 + v[1]*y2 + v[2]*z2); }
  d = 0.6 - x3*x3 - y3*y3 - z3*z3; if (d > 0) { d *= d; const int* v = G[M[ii + 1 + P[jj + 1 + P[kk + 1]]]]; n3 = d*d*(v[0]*x3 + v[1]*y3 + v[2]*z3); }
  return 32 * (n0 + n1 + n2 + n3);
}

static double fbm(double x, double y, double z, int octaves, double persistence) {
  double sum = 0, max = 0, amp = 1;
  for (int o = 0; o < octaves; o++) { double f = (double)(1 << o); sum += amp * noise3d(x * f, y * f, z * f); max += amp; amp *= persistence; }
  return sum / max;
}

int main(int argc, char** argv) {
  if (argc < 5) return 2;
  FILE* f = fopen(argv[1], "rb"); if (!f || fread(P, 1, 512, f) != 512) return 3; fclose(f);
  for (int i = 0; i < 512; i++) M[i] = P[i] % 12;
  long n = atol(argv[3]); int oct = argc > 5 ? atoi(argv[5]) : 5;
  double* pts = malloc(sizeof(double) * 3 * n); double* out = malloc(sizeof(double) * n);
  f = fopen(argv[2], "rb"); if (!f || fread(pts, 8, 3 * n, f) != (size_t)(3 * n)) return 4; fclose(f);
  struct timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a);
  for (long i = 0; i < n; i++) out[i] = fbm(pts[3*i], pts[3*i+1], pts[3*i+2], oct, 2.0 / 3.0);
  clock_gettime(CLOCK_MONOTONIC, &b);
  printf("%.6f\n", (b.tv_sec - a.tv_sec) + 1e-9 * (b.tv_nsec - a.tv_nsec));
  f = fopen(argv[4], "wb"); fwrite(out, 8, n, f); fclose(f);
  return 0;
}
