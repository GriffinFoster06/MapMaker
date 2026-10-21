#!/usr/bin/env python3
"""Shrinks screenshots for docs/feedback: scales to a width (default 1000 px) and quantises to 192 colours. Usage: shrink-png.py in.png out.png [width]"""
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
im = Image.open(src).convert('RGB')
im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
im.quantize(colors=192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst, optimize=True)
