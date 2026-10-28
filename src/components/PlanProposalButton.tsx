import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accountManagerContact, generateAndSaveProposal, type ProposalData } from "@/lib/proposal-pdf";

export type PlanForProposal = Omit<ProposalData, "clientId" | "hotelName" | "contact" | "validUntil" | "addOns">;

/** Plans page: BD/management pick the client, then the proposal is generated and saved to that client's documents. */
export function PlanProposalButton({ plan }: { plan: PlanForProposal }) {
  const { user, roles } = useAuth();
  const allowed = roles.some((r) => ["admin", "management", "bd_manager"].includes(r));
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const clients = useQuery({
    queryKey: ["proposal-clients"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, client_code, hotel_name, property_type").eq("is_test", false).order("hotel_name");
      if (error) throw error;
      return data;
    },
  });
  if (!allowed) return null;

  async function go() {
    const c = clients.data?.find((x) => x.id === clientId);
    if (!c) return;
    setBusy(true);
    try {
      const { data: addons } = await supabase.from("addons_catalogue").select("name, price_type, price_inr, billing").eq("active", true);
      const valid = new Date();
      valid.setUTCDate(valid.getUTCDate() + 30);
      await generateAndSaveProposal({
        ...plan,
        clientId: c.id,
        hotelName: c.hotel_name,
        propertyType: c.property_type,
        clientCode: c.client_code,
        addOns: (addons ?? []).map((a) => ({
          name: a.name,
          price: a.price_type === "vendor" ? "Vendor-priced, paid directly to the vendor"
            : `${a.price_type === "from" ? "From " : ""}Rs. ${Number(a.price_inr ?? 0).toLocaleString("en-IN")}${a.billing === "one_time" ? " one-time" : ""}`,
        })),
        validUntil: valid.toISOString().slice(0, 10),
        contact: await accountManagerContact(c.id),
      }, user?.id);
      toast.success(`Proposal saved to ${c.hotel_name}'s documents`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the proposal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileText className="mr-1.5 h-3.5 w-3.5" />Proposal PDF</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Proposal — {plan.planName}</DialogTitle>
            <DialogDescription>Choose the hotel. The PDF downloads and a copy is saved to its documents. The contact shown is the hotel's Account Manager.</DialogDescription>
          </DialogHeader>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder={clients.isLoading ? "Loading…" : "Choose hotel"} /></SelectTrigger>
            <SelectContent>{(clients.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.hotel_name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!clientId || busy} onClick={go}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Generate</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
