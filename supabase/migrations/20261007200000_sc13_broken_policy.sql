-- SC-13 evidence only, reverted in the next commit: lets anon read draft
-- products, which the RLS tests must catch.
create policy "sc13 broken: anon reads every product"
  on public.product for select to anon using (true);
