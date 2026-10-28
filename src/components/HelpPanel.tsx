import { Info } from "lucide-react";

/** Plain-English explainer shown at the top of a working screen. */
export function HelpPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="card-surface border-primary/25 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-small font-semibold text-foreground">
        <Info className="h-4 w-4 text-primary" /> {title}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-small text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
