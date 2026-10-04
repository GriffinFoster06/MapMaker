#!/usr/bin/env bash
# Regenerates tools/fdlibm-vectors/vectors.json from the unmodified netlib fdlibm 5.3 sources.
# Needs network, curl and a C compiler. Not run in CI: the committed vectors.json is the test input.
# FMA contraction is disabled so the C reference uses exactly the IEEE operations the TypeScript port performs.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="${1:-$(mktemp -d)}"
mkdir -p "$work/src" "$work/build"
cd "$work/src"
idx="$(curl -fsSL https://www.netlib.org/fdlibm/index | grep -oE 'fdlibm/[A-Za-z_0-9.]+' | sed 's|fdlibm/||' | sort -u)"
for f in $idx; do [ -f "$f" ] || curl -fsSL -o "$f" "https://www.netlib.org/fdlibm/$f"; done
FILES="e_hypot e_acos e_acosh e_asin e_atan2 e_atanh e_cosh e_exp e_log e_log10 e_pow e_rem_pio2 e_sinh e_sqrt k_cos k_rem_pio2 k_sin k_tan s_asinh s_atan s_cbrt s_copysign s_cos s_expm1 s_fabs s_finite s_floor s_ceil s_log1p s_scalbn s_sin s_tan s_tanh s_isnan"
OBJS=()
for f in $FILES; do
  clang -O0 -ffp-contract=off -fno-fast-math -w -D_IEEE_LIBM -D__LITTLE_ENDIAN -include "$here/rename.h" -c "$f.c" -o "$work/build/$f.o"
  OBJS+=("$work/build/$f.o")
done
# FreeBSD msun e_log2.c (netlib fdlibm 5.3 has no log2), pinned to a commit.
FB=f12b76524d7bbf3d6c1a890834b6f8d018704ef0
mkdir -p "$work/fb"
for f in e_log2.c k_log.h; do [ -f "$work/fb/$f" ] || curl -fsSL -o "$work/fb/$f" "https://raw.githubusercontent.com/freebsd/freebsd-src/$FB/lib/msun/src/$f"; done
echo "// intentionally empty" > "$work/fb/math_private.h"
clang -O0 -ffp-contract=off -fno-fast-math -w -Dlog2=fd_log2 -include "$here/fb_shim.h" -I"$work/fb" -c "$work/fb/e_log2.c" -o "$work/build/fb_e_log2.o"
OBJS+=("$work/build/fb_e_log2.o")
clang -O0 -ffp-contract=off -w -c "$here/driver.c" -o "$work/build/driver.o"
clang "$work/build/driver.o" "${OBJS[@]}" -o "$work/build/driver"
"$work/build/driver" "${N:-1000}" > "$work/vectors.txt"
{ (cd "$work/src" && shasum -a 256 *.c fdlibm.h); (cd "$work/fb" && shasum -a 256 e_log2.c k_log.h | sed 's|  |  freebsd@'"$FB"':|'); } > "$work/sources.sha256"
node "$here/pack.mjs" "$work/vectors.txt" "$work/sources.sha256" > "$here/vectors.json"
echo "wrote $here/vectors.json ($(wc -l < "$work/vectors.txt") vectors)"
