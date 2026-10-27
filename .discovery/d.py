import collections, sys
sys.path.insert(0,"build"); import build
bf=build.load_bf(); L=bf["leads"]
print("total",len(L),"| meta",sum(x["meta"] for x in L),"| casados",sum(x["hit"] for x in L))
print("por origem:",collections.Counter(x["src"] for x in L).most_common())
sp=collections.Counter(); lp=collections.Counter()
for m in bf["meta"]: sp[m["d"]]+=m["sp"]; lp[m["d"]]+=m["lp"]
lm=collections.Counter(x["d"] for x in L if x["meta"]); lt=collections.Counter(x["d"] for x in L)
for d in sorted(set(sp)|set(lt)): print(f"  {d}: gasto R$ {sp[d]:.2f} · leads pixel {lp[d]:.0f} · leads Meta (planilha) {lm[d]} · leads totais {lt[d]}")
