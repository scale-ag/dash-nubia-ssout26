import csv, io, urllib.request, collections, sys
sys.path.insert(0,"build"); import build
rows=list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(build.SEG_URL,headers={"User-Agent":"d"}),timeout=60).read().decode("utf-8","replace"))))
print("HEADER:",rows[0],"linhas:",len(rows)-1)
seg=build.process_seg(rows)
bad=[r[0] for r in rows[1:] if r and r[0].strip() and not build.parse_date(r[0])]
print("datas não reconhecidas:",len(bad),collections.Counter(bad).most_common(5))
by=collections.defaultdict(lambda:[0,0.0,0.0])
for x in seg:
    m=(x["d"] or "SEM DATA")[:7]; by[m][0]+=1; by[m][1]+=x["sp"]; by[m][2]+=x["fol"]
for m in sorted(by): print(" ",m,"linhas",by[m][0],"gasto",round(by[m][1],2),"seguidores",by[m][2])
print("CAMPANHAS:"); [print("  ",k,v) for k,v in collections.Counter(x["camp"] for x in seg).items()]
print("min/max:",min(x["d"] for x in seg if x["d"]),max(x["d"] for x in seg if x["d"]))
print("amostra 1as linhas:",rows[1:3]); print("amostra últimas:",rows[-2:])
