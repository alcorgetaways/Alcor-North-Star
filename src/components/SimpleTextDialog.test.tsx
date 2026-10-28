// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SimpleTextDialog } from "./SimpleTextDialog";
afterEach(cleanup);
it("QA-21 catches submission rejection and requires an override reason", async () => {
  const submit = vi.fn().mockRejectedValue(new Error("Permission denied"));
  const close = vi.fn();
  render(<SimpleTextDialog open onClose={close} title="Override" description="Existing history remains." confirmLabel="Override and close" placeholder="Required reason" required onSubmit={submit} />);
  const button = screen.getByRole("button", { name: "Override and close" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Audited reason" } });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Permission denied"));
  expect(submit).toHaveBeenCalledWith("Audited reason");
  expect(close).not.toHaveBeenCalled();
  expect((button as HTMLButtonElement).disabled).toBe(false);
});