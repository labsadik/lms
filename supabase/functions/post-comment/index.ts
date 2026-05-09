import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Invalid token");

    const { part_id, message, parent_id } = await req.json();
    if (!part_id || !message?.trim()) throw new Error("Missing fields");
    if (message.trim().length > 1000) throw new Error("Comment too long");

    // If replying, verify parent comment exists on the same part
    if (parent_id) {
      const { data: parent } = await supabase
        .from("comments")
        .select("id, part_id")
        .eq("id", parent_id)
        .single();
      if (!parent) throw new Error("Parent comment not found");
      if (parent.part_id !== part_id) throw new Error("Invalid parent");
    }

    // Walk up: part → chapter → subject → course
    const { data: part } = await supabase
      .from("parts")
      .select("chapter_id")
      .eq("id", part_id)
      .single();
    if (!part) throw new Error("Part not found");

    const { data: chapter } = await supabase
      .from("chapters")
      .select("subject_id")
      .eq("id", part.chapter_id)
      .single();

    const { data: subject } = await supabase
      .from("subjects")
      .select("course_id")
      .eq("id", chapter?.subject_id)
      .single();
    if (!subject) throw new Error("Course not found");

    // Check enrollment
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_id", subject.course_id)
      .maybeSingle();
    if (!enrollment) throw new Error("Not enrolled");

    // Get profile for denormalized display
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .single();

    // Insert comment
    const { data: comment, error } = await supabase
      .from("comments")
      .insert({
        part_id,
        user_id: user.id,
        parent_id: parent_id || null,
        display_name:
          profile?.display_name || user.email?.split("@")[0] || "Student",
        avatar_url: profile?.avatar_url || null,
        message: message.trim(),
      })
      .select(
        "id, user_id, parent_id, display_name, avatar_url, message, created_at"
      )
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ comment }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: message.includes("Not enrolled") ? 403 : 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});