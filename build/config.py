# -*- coding: utf-8 -*-
"""
Configuração do cliente — Núbia Oliveira · A Próxima Carreira (Sala Secreta, sigla SS-OUT26).

Este é o ÚNICO arquivo que precisa ser editado para colocar o funil de um
cliente novo no ar (o build se recusa a rodar enquanto algum marcador de
texto do template continuar aqui).
Ordem completa: "CHECKLIST DE NOVO CLIENTE" no topo do CLAUDE.md.

Depois de editar, teste localmente:

    python build/build.py --meta-file meta.csv --sales-file sales.csv --out dist/index.html

`build/config.example.py` é a cópia intacta deste modelo — mantenha-o
sem preencher, para restaurar o config.py se precisar começar do zero.
"""
from __future__ import annotations

# ==========================================================================
# 1) PLANILHA(S) DO CLIENTE (Google Sheets)
# ==========================================================================
# SPREADSHEET_ID: o trecho entre /d/ e /edit na URL da planilha
#   (https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit#gid=...)
# GID_META / GID_SALES: o número depois de "gid=" na URL de cada aba.
# A planilha precisa estar com o link público em modo "Qualquer pessoa com
# o link pode visualizar" (o build lê via export CSV, SOMENTE LEITURA).
SPREADSHEET_ID = "15yljVveX8oiGL-JFIAFag2z_RREBO2TSj0C3KZLbTB0"  # planilha "Meta Ads"
# Opcional: se a lista de Compradores estiver em OUTRA planilha, coloque o ID
# dela aqui. Vazio = Compradores na mesma planilha do Meta Ads (padrão).
# Núbia: Vendas fica em planilha separada (abas Leads · Vendas · Pesquisa).
SPREADSHEET_ID_SALES = "1mniLIjov9tc4jlPpXKN3l_aOYfeOFCmC73apABI7nZY"
GID_META = "0"            # aba "Meta Ads"
GID_SALES = "796495406"   # aba "Vendas" (NÃO usar "Leads" nem "Pesquisa")

# ==========================================================================
# 2) REGRAS DE NEGÓCIO
# ==========================================================================
# Fator de imposto aplicado sobre o gasto do Meta Ads quando o toggle
# "Imposto Meta" estiver ligado. Use 1.0 se o cliente não tiver imposto.
TAX_FACTOR = 1.13806   # +13,806%

# Produto principal do funil (base de Vendas/CAC/ConvCHK/Ticket). Casamento
# por PREFIXO sobre o nome NORMALIZADO (sem acento, minúsculas) da coluna
# Produto da planilha de Compradores — escreva sem acento e em minúsculas.
# Produto na planilha: "Sala Secreta - A Próxima Carreira".
MAIN_PRODUCT_PREFIX = "sala secreta - a proxima carreira"

# Qual coluna UTM da planilha de Compradores carrega o Ad Name do Meta:
# "utm_content", "utm_term" ou "utm_medium". Depende do parametrizador de URL
# dos anúncios do cliente — CONFIRA nos dados antes de assumir: a coluna que
# não carrega o anúncio costuma trazer o posicionamento (Instagram_Feed/Stories),
# e casar pela coluna errada zera as atribuições.
# Núbia: utm_content = Ad Name (ex.: EST17); utm_term = posicionamento (Instagram_Stories).
AD_UTM_COLUMN = "utm_content"

# A planilha de Compradores tem uma coluna de status de pagamento confiável?
# SIM -> False (o build filtra por is_paid()). NÃO (toda linha já é uma compra
# concretizada) -> True (conta todas as linhas como venda paga).
# Núbia: a aba Vendas não tem coluna Status — toda linha é venda concretizada.
COUNT_ALL_AS_PAID = True

# ==========================================================================
# 3) RÓTULOS EXIBIDOS NA INTERFACE
# ==========================================================================
CLIENT_NAME = "Núbia Oliveira"
CLIENT_SUB = "Sala Secreta"
TAX_LABEL = "Imposto Meta ×1,13806"
MAIN_PRODUCT = "A Próxima Carreira"

# ==========================================================================
# 4) METAS (aba Relatórios) — código de cor de CAC/ROAS
# ==========================================================================
#   • ROAS: quanto MAIOR, melhor  -> desempenho = roas / ROAS_TARGET
#   • CAC : quanto MENOR, melhor  -> desempenho = CAC_TARGET / cac
# Faixas (sobre o desempenho): <REPORT_BAND_LOW vermelho · até 0,99 amarelo ·
#   até REPORT_BAND_HIGH verde · acima disso azul-ciano.
# CAC alvo em R$ por venda do produto principal
CAC_TARGET = 116.0
# ROAS alvo (Faturamento / Gasto) — não definido pelo cliente; 0.0 = sem código de cor no ROAS
ROAS_TARGET = 0.0
REPORT_BAND_LOW = 0.70
REPORT_BAND_HIGH = 1.30

# ==========================================================================
# 5) IA INSIGHTS (Cloudflare Worker) — ver SETUP-IA.md
# ==========================================================================
# URL pública do Worker (não é secreta). Vazio = aba IA Insights indisponível.
# Preencher depois de publicar o Worker (checklist do CLAUDE.md).
# Worker ainda não publicado (SETUP-IA.md) — aba IA Insights desativada até lá.
IA_WORKER_URL = ""
