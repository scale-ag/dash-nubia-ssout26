import csv, io, re, urllib.request, collections
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"d"}),timeout=60).read().decode("utf-8","replace")
sid="1pD3Q4LOSPDWGfCG0xAIrdPOnCzWmOlhSM3d5xQMObnU"
h=get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
print("TABS:",re.findall(r'id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>(.*?)</a>',h,re.S), "gids:",sorted(set(re.findall(r'gid[=:]\s*"?(\d+)',h))))
for gid in sorted(set(re.findall(r'gid[=:]\s*"?(\d+)',h))) or ["0"]:
    rows=list(csv.reader(io.StringIO(get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"))))
    print(f"\n== gid {gid} linhas {len(rows)}"); print("HEADER:",rows[0] if rows else None)
    if not rows: continue
    H=rows[0]
    for r in rows[1:4]: print("ROW:",r)
    ci=H.index("Campaign Name") if "Campaign Name" in H else 1
    print("CAMPANHAS:",collections.Counter(r[ci] for r in rows[1:] if len(r)>ci).most_common())
    print("DIAS:",sorted(collections.Counter(r[0] for r in rows[1:]).items()))
    # soma colunas numéricas por campanha
    for j,c in enumerate(H):
        if j<=3: continue
        tot=collections.defaultdict(float)
        for r in rows[1:]:
            v=(r[j] if j<len(r) else "").replace(".","").replace(",",".")
            try: tot[r[ci]]+=float(v or 0)
            except: pass
        print(f"  SOMA {c}:",{k[:40]:round(v,2) for k,v in tot.items()})
try:
    rows=list(csv.reader(io.StringIO(get("https://docs.google.com/spreadsheets/d/1RrlEKrKqvoweVriQv6M2j7-FZdkKb4DydVoMa-9IOy8/export?format=csv&gid=0"))))
    print("\nLEADS OK, linhas",len(rows),"HEADER:",rows[0])
    H=[x.lower() for x in rows[0]]
    for j,c in enumerate(H):
        if c.startswith("utm"): print("  ",c,collections.Counter(r[j] for r in rows[1:] if j<len(r)).most_common(12))
except Exception as e: print("\nLEADS ERRO:",e)
