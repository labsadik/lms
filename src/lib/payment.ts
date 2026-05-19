// src/lib/payment.ts
import { supabase } from '../integrations/supabase/client';
import { toast } from 'sonner'; // Use toast instead of alert for better UX

// FIX: Added courseSlug parameter so we redirect back to the correct page!
export async function buyCourse(courseId: string, courseSlug: string, promoId?: string) {
  // 1. Get the current session (ensures user is logged in)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Please log in first');
  }

  // 2. Call the Edge Function with the CORRECT field names
  const { data, error } = await supabase.functions.invoke(
    'create-checkout-session',
    {
      body: {
        course_id: courseId,        // MUST be snake_case, MUST be a UUID
        promocode_id: promoId || undefined,
        // FIX: Redirect back to the SPECIFIC course page, not the generic /courses list
        success_url: `${window.location.origin}/courses/${courseSlug}?paid=1`,
        cancel_url:  `${window.location.origin}/courses/${courseSlug}?canceled=1`,
      },
    }
  );

  if (error) {
    console.error('Edge function error:', error);
    throw new Error(error.message || 'Payment failed');
  }

  // 3. Handle the response
  if (data?.already_enrolled) {
    toast.success('You are already enrolled!'); // Upgraded from alert()
    return;
  }

  if (data?.free) {
    toast.success('Enrolled for free!'); // Upgraded from alert()
    window.location.reload();
    return;
  }

  if (data?.url) {
    // Redirect to Stripe Checkout
    window.location.href = data.url;
    return;
  }

  throw new Error(data?.error || 'Unexpected response from payment server');
}