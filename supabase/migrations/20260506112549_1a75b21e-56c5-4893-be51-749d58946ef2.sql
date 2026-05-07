
-- 1) Recreate auth trigger so new signups produce profiles + roles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Backfill profiles + default 'user' role for existing auth users that are missing them
INSERT INTO public.profiles (user_id, display_name, avatar_url)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
       u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'user'
WHERE r.id IS NULL;

-- 3) Seed the 3 one-time discount rewards (5/10/15% for 100/500/1000 coins)
INSERT INTO public.rewards (name, description, cost_coins, reward_type, reward_value, is_active, icon)
VALUES
  ('5% Discount Coupon',  'One-time 5% off any course',  100,  'discount', '5',  true, 'ticket'),
  ('10% Discount Coupon', 'One-time 10% off any course', 500,  'discount', '10', true, 'ticket'),
  ('15% Discount Coupon', 'One-time 15% off any course', 1000, 'discount', '15', true, 'ticket')
ON CONFLICT DO NOTHING;
