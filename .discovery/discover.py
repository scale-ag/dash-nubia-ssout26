import csv, io, re, urllib.request, collections, html
SHEETS = {"META": "15yljVveX8oiGL-JFIAFag2z_RREBO2TSj0C3KZLbTB0",
          "VENDAS": "1mniLIjov9tc4jlPpXKN3l_aOYfeOFCmC73apABI7nZY"}
def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": "discovery/1.0"})
    return urllib.request.urlopen(r, timeout=60).read().decode("utf-8", "replace")
tabs = {}
for k, sid in SHEETS.items():
    h = get(f"https://docs.google.com/spreadsheets/d/{sid}/htmlview")
    found = re.findall(r'id="sheet-button-(\d+)"[^>]*>\s*<a[^>]*>(.*?)</a>', h, re.S)
    if not found:
        found = re.findall(r'\{name:\s*"([^"]+)",[^}]*?gid:\s*"(\d+)"', h)
        found = [(g, n) for n, g in found]
    print(f"### {k} {sid} TABS:", [(g, html.unescape(n)) for g, n in found])
    tabs[k] = [(g, html.unescape(re.sub('<[^>]+>', '', n))) for g, n in found]
def load(sid, gid):
    return list(csv.reader(io.StringIO(get(f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"))))
for k, sid in SHEETS.items():
    for gid, name in tabs[k] or [("0", "?")]:
        rows = load(sid, gid)
        print(f"\n===== {k} gid={gid} tab={name!r} rows={len(rows)}")
        if not rows: continue
        print("HEADER:", rows[0])
        for r in rows[1:4]: print("ROW:", r)
        hdr = [c.strip().lower() for c in rows[0]]
        for col in hdr:
            if col in ("campaign name", "utm_campaign", "produto", "product", "status", "utm_source", "utm_medium", "nome do produto", "product name", "status da venda"):
                i = hdr.index(col)
                c = collections.Counter(r[i] for r in rows[1:] if len(r) > i)
                print(f"DISTINCT {col} ({len(c)}):", c.most_common(60))
metarows = None
for gid, name in tabs["META"]:
    if name.strip().lower() == "meta ads": metarows = load(SHEETS["META"], gid)
vrows = None
for gid, name in tabs["VENDAS"]:
    if name.strip().lower() == "vendas": vrows = load(SHEETS["VENDAS"], gid)
if metarows and vrows:
    mh = [c.strip().lower() for c in metarows[0]]; vh = [c.strip().lower() for c in vrows[0]]
    ads = {r[mh.index("ad name")].strip() for r in metarows[1:] if "ad name" in mh}
    camps = {r[mh.index("campaign name")].strip() for r in metarows[1:] if "campaign name" in mh}
    sets = {r[mh.index("ad set name")].strip() for r in metarows[1:] if "ad set name" in mh}
    print("\nMETA distinct ads:", len(ads), "camps:", len(camps), "sets:", len(sets))
    for col in vh:
        if col.startswith("utm") or col in ("src", "sck"):
            i = vh.index(col); vals = [r[i].strip() for r in vrows[1:] if len(r) > i and r[i].strip()]
            print(f"MATCH {col}: nonempty={len(vals)} ad={sum(v in ads for v in vals)} camp={sum(v in camps for v in vals)} set={sum(v in sets for v in vals)} sample={collections.Counter(vals).most_common(8)}")
