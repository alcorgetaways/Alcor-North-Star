// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), storage: { from: () => ({ upload: vi.fn() }) } },
}));

import { GateSheet } from "../routes/_authenticated/launches.$launchId";

afterEach(cleanup);

const baseGate = {
  gate_code: "gate_b",
  gate_name: "Gate B",
  status: "ready",
  due_date: "2026-10-30",
  signer_role: "team_member",
  criteria: ["All tasks done"],
  signed_by: null,
  signed_at: null,
  client_approved_at: null,
  approval_file_path: null,
};

function renderSheet(gateId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GateSheet
        gate={{ ...baseGate, id: gateId } as never}
        clientId="c1"
        isFinal={false}
        canSign
        staff={[]}
        onClose={() => undefined}
        invalidateKeys={[]}
      />
    </QueryClientProvider>,
  );
}

it("QA-23 notes typed for one gate never carry over to the next gate", () => {
  const { rerender } = renderSheet("gate-1");
  const notes = screen.getByRole("textbox");
  fireEvent.change(notes, { target: { value: "Signed after call with owner" } });
  expect((notes as HTMLTextAreaElement).value).toBe("Signed after call with owner");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rerender(
    <QueryClientProvider client={qc}>
      <GateSheet
        gate={{ ...baseGate, id: "gate-2", gate_name: "Gate C" } as never}
        clientId="c1"
        isFinal={false}
        canSign
        staff={[]}
        onClose={() => undefined}
        invalidateKeys={[]}
      />
    </QueryClientProvider>,
  );
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
});
