CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_video_minute
  ON public.coin_ledger(user_id, source, ref_id)
  WHERE source = 'video';