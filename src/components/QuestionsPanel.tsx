import { isUuid, questionPipelineOptions } from "@/lib/form-rules";
import { PIPELINE_TITLES } from "@/lib/pipeline-kpis";
import { demoIn } from "@/lib/demo";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircleQuestion, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type PipelineOption = { id: string; name: string; clientPipelineId?: string | null };

type QuestionRow = {
  id: string;
  client_id: string;
  pipeline_id: string | null;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  last_activity_at: string;
  asked_by: string | null;
  clients: { hotel_name: string } | null;
  pipelines: { name: string } | null;
  client_question_replies: Array<{
    id: string;
    body: string;
    created_at: string;
    author_id: string | null;
  }>;
};

export function QuestionsPanel({
  clientId,
  pipelines = [],
  canAsk = false,
  showHotel = false,
  pipelineId,
}: {
  clientId?: string | undefined;
  pipelines?: PipelineOption[];
  canAsk?: boolean;
  showHotel?: boolean;
  pipelineId?: string | undefined;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pipeline, setPipeline] = useState<string>(pipelineId ?? pipelines[0]?.id ?? "");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const key = ["client-questions", clientId ?? "all", pipelineId ?? "all"];

  const { data: questions = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase
        .from("client_questions")
        .select(
          "id, client_id, pipeline_id, subject, body, status, created_at, last_activity_at, asked_by, clients(hotel_name), pipelines(name), client_question_replies(id, body, created_at, author_id)",
        )
        .order("last_activity_at", { ascending: false })
        .limit(100);
      if (clientId) q = q.eq("client_id", clientId);
      else q = q.not("client_id", "in", demoIn());
      if (pipelineId) q = q.eq("pipeline_id", pipelineId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as QuestionRow[];
    },
  });

  const { data: names = {} } = useQuery({
    queryKey: ["question-author-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name])) as Record<
        string,
        string
      >;
    },
  });

  const ask = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Missing hotel");
      if (!subject.trim() || !body.trim()) throw new Error("Add a subject and your question");
      const match = pipelines.find((p) => p.id === pipeline);
      const { error } = await supabase.from("client_questions").insert({
        client_id: clientId,
        pipeline_id: isUuid(pipeline) ? pipeline : null,
        client_pipeline_id: match?.clientPipelineId ?? null,
        subject: subject.trim(),
        body: body.trim(),
        asked_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubject("");
      setBody("");
      toast.success("Question sent to your Alcor team");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reply = useMutation({
    mutationFn: async (questionId: string) => {
      const text = (replies[questionId] ?? "").trim();
      if (!text) throw new Error("Write a reply first");
      const { error } = await supabase
        .from("client_question_replies")
        .insert({ question_id: questionId, body: text, author_id: user?.id ?? null });
      if (error) throw error;
      await supabase
        .from("client_questions")
        .update({ last_activity_at: new Date().toISOString(), status: canAsk ? "open" : "answered" })
        .eq("id", questionId);
    },
    onSuccess: (_d, questionId) => {
      setReplies((r) => ({ ...r, [questionId]: "" }));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("client_questions").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-surface">
      <div className="flex items-center gap-2 border-b border-border/70 px-5 py-4">
        <MessageCircleQuestion className="h-4 w-4 text-gold" />
        <h2 className="text-section-title font-semibold">Questions & answers</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {questions.filter((q) => q.status === "open").length} open
        </span>
      </div>

      {canAsk ? (
        <div className="space-y-3 border-b border-border/70 bg-muted/30 px-5 py-4">
          {pipelines.length ? (
            <div className="flex flex-wrap gap-2">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPipeline(p.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    pipeline === p.id
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : null}
          <Input
            placeholder="Subject — e.g. Why did cost per lead rise?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Textarea
            placeholder="Ask your pipeline manager anything about this service."
            value={body}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button size="sm" onClick={() => ask.mutate()} disabled={ask.isPending}>
            <Send className="mr-2 h-3.5 w-3.5" /> Send question
          </Button>
        </div>
      ) : null}

      <div className="divide-y divide-border/70">
        {questions.map((q) => (
          <div key={q.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{q.subject}</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-label capitalize ${
                  q.status === "open"
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-border text-muted-foreground"
                }`}
              >
                {q.status}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {showHotel && q.clients?.hotel_name ? `${q.clients.hotel_name} · ` : ""}
                {q.pipelines?.name ?? "General"} ·{" "}
                {new Date(q.created_at).toLocaleDateString("en-IN")}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{q.body}</p>

            {q.client_question_replies?.length ? (
              <div className="mt-3 space-y-2 border-l-2 border-gold/40 pl-3">
                {[...q.client_question_replies]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((r) => (
                    <div key={r.id} className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {(r.author_id ? names[r.author_id] : null) ?? "Alcor team"} ·{" "}
                        {new Date(r.created_at).toLocaleDateString("en-IN")}
                      </span>
                      <p>{r.body}</p>
                    </div>
                  ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder={canAsk ? "Add a follow-up…" : "Reply to the hotel…"}
                value={replies[q.id] ?? ""}
                onChange={(e) => setReplies((s) => ({ ...s, [q.id]: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={reply.isPending} onClick={() => reply.mutate(q.id)}>
                  Send
                </Button>
                {!canAsk ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setStatus.mutate({
                        id: q.id,
                        status: q.status === "closed" ? "open" : "closed",
                      })
                    }
                  >
                    {q.status === "closed" ? "Reopen" : "Close"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {questions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {canAsk
              ? "No questions yet — ask your Alcor team anything above."
              : "No client questions yet."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Owner-side panel: pipeline options come from the hotel's own client_pipelines (real uuids, QA-01). */
export function OwnerQuestionsPanel({ clientId, onlyCodes }: { clientId: string; onlyCodes?: Set<string> }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["owner-question-pipelines", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_pipelines")
        .select("id, pipeline_id, pipelines(code, name)")
        .eq("client_id", clientId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; pipeline_id: string; pipelines: { code: string; name: string } | null }>;
    },
  });
  const options = questionPipelineOptions(rows, PIPELINE_TITLES, onlyCodes);
  return <QuestionsPanel key={options.map((o) => o.id).join(",")} clientId={clientId} pipelines={options} canAsk />;
}
