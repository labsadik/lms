ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.coin_ledger REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_ledger; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;