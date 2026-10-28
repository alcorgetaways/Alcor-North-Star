import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, APP_TAGLINE, propertyWord } from "./constants";
import { monthLabel } from "./kpi";
import type { HotelScorecard } from "./scorecard";

const NAVY: [number, number, number] = [15, 27, 56];
const GOLD: [number, number, number] = [193, 154, 76];
const BAND_RGB: Record<string, [number, number, number]> = {
  green: [22, 138, 96],
  amber: [191, 137, 11],
  red: [190, 42, 42],
};

function fmt(n: number | null | undefined, unit: string | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const base = Number(n).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  if (unit === "%") return `${base}%`;
  if (unit && unit !== "%") return `${base} ${unit}`;
  return base;
}

/** Built-in PDF fonts have no ₹ glyph — print "Rs." instead. */
const pdfText = (s: string) => s.replace(/₹\s?/g, "Rs. ");

export function buildHotelScorecardPdf(
  hotelName: string,
  card: HotelScorecard,
  opts: { clientSafe: boolean; propertyType?: string | null | undefined; clientCode?: string | null | undefined },
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const cover = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, width, pageHeight, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text(pdfText(hotelName), 50, 200, { maxWidth: width - 100 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(...GOLD);
    doc.text(`${APP_NAME} · monthly ${propertyWord(opts.propertyType)} scorecard${opts.clientCode ? ` · ${opts.clientCode}` : ""}`, 50, 240);
    doc.setTextColor(255, 255, 255);
    doc.text(monthLabel(card.month), 50, 264);
    doc.setFontSize(12);
    doc.text("Overall score", 50, 380);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(64);
    const rgb = BAND_RGB[card.band] ?? BAND_RGB["red"]!;
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(card.overall == null ? "—" : `${Math.round(card.overall)}%`, 50, 440);
    if (!opts.clientSafe) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(220, 190, 130);
      doc.text("Internal copy — includes unapproved data", 50, 480);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("Prepared by Alcor Getaways", 50, pageHeight - 50);
  };
  cover();

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("Prepared by Alcor Getaways", 40, pageHeight - 30);
    if (!opts.clientSafe) doc.text("Internal copy — includes unapproved data", width - 40, pageHeight - 30, { align: "right" });
  };

  let first = true;
  for (const p of card.pipelines) {
    if (!first) doc.addPage();
    first = false;
    let y = 70;
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(pdfText(p.name), 40, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GOLD);
    doc.text(
      `${p.status === "approved" ? "Approved" : "Unapproved"} · pipeline score ${p.score == null ? "—" : `${Math.round(p.score)}%`}`,
      40,
      y,
    );
    y += 18;

    autoTable(doc, {
      startY: y,
      head: [["KPI", "Target", "Actual", "Achievement"]],
      body: p.kpis.map((k) => [
        pdfText(k.kpi),
        fmt(k.target, k.unit),
        fmt(k.actual, k.unit),
        k.achievement == null ? "—" : `${Math.round(k.achievement)}%`,
      ]),
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 6 },
      alternateRowStyles: { fillColor: [246, 245, 241] },
      margin: { left: 40, right: 40 },
    });

    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    const reds = p.kpis.filter((k) => k.achievement != null && k.achievement < 70);
    if (reds.length) {
      let ry = lastY + 26;
      const red = BAND_RGB["red"]!;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(red[0], red[1], red[2]);
      doc.text("Recovery plan for red KPIs", 40, ry);
      ry += 16;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      for (const k of reds) {
        const lines = doc.splitTextToSize(
          pdfText(`${k.kpi}: ${k.red_reason || "No reason recorded"}. Corrective action: ${k.corrective_action || "—"}.`),
          width - 90,
        ) as string[];
        for (const line of lines) {
          if (ry > pageHeight - 70) {
            doc.addPage();
            ry = 70;
            footer();
          }
          doc.text(line, 46, ry);
          ry += 13;
        }
        ry += 6;
      }
    }
    footer();
  }

  return doc;
}

export function downloadHotelScorecardPdf(hotelName: string, card: HotelScorecard, clientSafe: boolean, propertyType?: string | null, clientCode?: string | null) {
  const doc = buildHotelScorecardPdf(hotelName, card, { clientSafe, propertyType, clientCode });
  const safe = `${hotelName}-scorecard-${card.month}`.replace(/[^a-z0-9]+/gi, "-");
  doc.save(`${safe}.pdf`);
}
