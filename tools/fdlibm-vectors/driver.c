/* Reference-vector generator for dmath's fdlibm mode (original MapMaker tooling).
 * Links against the unmodified netlib fdlibm 5.3 sources (renamed fd_*, see rename.h) and prints, for every
 * function, deterministic inputs and the exact output bit patterns as hex. Run via gen.sh. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

double fd_sin(double), fd_cos(double), fd_tan(double), fd_asin(double), fd_acos(double), fd_atan(double);
double fd_atan2(double, double), fd_sinh(double), fd_cosh(double), fd_tanh(double), fd_asinh(double);
double fd_acosh(double), fd_atanh(double), fd_exp(double), fd_expm1(double), fd_log(double), fd_log1p(double);
double fd_log10(double), fd_pow(double, double), fd_cbrt(double);
/* In _IEEE_LIBM mode the w_*.c wrappers are not built; the e_*.c kernels are the public entry points. */
double __ieee754_exp(double), __ieee754_log(double), __ieee754_log10(double), __ieee754_pow(double, double);
double __ieee754_acos(double), __ieee754_asin(double), __ieee754_atan2(double, double), __ieee754_acosh(double);
double __ieee754_atanh(double), __ieee754_sinh(double), __ieee754_cosh(double);
double __ieee754_hypot(double, double), fd_log2(double);

#define fd_exp __ieee754_exp
#define fd_log __ieee754_log
#define fd_log10 __ieee754_log10
#define fd_pow __ieee754_pow
#define fd_acos __ieee754_acos
#define fd_asin __ieee754_asin
#define fd_atan2 __ieee754_atan2
#define fd_acosh __ieee754_acosh
#define fd_atanh __ieee754_atanh
#define fd_sinh __ieee754_sinh
#define fd_cosh __ieee754_cosh
#define fd_hypot __ieee754_hypot

static uint64_t s = 0x9E3779B97F4A7C15ull;
static uint64_t next(void) { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return s; }
static double u01(void) { return (double)(next() >> 11) / 9007199254740992.0; }
static double bits(uint64_t b) { double d; memcpy(&d, &b, 8); return d; }
static uint64_t ubits(double d) { uint64_t b; memcpy(&b, &d, 8); return b; }

typedef double (*F1)(double);
typedef double (*F2)(double, double);
/* mode 0: uniform in [lo,hi]; 1: log-uniform magnitude in [lo,hi] with random sign if sign != 0 */
typedef struct { const char *name; F1 f1; F2 f2; double lo, hi; int mode; int sign; } Fn;

static const double EDGE[] = {
  0.0, -0.0, 1.0, -1.0, 0.5, -0.5, 2.0, -2.0, 0.6931471805599453, 0.34657359027997264, 1.0397207708399179,
  1e-300, -1e-300, 4.9406564584124654e-324, 2.2250738585072014e-308, 1e-10, 1e-20, 1e-30, 3.725290298461914e-9,
  7.0e-18, 0.9999999999999999, 1.0000000000000002, 1.5707963267948966, 3.141592653589793, 6.283185307179586,
  1e5, 1e6, 1e10, 1e15, 1e22, 1e100, 1e300, 709.782712893384, 709.7827128933841, -745.1332191019411, 710.0,
  -708.3964185322641, -746.0, 22.0, 36.04365338911715, 38.0, 56.0, 100.0, 709.0, 710.5, -37.0, -40.0,
  1.7976931348623157e308, -1.7976931348623157e308
};
#define NEDGE ((int)(sizeof EDGE / sizeof EDGE[0]))

static void emit1(const Fn *fn, double x) {
  double y = fn->f1(x);
  printf("%s %016llx %016llx\n", fn->name, (unsigned long long)ubits(x), (unsigned long long)ubits(y));
}
static void emit2(const Fn *fn, double x, double y) {
  double r = fn->f2(x, y);
  printf("%s %016llx %016llx %016llx\n", fn->name, (unsigned long long)ubits(x), (unsigned long long)ubits(y), (unsigned long long)ubits(r));
}
static double draw(const Fn *fn) {
  if (fn->mode == 0) return fn->lo + (fn->hi - fn->lo) * u01();
  double m = __builtin_exp(__builtin_log(fn->lo) + (__builtin_log(fn->hi) - __builtin_log(fn->lo)) * u01());
  return (fn->sign && (next() & 1)) ? -m : m;
}

int main(int argc, char **argv) {
  int n = argc > 1 ? atoi(argv[1]) : 1000;
  Fn t[] = {
    {"sin", fd_sin, 0, 1e-8, 1e6, 1, 1}, {"sin", fd_sin, 0, -50, 50, 0, 0}, {"sin", fd_sin, 0, 1e6, 1e300, 1, 1},
    {"cos", fd_cos, 0, 1e-8, 1e6, 1, 1}, {"cos", fd_cos, 0, -50, 50, 0, 0}, {"cos", fd_cos, 0, 1e6, 1e300, 1, 1},
    {"tan", fd_tan, 0, 1e-8, 1e6, 1, 1}, {"tan", fd_tan, 0, -50, 50, 0, 0}, {"tan", fd_tan, 0, 1e6, 1e300, 1, 1},
    {"asin", fd_asin, 0, -1, 1, 0, 0}, {"acos", fd_acos, 0, -1, 1, 0, 0},
    {"atan", fd_atan, 0, 1e-8, 1e8, 1, 1}, {"atan", fd_atan, 0, -20, 20, 0, 0},
    {"sinh", fd_sinh, 0, 1e-8, 720, 1, 1}, {"cosh", fd_cosh, 0, -720, 720, 0, 0},
    {"tanh", fd_tanh, 0, 1e-8, 50, 1, 1}, {"asinh", fd_asinh, 0, 1e-8, 1e8, 1, 1},
    {"acosh", fd_acosh, 0, 1, 1e8, 1, 0}, {"acosh", fd_acosh, 0, 1, 3, 0, 0},
    {"atanh", fd_atanh, 0, -1, 1, 0, 0},
    {"exp", fd_exp, 0, -745, 710, 0, 0}, {"exp", fd_exp, 0, -2, 2, 0, 0},
    {"expm1", fd_expm1, 0, -40, 710, 0, 0}, {"expm1", fd_expm1, 0, -1, 1, 0, 0},
    {"log", fd_log, 0, 1e-300, 1e300, 1, 0}, {"log", fd_log, 0, 0.5, 2, 0, 0},
    {"log1p", fd_log1p, 0, -0.999999, 1e10, 0, 0}, {"log1p", fd_log1p, 0, -0.5, 0.5, 0, 0},
    {"log10", fd_log10, 0, 1e-300, 1e300, 1, 0},
    {"log2", fd_log2, 0, 1e-300, 1e300, 1, 0}, {"log2", fd_log2, 0, 0.5, 2, 0, 0},
    {"cbrt", fd_cbrt, 0, 1e-300, 1e300, 1, 1},
  };
  int nt = (int)(sizeof t / sizeof t[0]);
  for (int i = 0; i < nt; i++) {
    for (int k = 0; k < n; k++) emit1(&t[i], draw(&t[i]));
  }
  /* The edge list is applied once to each distinct function. */
  const char *seen[64]; int ns = 0;
  for (int i = 0; i < nt; i++) {
    int dup = 0; for (int j = 0; j < ns; j++) if (!strcmp(seen[j], t[i].name)) dup = 1;
    if (dup) continue; seen[ns++] = t[i].name;
    for (int k = 0; k < NEDGE; k++) emit1(&t[i], EDGE[k]);
    emit1(&t[i], bits(0x7ff0000000000000ull)); emit1(&t[i], bits(0xfff0000000000000ull)); emit1(&t[i], bits(0x7ff8000000000000ull));
  }
  Fn a2[] = { {"atan2", 0, fd_atan2, 0, 0, 0, 0}, {"pow", 0, fd_pow, 0, 0, 0, 0}, {"hypot", 0, fd_hypot, 0, 0, 0, 0} };
  for (int k = 0; k < n; k++) {
    double y = (u01() - 0.5) * 40, x = (u01() - 0.5) * 40; emit2(&a2[0], y, x);
    double m = __builtin_exp(__builtin_log(1e-3) + (__builtin_log(1e4) - __builtin_log(1e-3)) * u01());
    emit2(&a2[0], (next() & 1) ? -m : m, (u01() - 0.5) * 1e-3);
  }
  for (int k = 0; k < n; k++) {
    double x = __builtin_exp(__builtin_log(1e-5) + (__builtin_log(1e5) - __builtin_log(1e-5)) * u01());
    emit2(&a2[1], x, (u01() - 0.5) * 60);
    emit2(&a2[1], 0.5 + u01(), (u01() - 0.5) * 2000);
    emit2(&a2[1], -(double)(1 + (int)(next() % 50)), (double)((int)(next() % 21) - 10));
  }
  double sp[] = { 0.0, -0.0, 1.0, -1.0, 0.5, 2.0, -2.0, 3.0, -3.0, 0.5, 10.0, 1e-300, 1e300, 1.7976931348623157e308,
    4.9406564584124654e-324, bits(0x7ff0000000000000ull), bits(0xfff0000000000000ull), bits(0x7ff8000000000000ull),
    1074.0, -1074.0, 1075.0, 1024.0, -1075.0, 1e10, 2147483648.0, 4294967296.0, 9007199254740992.0 };
  int nsp = (int)(sizeof sp / sizeof sp[0]);
  for (int i = 0; i < nsp; i++) for (int j = 0; j < nsp; j++) { emit2(&a2[1], sp[i], sp[j]); emit2(&a2[0], sp[i], sp[j]); emit2(&a2[2], sp[i], sp[j]); }
  for (int k = 0; k < n; k++) {
    emit2(&a2[2], (u01() - 0.5) * 200, (u01() - 0.5) * 200);
    double a = __builtin_exp(__builtin_log(1e-320) + (__builtin_log(1e308) - __builtin_log(1e-320)) * u01());
    double b = __builtin_exp(__builtin_log(1e-320) + (__builtin_log(1e308) - __builtin_log(1e-320)) * u01());
    emit2(&a2[2], (next() & 1) ? -a : a, (next() & 1) ? -b : b);
  }
  return 0;
}
