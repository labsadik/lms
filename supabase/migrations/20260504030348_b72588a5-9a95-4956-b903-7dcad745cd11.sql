
-- Allow authenticated users to self-enroll
CREATE POLICY "Users can self-enroll"
  ON public.enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to record promocode redemptions for themselves
CREATE POLICY "Users insert own promocode redemptions"
  ON public.promocode_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
