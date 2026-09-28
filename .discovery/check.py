import csv, io, re, urllib.request, collections, html
S={"META":"15yljVveX8oiGL-JFIAFag2z_RREBO2TSj0C3KZLbTB0","VENDAS":"1mniLIjov9tc4jlPpXKN3l_aOYfeOFCmC73apABI7nZY"}
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"chk/1.0","Cache-Control":"no-cache"}),timeout=60).read().decode("utf-8","replace")
for k,sid in S.items():
    h=get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
    print("htmlview gids:", sorted(set(re.findall(r'gid[=:]\s*"?(\d+)', h))), "| titles:", re.findall(r'<title>(.*?)</title>', h))
    tabs={"META":[("0","Meta Ads")],"VENDAS":[("796495406","Vendas"),("193755064","Leads")]}[k]
    print("###",k,"TABS:",tabs)
    for gid,name in tabs:
        rows=list(csv.reader(io.StringIO(get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"))))
        print(f"\n== {k} {name!r} gid={gid} rows={len(rows)}")
        if not rows: continue
        print("HEADER:",rows[0])
        c=collections.Counter((r[0] if r else '') for r in rows[1:]); print("COL0 values (datas):",sorted(c.items())[-15:])
        for r in rows[-3:]: print("LAST:",r)
