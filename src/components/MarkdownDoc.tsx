import React from "react";
import { DataTable } from "@/components/DataTable";

/** Renders bold spans inside a line of markdown text. */
function inline(text: string, key: number | string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableLine = (l: string) => l.startsWith("|");
const isDivider = (l: string) => /^\|[\s:|-]+\|?$/.test(l);

/** Lightweight markdown renderer: headings, lists, tables and bold text. */
export function MarkdownDoc({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
        {list.map((li, i) => (
          <li key={i}>{inline(li, i)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((l) => !isDivider(l)).map(splitRow);
    const [head, ...body] = rows;
    out.push(
      <DataTable
        key={`tb-${out.length}`}
        rows={body}
        rowKey={(_, index) => String(index)}
        columns={(head ?? []).map((heading, index) => ({
          key: String(index),
          header: inline(heading, index),
          render: (row: string[]) =>
            row[index]
              ? inline(row[index], index)
              : <span className="text-muted-foreground/50">—</span>,
        }))}
      />,
    );
    table = [];
  };

  const flush = () => {
    flushList();
    flushTable();
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) {
      flush();
      return;
    }
    if (isTableLine(line)) {
      flushList();
      table.push(line);
      return;
    }
    flushTable();
    if (line.startsWith("### ")) {
      flushList();
      out.push(
        <h3 key={out.length} className="pt-2 text-card-title font-medium text-foreground">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(
        <h2 key={out.length} className="mt-8 border-b border-border/70 pb-2 text-section-title font-semibold text-foreground">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      flushList();
      out.push(
        <h1 key={out.length} className="mt-6 text-section-title font-semibold text-foreground">
          {line.slice(2)}
        </h1>,
      );
    } else if (/^([-*]|\d+\.)\s/.test(line)) {
      list.push(line.replace(/^([-*]|\d+\.)\s/, ""));
    } else {
      flushList();
      out.push(
        <p key={out.length} className="text-sm leading-relaxed text-muted-foreground">
          {inline(line, 0)}
        </p>,
      );
    }
  });
  flush();
  return <div className="space-y-3">{out}</div>;
}

export type DocChapter = { title: string; body: string };

/** Splits a markdown doc at top-level `# ` headings into navigable chapters. */
export function splitChapters(source: string): DocChapter[] {
  const lines = source.split("\n");
  const chapters: DocChapter[] = [];
  let title = "Overview";
  let buf: string[] = [];
  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (buf.join("").trim()) chapters.push({ title, body: buf.join("\n") });
      title = line.slice(2).trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.join("").trim()) chapters.push({ title, body: buf.join("\n") });
  return chapters;
}
