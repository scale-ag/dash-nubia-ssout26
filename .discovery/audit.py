import csv, io, sys, urllib.request, collections
sys.path.insert(0,"build"); import build
get=lambda u: list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"audit"}),timeout=60).read().decode("utf-8","replace"))))
d=build.process(get(build.META_CSV_URL), get(build.SALES_CSV_URL))
M=d["meta"]; S=[s for s in d["sales"] if s["meta"]]
print("DIAS:", sorted(collections.Counter(m["d"] for m in M).items()))
print("GASTO POR DIA:", [(k, round(sum(m["sp"] for m in M if m["d"]==k),2)) for k in sorted({m["d"] for m in M})])
def agg(keyf, label):
    print(f"\n### {label} (SEM imposto)  gasto | impr | cliques link | LPV | IC | vendas | CPM | CTR | CIC")
    g=collections.defaultdict(lambda:[0,0,0,0,0,0])
    for m in M: a=g[keyf(m)]; a[0]+=m["sp"]; a[1]+=m["im"]; a[2]+=m["cl"]; a[3]+=m["pv"]; a[4]+=m["ck"]
    for s in S: g[keyf(s)][5]+=s["main"]
    for k,(sp,im,cl,pv,ck,v) in sorted(g.items(), key=lambda x:-x[1][0]):
        print(f"{k} | R$ {sp:.2f} | {im:.0f} | {cl:.0f} | {pv:.0f} | {ck:.0f} | {v} | CPM {sp/im*1000 if im else 0:.2f} | CTR {cl/im*100 if im else 0:.2f}% | CIC {sp/ck if ck else 0:.2f}")
agg(lambda r:r["camp"],"CAMPANHA"); agg(lambda r:(r["camp"][-22:],r["adset"][-14:]),"CONJUNTO"); agg(lambda r:(r["camp"][-22:],r["adset"][-14:],r["ad"]),"ANUNCIO")
tot=[sum(m[k] for m in M) for k in("sp","im","cl","pv","ck")]; print("\nTOTAL:",[round(x,2) for x in tot],"vendas meta:",sum(s["main"] for s in S))
