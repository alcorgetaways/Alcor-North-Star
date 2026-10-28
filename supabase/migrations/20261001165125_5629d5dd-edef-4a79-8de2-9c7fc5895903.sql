DROP POLICY "pipelines read" ON public.pipelines;
CREATE POLICY "pipelines read" ON public.pipelines FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.my_client_id() IS NOT NULL);
DROP POLICY "kpidef read" ON public.kpi_definitions;
CREATE POLICY "kpidef read" ON public.kpi_definitions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.my_client_id() IS NOT NULL);
DROP POLICY plans_read ON public.plans;
CREATE POLICY plans_read ON public.plans FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.my_client_id() IS NOT NULL);
DROP POLICY modules_read ON public.launch_modules;
CREATE POLICY modules_read ON public.launch_modules FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.my_client_id() IS NOT NULL);
DROP POLICY pm_read ON public.plan_modules;
CREATE POLICY pm_read ON public.plan_modules FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.my_client_id() IS NOT NULL);