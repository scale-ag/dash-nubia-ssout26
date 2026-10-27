import csv, io, re, urllib.request, collections, sys
sys.path.insert(0,"build"); import build
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"d","Cache-Control":"no-cache"}),timeout=60).read().decode("utf-8","replace")
sid="1pD3Q4LOSPDWGfCG0xAIrdPOnCzWmOlhSM3d5xQMObnU"
h=get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
gids=sorted(set(re.findall(r'gid[=:]\s*"?(\d+)',h))); print("GIDS:",gids, "nomes:",re.findall(r'sheet-button-(\d+)".*?>([^<]{1,60})<',h,re.S)[:10])
for g in gids:
    rows=list(csv.reader(io.StringIO(get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={g}&t=1"))))
    ds=[r[0] for r in rows[1:] if r and build.parse_date(r[0])]
    print(f"gid {g}: linhas {len(rows)-1} · header {rows[0][:9] if rows else None} · datas {min(ds) if ds else None} → {max(ds) if ds else None}")
    print("   por mês:",sorted(collections.Counter(build.parse_date(d)[:7] for d in ds).items()))
