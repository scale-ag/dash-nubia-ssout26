import csv, io, sys, urllib.request, collections
sys.path.insert(0,"build"); import build
get=lambda u: list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"audit"}),timeout=60).read().decode("utf-8","replace"))))
meta=get(build.META_CSV_URL); sales=get(build.SALES_CSV_URL)
h=sales[0]; print("HEADER:",h, "| linhas:",len(sales)-1)
ix={n:i for i,n in enumerate(h)}
c=lambda r,n: (r[ix[n]] if n in ix and ix[n]<len(r) else "").strip()
d=build.process(meta,sales); kept=len(d["sales"])
camps={build.norm(r[1]) for r in meta[1:] if len(r)>1}
print("META datas:", min(r[0] for r in meta[1:]), "->", max(r[0] for r in meta[1:]), "linhas", len(meta)-1)
print("PRODUTOS:", collections.Counter(c(r,"produto") for r in sales[1:]).most_common())
print("DATAS cruas (amostra de formatos):", sorted({c(r,"data_venda")[:10] if c(r,"data_venda")[:4].isdigit() else c(r,"data_venda") for r in sales[1:]})[:40])
print("\n# linha | data | data_parse | produto | valor | main | meta_hit | ENTRA? | utm_source | utm_campaign | utm_medium | utm_content")
out=0
for n,r in enumerate(sales[1:],start=2):
    if not any(x.strip() for x in r): print(n,"(linha vazia)"); continue
    prod=c(r,"produto"); main=build.is_main_product(prod)
    uc,um,ad=build.norm(c(r,"utm_campaign")),build.norm(c(r,"utm_medium")),build.norm(c(r,"utm_content"))
    hit=(uc,ad) in {(build.norm(x[1]),build.norm(x[3])) for x in meta[1:]} or (um,ad) in {(build.norm(x[1]),build.norm(x[3])) for x in meta[1:]}
    pd=build.parse_date(c(r,"data_venda")); entra=main or hit
    if not entra or not pd or not hit: 
        out+=1
        print(n,"|",c(r,"data_venda"),"|",pd,"|",prod,"|",c(r,"faturamento"),"|",main,"|",hit,"|",entra,"|",c(r,"utm_source"),"|",c(r,"utm_campaign"),"|",c(r,"utm_medium"),"|",c(r,"utm_content"))
print("\nTOTAL linhas:",len(sales)-1,"| entram no build:",kept,"| problemas listados:",out)
print("sales meta=1:",sum(s["meta"] for s in d["sales"]),"| sem data:",sum(1 for s in d["sales"] if not s["d"]))
