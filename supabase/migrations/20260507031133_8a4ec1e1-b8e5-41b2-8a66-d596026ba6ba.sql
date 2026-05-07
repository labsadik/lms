-- Lock down enrollment inserts: previously any authenticated user could insert their own enrollment row at amount_paid_inr=0,
-- bypassing payment. Drop the self-enroll policy. All enrollments must go through the create-checkout-session edge function
-- (uses service role) or admin grant (admin role bypasses via "Admins manage enrollments").
DROP POLICY IF EXISTS "Users can self-enroll" ON public.enrollments;