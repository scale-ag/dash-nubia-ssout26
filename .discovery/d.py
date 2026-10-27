import csv, io, urllib.request, collections, sys
sys.path.insert(0,"build"); import build
get=lambda u: list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"d"}),timeout=60).read().decode("utf-8","replace"))))
old=get(build.META_CSV_URL); cap=get(build.BF_META_URL); seg=get(build.SEG_URL)
def camps(rows,ci=1):
    c=collections.defaultdict(lambda:[None,None,0.0,0])
    H=rows[0]; si=H.index("Amount Spent")
    for r in rows[1:]:
        if len(r)<=si: continue
        x=c[r[ci]]; d=r[0]; x[0]=min(x[0] or d,d); x[1]=max(x[1] or d,d); x[2]+=build.to_float(r[si]); x[3]+=1
    return c
for n,rows in (("ANTIGA SS-OUT26",old),("ADVERONIX captação",cap),("ADVERONIX seguidores",seg)):
    print("\n##",n,"linhas",len(rows)-1)
    for k,v in camps(rows).items(): print(f"   {v[0]}→{v[1]} R$ {v[2]:.2f} ({v[3]} linhas) | {k}")
a=set(camps(old)); b=set(camps(cap))|set(camps(seg)); print("\nCAMPANHAS EM COMUM:",a&b)
try:
    l=get(build.BF_LEADS_URL); print("\nLEADS OK linhas",len(l)-1,"HEADER",l[0])
    H=[h.strip().lower() for h in l[0]]
    for j,h in enumerate(H):
        if h.startswith("utm") or "data" in h or "date" in h:
            v=[r[j] for r in l[1:] if j<len(r) and r[j]]
            print("  ",h,"| amostra:",collections.Counter(v).most_common(6) if h.startswith("utm") else (min(v) if v else None, max(v) if v else None))
except Exception as e: print("\nLEADS ERRO:",e)
