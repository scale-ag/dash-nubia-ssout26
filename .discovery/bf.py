import csv, io, re, urllib.request, collections, html
S={"ADV":"1pD3Q4LOSPDWGfCG0xAIrdPOnCzWmOlhSM3d5xQMObnU","LEADS":"1RrlEKrKqvoweVriQv6M2j7-FZdkKb4DydVoMa-9IOy8"}
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"bf"}),timeout=60).read().decode("utf-8","replace")
for k,sid in S.items():
    h=get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
    title=re.findall(r'<title>(.*?)</title>',h)
    tabs=re.findall(r'id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>(.*?)</a>',h,re.S) or re.findall(r'\{name:\s*"([^"]+)",[^}]*?gid:\s*"(\d+)"',h)
    gids=sorted(set(re.findall(r'gid[=:]\s*"?(\d+)',h)))
    print("###",k,title,"tabs:",tabs,"gids:",gids)
    for gid in (gids or ["0"]):
        try: rows=list(csv.reader(io.StringIO(get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"))))
        except Exception as e: print("  gid",gid,"ERRO",e); continue
        print(f"\n== {k} gid={gid} linhas={len(rows)}"); 
        if not rows: continue
        hdr=rows[0]; print("HEADER:",hdr)
        low=[x.strip().lower() for x in hdr]
        # amostra sem PII: só colunas não pessoais
        pii=re.compile(r"nome|name$|email|e-mail|telefone|phone|whats|celular|cpf",re.I)
        safe=[i for i,x in enumerate(hdr) if not pii.search(x) or x.lower() in("campaign name","ad set name","ad name","adset name")]
        for r in rows[1:4]: print("ROW(sem PII):",[r[i] if i<len(r) else "" for i in safe])
        for i,x in enumerate(low):
            if x in("campaign name","campaign","campanha","utm_campaign","utm_source","utm_medium","utm_content","utm_term","day","date","data","ad set name","ad name") or x.startswith("utm"):
                c=collections.Counter(r[i] if i<len(r) else "" for r in rows[1:])
                print(f"DISTINCT {hdr[i]} ({len(c)}):",c.most_common(40))
        # datas
        for i,x in enumerate(low):
            if "data" in x or x in("day","date") or "time" in x or "created" in x:
                v=[r[i] for r in rows[1:] if i<len(r) and r[i]]
                if v: print(f"DATAS {hdr[i]}: min={min(v)} max={max(v)} amostra={v[:3]}")
