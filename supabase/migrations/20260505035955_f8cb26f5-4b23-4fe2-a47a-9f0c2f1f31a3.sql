-- Enable realtime for announcements (bell notifications)
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;

-- Add test_type for quiz / DPP / test categorization
DO $$ BEGIN
  CREATE TYPE public.test_type AS ENUM ('test', 'quiz', 'dpp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS test_type public.test_type NOT NULL DEFAULT 'test';