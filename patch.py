
import re

with open('backend/routers/analitik_dapur.py', 'r', encoding='utf-8') as f:
    c = f.read()

query_po_det = '''    pos = (
        db.query(models.PurchaseOrder)
        .filter(
            models.PurchaseOrder.dapur_id == dapur_id,
            models.PurchaseOrder.tanggal_po >= start_date,
            models.PurchaseOrder.tanggal_po <= end_date,
            models.PurchaseOrder.status != models.POStatus.cancelled,
        )
        .order_by(models.PurchaseOrder.tanggal_po)
        .all()
    )

    po_ids = [p.id for p in pos]
    all_details = []
    if po_ids:
        all_details = db.query(models.PODetail).filter(
            models.PODetail.po_id.in_(po_ids)
        ).all()

    details_by_po: dict = {}
    for det in all_details:
        details_by_po.setdefault(det.po_id, []).append(det)'''

query_inv_det = '''    # Query Invoice (with joined PO for PM estimation)
    invoices = (
        db.query(models.Invoice)
        .options(joinedload(models.Invoice.po))
        .filter(
            models.Invoice.dapur_id == dapur_id,
            models.Invoice.tanggal_invoice >= start_date,
            models.Invoice.tanggal_invoice <= end_date,
            models.Invoice.status != models.InvoiceStatus.cancelled,
            models.Invoice.is_draft == False
        )
        .order_by(models.Invoice.tanggal_invoice)
        .all()
    )

    inv_ids = [inv.id for inv in invoices]
    all_details = []
    if inv_ids:
        all_details = db.query(models.InvoiceDetail).options(joinedload(models.InvoiceDetail.item)).filter(
            models.InvoiceDetail.invoice_id.in_(inv_ids)
        ).all()

    pos = [inv for inv in invoices] # Alias invoices as pos for minimal downstream changes
    details_by_po: dict = {}
    for det in all_details:
        details_by_po.setdefault(det.invoice_id, []).append(det)'''

if query_po_det in c:
    c = c.replace(query_po_det, query_inv_det)
    with open('backend/routers/analitik_dapur.py', 'w', encoding='utf-8') as f:
        f.write(c)
    print('Patched successfully')
else:
    print('Failed to find exact block')


