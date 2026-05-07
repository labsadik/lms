DO $$
DECLARE
  fks text[][] := ARRAY[
    ['announcements','announcements_course_id_fkey','course_id','courses','CASCADE'],
    ['tests','tests_course_id_fkey','course_id','courses','CASCADE'],
    ['tests','tests_subject_id_fkey','subject_id','subjects','SET NULL'],
    ['tests','tests_chapter_id_fkey','chapter_id','chapters','SET NULL'],
    ['subjects','subjects_course_id_fkey','course_id','courses','CASCADE'],
    ['chapters','chapters_subject_id_fkey','subject_id','subjects','CASCADE'],
    ['parts','parts_chapter_id_fkey','chapter_id','chapters','CASCADE'],
    ['questions','questions_test_id_fkey','test_id','tests','CASCADE'],
    ['question_options','question_options_question_id_fkey','question_id','questions','CASCADE'],
    ['test_attempts','test_attempts_test_id_fkey','test_id','tests','CASCADE'],
    ['test_answers','test_answers_attempt_id_fkey','attempt_id','test_attempts','CASCADE'],
    ['enrollments','enrollments_course_id_fkey','course_id','courses','CASCADE']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(fks,1) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fks[i][2]) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
        fks[i][1], fks[i][2], fks[i][3], fks[i][4], fks[i][5]);
    END IF;
  END LOOP;
END $$;