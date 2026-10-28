import { MISSING_TEXT, type MissingReason } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** "—" that always explains itself on hover/focus. */
export function MissingValue({ reason, className }: { reason: MissingReason | string; className?: string }) {
  const text = (MISSING_TEXT as Record<string, string>)[reason] ?? reason;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={text} className={className ?? "cursor-help border-b border-dotted border-muted-foreground/50"}>
            —
          </span>
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
