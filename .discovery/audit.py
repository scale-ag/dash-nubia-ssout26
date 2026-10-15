import csv, io, sys, urllib.request, collections
sys.path.insert(0,"build"); import build
get=lambda u: list(csv.reader(io.StringIO(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"audit"}),timeout=60).read().decode("utf-8","replace"))))
meta=get(build.META_CSV_URL); sales=get(build.SALES_CSV_URL)
print("CAMPANHAS NO META:"); [print("  ",k,"| linhas",v) for k,v in collections.Counter(r[1] for r in meta[1:]).items()]
print("RMK / SS12 no Meta:")
for r in meta[1:]:
    if "RMK" in r[1].upper() or "SS12" in r[3].upper() or "SS12" in r[2].upper(): print("  ",repr(r[1]),"|",repr(r[2]),"|",repr(r[3]),"|",r[0])
h=sales[0]; ix={n:i for i,n in enumerate(h)}
print("VENDAS RMK (repr):")
for n,r in enumerate(sales[1:],start=2):
    if "RMK" in " ".join(r).upper(): print("  ",n,repr(r[ix['utm_campaign']]),"|",repr(r[ix['utm_medium']]),"|",repr(r[ix['utm_content']]),"|",repr(r[ix['utm_term']]))
