DROP POLICY IF EXISTS custom_plans_insert ON public.custom_plans;
CREATE POLICY custom_plans_insert ON public.custom_plans FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (is_manager(auth.uid()) OR has_role(auth.uid(), 'bd_manager')));