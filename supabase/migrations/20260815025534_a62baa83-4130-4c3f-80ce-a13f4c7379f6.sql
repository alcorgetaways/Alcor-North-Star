CREATE TABLE public.client_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  client_pipeline_id uuid REFERENCES public.client_pipelines(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  asked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.client_question_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.client_questions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_questions TO authenticated;
GRANT ALL ON public.client_questions TO service_role;
GRANT SELECT, INSERT ON public.client_question_replies TO authenticated;
GRANT ALL ON public.client_question_replies TO service_role;

ALTER TABLE public.client_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_question_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view questions" ON public.client_questions FOR SELECT TO authenticated
  USING (public.my_client_id() = client_id OR public.can_view_client(client_id));

CREATE POLICY "client asks questions" ON public.client_questions FOR INSERT TO authenticated
  WITH CHECK (asked_by = auth.uid() AND (public.my_client_id() = client_id OR public.can_view_client(client_id)));

CREATE POLICY "staff update questions" ON public.client_questions FOR UPDATE TO authenticated
  USING (public.can_view_client(client_id)) WITH CHECK (public.can_view_client(client_id));

CREATE POLICY "view replies" ON public.client_question_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_questions q WHERE q.id = question_id
    AND (public.my_client_id() = q.client_id OR public.can_view_client(q.client_id))));

CREATE POLICY "write replies" ON public.client_question_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.client_questions q WHERE q.id = question_id
    AND (public.my_client_id() = q.client_id OR public.can_view_client(q.client_id))));

CREATE TRIGGER t_client_questions_upd BEFORE UPDATE ON public.client_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_client_questions_client ON public.client_questions(client_id);
CREATE INDEX idx_client_questions_status ON public.client_questions(status);
CREATE INDEX idx_client_question_replies_q ON public.client_question_replies(question_id);