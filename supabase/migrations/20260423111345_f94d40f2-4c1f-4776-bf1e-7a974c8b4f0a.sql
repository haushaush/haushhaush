create policy "Users can update own onboarding state"
on public.team
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);