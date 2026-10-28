import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function SimpleTextDialog({ open, onClose, title, description, confirmLabel, placeholder, required = false, onSubmit }: {
  open: boolean; onClose: () => void; title: string; description: string; confirmLabel: string; placeholder: string; required?: boolean;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  useEffect(() => { if (!open) setNote(""); }, [open]);
  return <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <Textarea aria-label={placeholder} rows={2} placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
    <ConfirmButton className="w-full" doneLabel="Done" disabled={required && !note.trim()} onConfirm={async () => {
      if (required && !note.trim()) throw new Error("Give a reason before continuing");
      await onSubmit(note.trim());
      setNote(""); onClose();
    }}>{confirmLabel}</ConfirmButton>
  </DialogContent></Dialog>;
}