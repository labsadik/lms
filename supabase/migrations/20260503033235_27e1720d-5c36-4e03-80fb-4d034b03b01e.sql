
-- 1. parts: live/recorded
CREATE TYPE public.part_kind AS ENUM ('recorded', 'live');
ALTER TABLE public.parts ADD COLUMN kind public.part_kind NOT NULL DEFAULT 'recorded';
ALTER TABLE public.parts ADD COLUMN live_url TEXT;

-- 2. tests
CREATE TYPE public.test_scope AS ENUM ('course', 'subject', 'chapter');
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  subject_id UUID,
  chapter_id UUID,
  scope public.test_scope NOT NULL DEFAULT 'course',
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 30,
  pass_score INT NOT NULL DEFAULT 40,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tests" ON public.tests FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Enrolled users view tests" ON public.tests FOR SELECT USING (is_published = true AND is_enrolled(auth.uid(), course_id));

CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image_url TEXT,
  marks INT NOT NULL DEFAULT 1,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage questions" ON public.questions FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Enrolled users view questions" ON public.questions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tests t WHERE t.id = questions.test_id AND t.is_published AND is_enrolled(auth.uid(), t.course_id))
);

CREATE TABLE public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage options" ON public.question_options FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Enrolled users view options" ON public.question_options FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.questions q JOIN public.tests t ON t.id = q.test_id WHERE q.id = question_options.question_id AND t.is_published AND is_enrolled(auth.uid(), t.course_id))
);

CREATE TABLE public.test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own attempts" ON public.test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own attempts" ON public.test_attempts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users view own attempts" ON public.test_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all attempts" ON public.test_attempts FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.test_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL,
  selected_option_id UUID,
  is_correct BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.test_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own answers" ON public.test_answers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.id = test_answers.attempt_id AND a.user_id = auth.uid())
);
CREATE POLICY "Users view own answers" ON public.test_answers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.id = test_answers.attempt_id AND a.user_id = auth.uid())
);
CREATE POLICY "Admins view all answers" ON public.test_answers FOR SELECT USING (has_role(auth.uid(),'admin'));

-- 3. announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Enrolled users view announcements" ON public.announcements FOR SELECT USING (is_enrolled(auth.uid(), course_id));

CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, announcement_id)
);
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own reads" ON public.announcement_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own reads" ON public.announcement_reads FOR SELECT USING (auth.uid() = user_id);

-- 4. coin ledger
CREATE TABLE public.coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  ref_id TEXT,
  course_id UUID,
  xp INT NOT NULL DEFAULT 0,
  coins INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users insert own ledger" ON public.coin_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own ledger" ON public.coin_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all ledger" ON public.coin_ledger FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE INDEX idx_coin_ledger_user_source ON public.coin_ledger(user_id, source, ref_id);
CREATE INDEX idx_coin_ledger_course ON public.coin_ledger(course_id);
CREATE INDEX idx_test_attempts_user ON public.test_attempts(user_id, test_id);
CREATE INDEX idx_questions_test ON public.questions(test_id, position);
CREATE INDEX idx_options_question ON public.question_options(question_id, position);
CREATE INDEX idx_announcements_course ON public.announcements(course_id, created_at DESC);
