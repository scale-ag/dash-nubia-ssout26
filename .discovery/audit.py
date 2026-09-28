import csv, io, sys, urllib.request, collections
sys.path.insert(0, "build")
import build
get=lambda u: list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"audit"}),timeout=60).read().decode("utf-8","replace"))))
meta=get(build.META_CSV_URL); sales=get(build.SALES_CSV_URL)
H=meta[0]; print("META HEADER", H)
for r in meta[1:]: print("M|"+"|".join(x.replace("|","/") for x in r))
sh=sales[0]; keep=[i for i,h in enumerate(sh) if h in("data_venda","utm_source","utm_campaign","utm_medium","utm_content","utm_term","faturamento","produto")]
print("SALES (sem PII):",[sh[i] for i in keep])
for r in sales[1:]: print("S|"+" || ".join(r[i] for i in keep if i<len(r)))
# estrutura
C,A,D=1,2,3
camp_ad_sets=collections.defaultdict(set); adset_camps=collections.defaultdict(set); ad_camps=collections.defaultdict(set)
for r in meta[1:]:
    camp_ad_sets[(r[C],r[D])].add(r[A]); adset_camps[r[A]].add(r[C]); ad_camps[r[D]].add((r[C],r[A]))
print("\n(camp,ad) em >1 conjunto:"); [print("  ",k,"->",sorted(v)) for k,v in camp_ad_sets.items() if len(v)>1]
print("conjunto (nome) em >1 campanha:"); [print("  ",k,"->",sorted(v)) for k,v in adset_camps.items() if len(v)>1]
print("anuncio (nome) em >1 campanha/conjunto:"); [print("  ",k,len(v)) for k,v in ad_camps.items() if len(v)>1]
data=build.process(meta,sales)
for s in data["sales"]: print("PROCESSED SALE:",{k:s[k] for k in("d","camp","adset","ad","prod","val","main","meta")})
# spend consistency
raw=sum(build.to_float(r[H.index("Amount Spent")]) for r in meta[1:]); proc=sum(m["sp"] for m in data["meta"]); print("spend raw",round(raw,2),"proc",round(proc,2))
