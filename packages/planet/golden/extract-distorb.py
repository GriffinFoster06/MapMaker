#!/usr/bin/env python3
"""Collect VPLanet SSDistOrbDistRot output (one model directory) as JSON: inputs and every 20 kyr row. Usage: extract-distorb.py <run-dir>"""
import json, sys, re, os, hashlib
d = sys.argv[1]
names = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'george', 'neptune']
def read_in(n):
    out = {}
    for line in open(os.path.join(d, n + '.in')):
        line = line.split('#')[0].split()
        if len(line) >= 2:
            out[line[0]] = line[1]
    return out
planets = []
for n in names:
    k = read_in(n)
    planets.append({'name': n, 'mass_msun': float(k['dMass']), 'semi_au': float(k['dSemi']), 'ecc': float(k['dEcc']),
                    'inc_deg': float(k['dInc']), 'longP_deg': float(k['dLongP']), 'longA_deg': float(k['dLongA']),
                    'grCorr': int(k.get('bGRCorr', '0')),
                    'obliq_deg': float(k.get('dObliquity', '0')) if 'distrot' in k.get('saModules', 'distrot') or True else 0.0})
cols = {}
for n in names:
    rows = []
    for i, line in enumerate(open(os.path.join(d, 'solarsys.%s.forward' % n.capitalize()))):
        v = [float(x) for x in line.split()]
        if i < 3 or round(v[0]) % 20000 == 0:
            rows.append(v)
    cols[n] = rows
sha = {f: hashlib.sha256(open(os.path.join(d, f), 'rb').read()).hexdigest() for f in ['vpl.in'] + [n + '.in' for n in names] + ['sun.in']}
print(json.dumps({'oracle': 'VPLanet dd55da7 examples/SSDistOrbDistRot, bVarDt 0, dTimeStep 1 yr, dStopTime 1e6, dOutputTime 1000 (edited vpl.in)', 'columns': open(os.path.join(d, 'earth.in')).read().split('saOutputOrder')[1].split('\n')[0].split(),
                  'sources_sha256': sha, 'planets': planets, 'rows': cols}, indent=0, separators=(',', ':')))
