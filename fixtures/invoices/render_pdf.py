"""Render the HLC-129884 test invoice as a PDF.

Same numbers as HLC-129884.txt and HLC-129884.ubl.xml, laid out the way a cloud vendor's billing
system prints one. Edit INVOICE below and re-run to produce variants (over-bill, tax, duplicate).

    pip install reportlab
    python fixtures/invoices/render_pdf.py
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    Paragraph,
    PageTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).with_name("HLC-129884.pdf")

INK = colors.HexColor("#16202c")
MUTED = colors.HexColor("#5b6b7c")
RULE = colors.HexColor("#c3ccd6")
BAND = colors.HexColor("#eef2f6")
ACCENT = colors.HexColor("#1f4e79")

INVOICE = {
    "number": "HLC-129884",
    "issue_date": "2026-08-06",
    "due_date": "2026-08-21",
    "type_code": "380 (commercial invoice)",
    "currency": "USD",
    "terms": "Net 15",
    "account": "NW-PROD",
    "po": "None - usage billed to account",
    "period": "2026-07-01 to 2026-07-31",
    "prior": "HLC-125391 (paid 2026-07-15)",
    "seller": [
        "Harborline Cloud, Inc.",
        "1100 Dexter Avenue N, Suite 500",
        "Seattle, WA 98109, United States",
        "EIN 88-1420937",
        "invoices@harborline-cloud.test  |  +1 206 555 0142",
    ],
    "buyer": [
        "Northwind Systems, Inc.",
        "Suite 400, 210 Harbor Street",
        "Boston, MA 02210, United States",
        "EIN 47-2019338",
        "Attn: Accounts Payable, ap@northwind.test",
    ],
    "service_location": [
        "Account NW-PROD",
        "Regions us-west-2 and us-east-1",
        "Usage period 1-31 July 2026",
    ],
    # description, sub-description, quantity, unit code, unit price
    "lines": [
        ("Compute - general purpose (c3.large)", "240 vCPU x 744 hours, 1-31 July 2026", 178560, "HUR", 0.064),
        ("Compute - memory optimised (r3.xlarge)", "30 vCPU x 744 hours, 1-31 July 2026", 22320, "HUR", 0.091),
        ("Block storage, SSD (gp2)", "GB-month, average provisioned", 42000, "E34", 0.08),
        ("Object storage, standard class", "GB-month, average stored", 96000, "E34", 0.021),
        ("Managed PostgreSQL 16 (db.m5.large)", "2 instances x 744 hours", 1488, "HUR", 0.52),
        ("Data transfer out to internet", "GB egress, after 100 GB monthly allowance", 14016, "E34", 0.08),
        ("Support plan - Business", "1-31 July 2026", 1, "MON", 750.0),
    ],
    "tax_rate": 0.0,
    "tax_note": "Exempt (category E): resale certificate MA-RS-44718 on file",
    "words": "Twenty-one thousand four hundred eighty and 00/100 US dollars",
    "note": (
        "Compute is above the June run rate: reprocessing after the 17-18 June incident ran into "
        "the first week of July. Detail by resource is in the usage report for account NW-PROD, "
        "issued 2026-08-01."
    ),
    "remit": [
        ("Beneficiary", "Harborline Cloud, Inc."),
        ("Bank", "Cascade Pacific Bank, Seattle, WA"),
        ("ABA / routing", "125181286 (ACH and domestic wire)"),
        ("Account", "0034118826"),
        ("SWIFT / BIC", "CPBKUS6SXXX"),
        ("Remittance advice", "ar@harborline-cloud.test"),
    ],
    "remit_warning": (
        "Our remittance details have not changed. We will never ask you to change them by email; "
        "call +1 206 555 0142 and ask for accounts receivable to confirm any request that claims "
        "otherwise."
    ),
    "terms_text": (
        "Payable within 15 days of the invoice date. Overdue amounts carry interest at 1.5% per "
        "month or the maximum permitted by law, whichever is lower. Disputes must be raised within "
        "10 days of the invoice date; undisputed amounts remain payable. Fees are exclusive of "
        "taxes; where an exemption certificate is on file no tax is charged, and the customer "
        "remains responsible for any tax later assessed. Governed by the Harborline Cloud Terms of "
        "Service accepted for account NW-PROD."
    ),
}


def money(value):
    return f"{value:,.2f}"


def line_amounts(inv):
    """Line totals in cents, so the PDF cannot drift from the text and XML by a rounding cent."""
    return [round(qty * price * 100) for _, _, qty, _, price in inv["lines"]]


def style(name, size=8.5, leading=None, colour=INK, **kw):
    return ParagraphStyle(name, fontName="Helvetica", fontSize=size, leading=leading or size + 2.1, textColor=colour, **kw)


BODY = style("body")
SMALL = style("small", 7.6, colour=MUTED)
LABEL = style("label", 7.2, colour=MUTED)
BOLD = style("bold", 8.5)
BOLD.fontName = "Helvetica-Bold"
HEAD = style("head", 9.5, colour=ACCENT)
HEAD.fontName = "Helvetica-Bold"
RIGHT = style("right", 8.5, alignment=TA_RIGHT)
CELL = style("cell", 8.3, leading=9.8)
CELL_SUB = style("cellsub", 7.2, colour=MUTED)


def header(canvas, doc):
    """The masthead: vendor block left, INVOICE and number right, over a rule."""
    canvas.saveState()
    x, top = doc.leftMargin, letter[1] - 46

    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 15)
    canvas.drawString(x, top, INVOICE["seller"][0])
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    for i, row in enumerate(INVOICE["seller"][1:]):
        canvas.drawString(x, top - 15 - i * 10.5, row)

    right = letter[0] - doc.rightMargin
    canvas.setFillColor(ACCENT)
    canvas.setFont("Helvetica-Bold", 23)
    canvas.drawRightString(right, top - 2, "INVOICE")
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawRightString(right, top - 19, INVOICE["number"])
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(right, top - 32, f"Issued {INVOICE['issue_date']}")
    canvas.drawRightString(right, top - 43, f"Due {INVOICE['due_date']}")

    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.1)
    canvas.line(x, top - 60, right, top - 60)

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(x, 36, f"{INVOICE['seller'][0]}  |  Invoice {INVOICE['number']}  |  {INVOICE['issue_date']}")
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(x, 46, right, 46)
    canvas.restoreState()


class NumberedCanvas(pdfcanvas.Canvas):
    """Defers every page until the end, so the footer can say "Page 1 of 2" and not just "Page 1"."""

    def __init__(self, *args, **kw):
        super().__init__(*args, **kw)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        count = len(self._pages)
        for number, state in enumerate(self._pages, start=1):
            self.__dict__.update(state)
            self.setFont("Helvetica", 7.5)
            self.setFillColor(MUTED)
            self.drawRightString(letter[0] - 54, 36, f"Page {number} of {count}")
            super().showPage()
        super().save()


def meta_table(inv):
    pairs = [
        ("Invoice number", inv["number"], "Customer account", inv["account"]),
        ("Invoice date", inv["issue_date"], "Purchase order", inv["po"]),
        ("Invoice type", inv["type_code"], "Service period", inv["period"]),
        ("Currency", inv["currency"], "Payment terms", inv["terms"]),
        ("Due date", inv["due_date"], "Prior invoice", inv["prior"]),
    ]
    rows = [
        [Paragraph(a, LABEL), Paragraph(b, BODY), Paragraph(c, LABEL), Paragraph(d, BODY)]
        for a, b, c, d in pairs
    ]
    t = Table(rows, colWidths=[1.05 * inch, 1.85 * inch, 1.15 * inch, 2.45 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def parties_table(inv):
    def block(title, rows, emphasise_first):
        out = [Paragraph(title, LABEL)]
        for i, row in enumerate(rows):
            out.append(Paragraph(row, BOLD if (i == 0 and emphasise_first) else BODY))
        return out

    left = block("BILL TO", inv["buyer"], True)
    right = block("SERVICE LOCATION", inv["service_location"], False)
    rows = max(len(left), len(right))
    left += [Paragraph("", BODY)] * (rows - len(left))
    right += [Paragraph("", BODY)] * (rows - len(right))

    t = Table(list(zip(left, right)), colWidths=[3.6 * inch, 2.9 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def lines_table(inv, amounts):
    head = ["#", "Description", "Quantity", "Unit", "Unit price", "Amount"]
    rows = [[Paragraph(f"<b>{h}</b>", CELL if i < 2 else RIGHT if i > 1 else CELL) for i, h in enumerate(head)]]
    rows[0][2] = Paragraph("<b>Quantity</b>", RIGHT)
    rows[0][4] = Paragraph("<b>Unit price</b>", RIGHT)
    rows[0][5] = Paragraph("<b>Amount</b>", RIGHT)

    for i, ((desc, sub, qty, unit, price), cents) in enumerate(zip(inv["lines"], amounts), start=1):
        rows.append([
            Paragraph(str(i), CELL),
            Paragraph(f"{desc}<br/><font size=7.2 color='#5b6b7c'>{sub}</font>", CELL),
            Paragraph(money(qty), RIGHT),
            Paragraph(unit, CELL),
            Paragraph(f"{price:,.6f}", RIGHT),
            Paragraph(money(cents / 100), RIGHT),
        ])

    t = Table(rows, colWidths=[0.28 * inch, 3.02 * inch, 0.95 * inch, 0.42 * inch, 0.88 * inch, 0.95 * inch], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor("#e4e9ee")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def totals_table(inv, amounts):
    usage = sum(amounts[:-1])
    support = amounts[-1]
    net = usage + support
    tax = round(net * inv["tax_rate"])
    total = net + tax
    rate = f"{inv['tax_rate'] * 100:.2f}"

    rows = [
        ("Subtotal, usage", money(usage / 100), False),
        ("Subtotal, support", money(support / 100), False),
        ("Taxable amount", money(net / 100), False),
        (f"Sales tax @ {rate}%", money(tax / 100), False),
        ("TOTAL DUE " + inv["currency"], money(total / 100), True),
    ]
    data = [
        [Paragraph(label, BOLD if strong else BODY), Paragraph(value, RIGHT if not strong else RIGHT)]
        for label, value, strong in rows
    ]
    data[-1][1] = Paragraph(f"<b>{rows[-1][1]}</b>", RIGHT)

    t = Table(data, colWidths=[1.85 * inch, 1.0 * inch])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
        ("TOPPADDING", (0, -1), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t, total


def remit_table(inv):
    rows = [[Paragraph(k, LABEL), Paragraph(v, BODY)] for k, v in inv["remit"]]
    t = Table(rows, colWidths=[1.1 * inch, 2.3 * inch])
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 0.4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def build(inv, out=OUT):
    amounts = line_amounts(inv)
    doc = BaseDocTemplate(
        str(out),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=100,
        bottomMargin=40,
        title=f"Invoice {inv['number']} - {inv['seller'][0]}",
        author=inv["seller"][0],
        subject=f"Invoice {inv['number']} for service period {inv['period']} (test fixture, fictional parties)",
        creator="Harborline Cloud billing",
        keywords="invoice, test fixture, EN 16931, UBL 2.1, fictional",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body", showBoundary=0)
    doc.addPageTemplates([PageTemplate(id="invoice", frames=[frame], onPage=header)])

    story = [
        meta_table(inv),
        Spacer(1, 10),
        parties_table(inv),
        Spacer(1, 11),
        lines_table(inv, amounts),
        Spacer(1, 8),
    ]

    totals, total = totals_table(inv, amounts)
    # The tax note and the amount in words sit beside the totals, where the totals column leaves room.
    left_of_totals = [
        Paragraph(inv["tax_note"], SMALL),
        Spacer(1, 6),
        Paragraph(f"Amount in words: {inv['words']}.", SMALL),
    ]
    holder = Table(
        [[left_of_totals, totals]],
        colWidths=[3.6 * inch, 2.9 * inch],
    )
    holder.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story += [holder, Spacer(1, 12)]

    story.append(KeepTogether([Paragraph("NOTES", HEAD), Spacer(1, 3), Paragraph(inv["note"], SMALL)]))
    story.append(Spacer(1, 10))

    # Payment box on the left, terms on the right: how an invoice actually uses the foot of the page.
    remit_block = [
        Paragraph("REMITTANCE", HEAD),
        Spacer(1, 3),
        Paragraph(f"Pay by ACH or wire in {inv['currency']}, quoting invoice number {inv['number']}.", BODY),
        Spacer(1, 4),
        remit_table(inv),
        Spacer(1, 4),
        Paragraph(inv["remit_warning"], SMALL),
    ]
    terms_block = [Paragraph("TERMS", HEAD), Spacer(1, 3), Paragraph(inv["terms_text"], SMALL)]
    foot = Table([[remit_block, terms_block]], colWidths=[3.6 * inch, 2.9 * inch])
    foot.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(KeepTogether(foot))

    doc.build(story, canvasmaker=NumberedCanvas)
    return out, total


if __name__ == "__main__":
    path, total = build(INVOICE)
    print(f"{path}  total {total / 100:,.2f} {INVOICE['currency']}")
