import re

with open("uploads/1_PO BAHAN PANGAN 19 - 24 APRIL 2026.pdf", "rb") as f:
    import pdfplumber
    pdf = pdfplumber.open(f)
    text = "\n".join(p.extract_text() or "" for p in pdf.pages)

# Splitting strategy: 
# The start of a PO seems to be marked by "No. NPB" or something similar.
# Let's try to split by either "No. NPB" or "Dari :" or "Waktu :"
# Actually, looking for "Waktu :" or "nomor_po" equivalent.
po_blocks = re.split(r"(?=No\.?\s*NPB/|Waktu\s*:)", text)
# Wait, let's just find indices of Waktu:
print(f"Total blocks: {len(po_blocks)}")
for i, block in enumerate(po_blocks):
    if len(block.strip()) > 50:
        print(f"\n--- BLOCK {i} ---")
        print(block[:200])

