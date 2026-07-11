import re

text = """
1. BERAS 150 KG
2. TELUR AYAM 220 KG
3. CABAI MERAH 4 KG
4 KECAP 2 DRIGEN
5 BAWANG MERAH KUPAS 3 KG
8 MINYAK GORENG 60 LTR
15 TAHU 3.200 PCS
1 BERAS 200 KG
2 AYAM DADA FILLET 220 KG
8 SAOS TOMAT SSACHET 3.100 PCS
"""

pattern = re.compile(r"^\d+\.?\s+(.+?)\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s+([A-Za-z]+)$")
for line in text.strip().split('\n'):
    m = pattern.match(line.strip())
    if m:
        print(f"MATCH: Name='{m.group(1)}', Qty='{m.group(2)}', Unit='{m.group(3)}'")
    else:
        print(f"NO MATCH: {line}")
