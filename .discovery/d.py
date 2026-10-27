import csv, io, re, urllib.request, collections, sys
sys.path.insert(0,"build"); import build
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"d"}),timeout=60).read().decode("utf-8","replace")
sid="1RrlEKrKqvoweVriQv6M2j7-FZdkKb4DydVoMa-9IOy8"
h=get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
print("GIDS:",sorted(set(re.findall(r'gid[=:]\s*"?(\d+)',h))))
rows=list(csv.reader(io.StringIO(get(build.BF_LEADS_URL))))
print("HEADER:",rows[0],"| linhas:",len(rows)-1)
H=[x.strip().lower() for x in rows[0]]
pii=re.compile(r"nome|name|email|e-mail|telefone|phone|whats|celular|cpf")
for j,c in enumerate(H):
    if pii.search(c): continue
    v=[r[j] for r in rows[1:] if j<len(r) and r[j].strip()]
    print(f"  [{c}] preenchidos {len(v)} · top:",collections.Counter(v).most_common(8))
bf=build.load_bf()
L=bf["leads"]
print("\nleads_ok:",bf["info"],"| total",len(L),"| meta",sum(x["meta"] for x in L),"| casados",sum(x["hit"] for x in L))
print("sem data:",sum(1 for x in L if not x["d"]))
print("por dia:",sorted(collections.Counter(x["d"] for x in L).items()))
print("por origem:",collections.Counter(x["src"] for x in L).most_common())
print("por anúncio (Meta):",collections.Counter(x["ad"] for x in L if x["meta"]).most_common(20))
print("NÃO casados com utm meta (camp|adset|ad):",collections.Counter((x["camp"][:50],x["adset"][-25:],x["ad"]) for x in L if x["meta"] and not x["hit"]).most_common(10))
print("Ads do Meta:",sorted({m["ad"] for m in bf["meta"]}))
