import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, APP_TAGLINE } from "./constants";
import { monthLabel, pct } from "./kpi";
import { propertyWord } from "./constants";
import type { CombinedReport } from "./combined-report";

const NAVY: [number, number, number] = [15, 27, 56];
const GOLD: [number, number, number] = [193, 154, 76];

export type ReportPdfData = {
  hotelName: string;
  propertyType?: string | null | undefined;
  clientCode?: string | null | undefined;
  pipelineName: string;
  month: string;
  score: number | null;
  kpis: Array<{ name: string; target: string; actual: string; achievement: number | null }>;
  mainKpis?: Array<{ name: string; actual: string }> | undefined;
  highlights: string[];
  workItems: string[];
  challenges?: string | null;
  nextMonthAction?: string | null;
  managerComments?: string | null;
  clientSafe?: boolean;
};

/** The built-in PDF fonts have no ₹ glyph — print "Rs." instead. */
function pdfText(s: string): string {
  return s.replace(/₹\s?/g, "Rs. ");
}

export function buildReportPdf(data: ReportPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, width, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.clientSafe ? "MY GROWTH" : APP_NAME, 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text(APP_TAGLINE, 40, 62);
  doc.text(`Monthly ${propertyWord(data.propertyType)} report`, width - 40, 62, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(pdfText(`${data.clientCode ? `${data.clientCode} · ` : ""}${data.hotelName} · ${data.pipelineName}`), 40, 82);
  doc.text(monthLabel(data.month), width - 40, 82, { align: "right" });

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("North Star Score", 40, 136);
  doc.setFontSize(30);
  doc.setTextColor(...GOLD);
  doc.text(pct(data.score), 40, 168);

  let tableStart = 192;
  if (data.mainKpis?.length) {
    doc.setFontSize(12); doc.text("Main KPIs", 40, tableStart);
    autoTable(doc, { startY: tableStart + 12, head: [["Main KPI", "Actual"]], body: data.mainKpis.map((k) => [pdfText(k.name), pdfText(k.actual)]), headStyles: { fillColor: NAVY }, margin: { left: 40, right: 40 } });
    tableStart = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  }
  doc.setFontSize(12); doc.text("All KPIs", 40, tableStart - 8);
  autoTable(doc, {
    startY: tableStart,
    head: [["KPI", "Target", "Actual", "Achievement"]],
    body: data.kpis.map((k) => [pdfText(k.name), pdfText(k.target), pdfText(k.actual), pct(k.achievement)]),
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 6 },
    alternateRowStyles: { fillColor: [246, 245, 241] },
    margin: { left: 40, right: 40 },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;

  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    if (y > 720) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(pdfText(title), 40, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    lines.forEach((line) => {
      const wrapped = doc.splitTextToSize(pdfText(`• ${line}`), width - 90) as string[];
      wrapped.forEach((w) => {
        if (y > 780) {
          doc.addPage();
          y = 60;
        }
        doc.text(w, 46, y);
        y += 14;
      });
    });
    y += 14;
  };

  section("Highlights", data.highlights.filter(Boolean));
  section("Work completed", data.workItems.filter(Boolean));
  // Client copies never carry internal challenges or management comments.
  if (!data.clientSafe && data.challenges) section("Challenges", [data.challenges]);
  if (data.nextMonthAction) section("Next month's focus", [data.nextMonthAction]);
  if (!data.clientSafe && data.managerComments)
    section("Management comments", [data.managerComments]);

  return doc;
}

export function downloadReportPdf(data: ReportPdfData) {
  const doc = buildReportPdf(data);
  const safe = `${data.hotelName}-${data.pipelineName}-${data.month}`.replace(/[^a-z0-9]+/gi, "-");
  doc.save(`${safe}.pdf`);
}

export function downloadCombinedReportPdf(report: CombinedReport) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;
  doc.setFontSize(18); doc.text(pdfText(`MY GROWTH — ${report.hotel_name}`), 40, y);
  y += 24; doc.setFontSize(12); doc.text(monthLabel(report.month), 40, y); y += 30;
  for (const section of report.sections) {
    if (y > 650) { doc.addPage(); y = 48; }
    doc.setFontSize(14); doc.text(pdfText(section.pipeline), 40, y); y += 15;
    if (section.main_kpis?.length) {
      autoTable(doc, { startY: y, head: [["Main KPIs", "Value"]], body: section.main_kpis.map((k) => [k.name, k.value ?? "Not tracked yet"]), headStyles: { fillColor: NAVY }, styles: { fontSize: 9 }, margin: { left: 40, right: 40 } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
    }
    doc.setFontSize(11); doc.text("All KPIs",40,y); y+=12;
    autoTable(doc, { startY: y, head: [["KPI", "Target", "Actual", "Baseline", "Achievement"]], body: section.kpis.map((k) => [k.name, k.target ?? "—", k.text_value ?? k.actual ?? "—", k.baseline ?? "—", pct(k.achievement)]), headStyles: { fillColor: NAVY }, styles: { fontSize: 9 }, margin: { left: 40, right: 40 } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
    for (const source of section.source_values) {
      autoTable(doc, { startY: y, head: [[`${source.source} · approved metric`, "Value"]], body: Object.entries(source.values).map(([k,v]) => [k.replaceAll("_", " "), v ?? "Not available"]), headStyles: { fillColor: NAVY }, styles: { fontSize: 9 }, margin: { left: 40, right: 40 } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
    }
    doc.setFontSize(10);
    for (const line of [...section.highlights, ...section.work_items, ...(section.next_month_action ? [`Next month: ${section.next_month_action}`] : [])]) {
      for (const wrapped of doc.splitTextToSize(pdfText(line), 510) as string[]) { if (y > 770) { doc.addPage(); y = 48; } doc.text(wrapped, 40, y); y += 14; }
    }
    y += 25;
  }
  doc.save(`${report.hotel_name}-${report.month}-combined.pdf`.replace(/[^a-z0-9.]+/gi, "-"));
}
