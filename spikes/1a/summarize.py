import json,sys
t=sys.stdin.read(); j=json.loads(t[t.index('{\n'):])
print(j['params'], 'nodeMs',j['nodeMs'],'arrays',j['nArrays'],'repeat',j['sameProcessRepeat'],'fresh',j['freshProcess'])
for b,v in j['browsers'].items(): print('  ',b,v['version'],v['ms'],'ms mismatched:',v['mismatched'], {k:(d['nDiff'],d['maxUlpF32'],d['maxAbs']) for k,d in v['detail'].items()})
