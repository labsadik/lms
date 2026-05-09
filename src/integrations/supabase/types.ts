export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: { activity_date: string; id: string; user_id: string; videos_watched: number; xp_earned: number }
        Insert: { activity_date?: string; id?: string; user_id: string; videos_watched?: number; xp_earned?: number }
        Update: { activity_date?: string; id?: string; user_id?: string; videos_watched?: number; xp_earned?: number }
        Relationships: []
      }
      announcement_reads: {
        Row: { announcement_id: string; id: string; read_at: string; user_id: string }
        Insert: { announcement_id: string; id?: string; read_at?: string; user_id: string }
        Update: { announcement_id?: string; id?: string; read_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "announcement_reads_announcement_id_fkey"; columns: ["announcement_id"]; isOneToOne: false; referencedRelation: "announcements"; referencedColumns: ["id"] }]
      }
      announcements: {
        Row: { body: string | null; course_id: string; created_at: string; id: string; image_url: string | null; title: string; video_url: string | null }
        Insert: { body?: string | null; course_id: string; created_at?: string; id?: string; image_url?: string | null; title: string; video_url?: string | null }
        Update: { body?: string | null; course_id?: string; created_at?: string; id?: string; image_url?: string | null; title?: string; video_url?: string | null }
        Relationships: [{ foreignKeyName: "announcements_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }]
      }
      badges: {
        Row: { code: string; coin_reward: number; created_at: string; description: string | null; icon: string | null; id: string; name: string; xp_reward: number }
        Insert: { code: string; coin_reward?: number; created_at?: string; description?: string | null; icon?: string | null; id?: string; name: string; xp_reward?: number }
        Update: { code?: string; coin_reward?: number; created_at?: string; description?: string | null; icon?: string | null; id?: string; name?: string; xp_reward?: number }
        Relationships: []
      }
      chapters: {
        Row: { created_at: string; id: string; name: string; position: number; subject_id: string }
        Insert: { created_at?: string; id?: string; name: string; position?: number; subject_id: string }
        Update: { created_at?: string; id?: string; name?: string; position?: number; subject_id?: string }
        Relationships: [{ foreignKeyName: "chapters_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] }]
      }
      coin_ledger: {
        Row: { coins: number; course_id: string | null; created_at: string; id: string; ref_id: string | null; source: string; user_id: string; xp: number }
        Insert: { coins?: number; course_id?: string | null; created_at?: string; id?: string; ref_id?: string | null; source: string; user_id: string; xp?: number }
        Update: { coins?: number; course_id?: string | null; created_at?: string; id?: string; ref_id?: string | null; source?: string; user_id?: string; xp?: number }
        Relationships: []
      }
      comments: {
        Row: {
          id: string
          part_id: string
          user_id: string
          parent_id: string | null
          display_name: string | null
          avatar_url: string | null
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          part_id: string
          user_id: string
          parent_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          part_id?: string
          user_id?: string
          parent_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          message?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          }
        ]
      }
      courses: {
        Row: { created_at: string; currency: string; description: string | null; id: string; instructor: string | null; is_published: boolean; meta_description: string | null; price_inr: number; slug: string; thumbnail_url: string | null; title: string; updated_at: string }
        Insert: { created_at?: string; currency?: string; description?: string | null; id?: string; instructor?: string | null; is_published?: boolean; meta_description?: string | null; price_inr?: number; slug: string; thumbnail_url?: string | null; title: string; updated_at?: string }
        Update: { created_at?: string; currency?: string; description?: string | null; id?: string; instructor?: string | null; is_published?: boolean; meta_description?: string | null; price_inr?: number; slug?: string; thumbnail_url?: string | null; title?: string; updated_at?: string }
        Relationships: []
      }
      enrollments: {
        Row: { amount_paid_inr: number; course_id: string; enrolled_at: string; id: string; promocode: string | null; stripe_session_id: string | null; user_id: string }
        Insert: { amount_paid_inr?: number; course_id: string; enrolled_at?: string; id?: string; promocode?: string | null; stripe_session_id?: string | null; user_id: string }
        Update: { amount_paid_inr?: number; course_id?: string; enrolled_at?: string; id?: string; promocode?: string | null; stripe_session_id?: string | null; user_id?: string }
        Relationships: [{ foreignKeyName: "enrollments_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }]
      }
      parts: {
        Row: { chapter_id: string; created_at: string; duration: string | null; id: string; is_preview: boolean; kind: Database["public"]["Enums"]["part_kind"]; live_url: string | null; name: string; notes_url: string | null; position: number; video_id: string }
        Insert: { chapter_id: string; created_at?: string; duration?: string | null; id?: string; is_preview?: boolean; kind?: Database["public"]["Enums"]["part_kind"]; live_url?: string | null; name: string; notes_url?: string | null; position?: number; video_id: string }
        Update: { chapter_id?: string; created_at?: string; duration?: string | null; id?: string; is_preview?: boolean; kind?: Database["public"]["Enums"]["part_kind"]; live_url?: string | null; name?: string; notes_url?: string | null; position?: number; video_id?: string }
        Relationships: [{ foreignKeyName: "parts_chapter_id_fkey"; columns: ["chapter_id"]; isOneToOne: false; referencedRelation: "chapters"; referencedColumns: ["id"] }]
      }
      profiles: {
        Row: { avatar_url: string | null; bio: string | null; coins: number; created_at: string; current_streak: number; display_name: string | null; id: string; last_activity_date: string | null; level: number; longest_streak: number; phone: string | null; referral_code: string; referred_by: string | null; updated_at: string; user_id: string; xp: number }
        Insert: { avatar_url?: string | null; bio?: string | null; coins?: number; created_at?: string; current_streak?: number; display_name?: string | null; id?: string; last_activity_date?: string | null; level?: number; longest_streak?: number; phone?: string | null; referral_code?: string; referred_by?: string | null; updated_at?: string; user_id: string; xp?: number }
        Update: { avatar_url?: string | null; bio?: string | null; coins?: number; created_at?: string; current_streak?: number; display_name?: string | null; id?: string; last_activity_date?: string | null; level?: number; longest_streak?: number; phone?: string | null; referral_code?: string; referred_by?: string | null; updated_at?: string; user_id?: string; xp?: number }
        Relationships: []
      }
      progress: {
        Row: { completed: boolean; completed_at: string | null; id: string; last_watched_at: string; part_id: string; user_id: string; watched_seconds: number }
        Insert: { completed?: boolean; completed_at?: string | null; id?: string; last_watched_at?: string; part_id: string; user_id: string; watched_seconds?: number }
        Update: { completed?: boolean; completed_at?: string | null; id?: string; last_watched_at?: string; part_id?: string; user_id?: string; watched_seconds?: number }
        Relationships: [{ foreignKeyName: "progress_part_id_fkey"; columns: ["part_id"]; isOneToOne: false; referencedRelation: "parts"; referencedColumns: ["id"] }]
      }
      promocode_redemptions: {
        Row: { course_id: string; id: string; promocode_id: string; redeemed_at: string; user_id: string }
        Insert: { course_id: string; id?: string; promocode_id: string; redeemed_at?: string; user_id: string }
        Update: { course_id?: string; id?: string; promocode_id?: string; redeemed_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "promocode_redemptions_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "promocode_redemptions_promocode_id_fkey"; columns: ["promocode_id"]; isOneToOne: false; referencedRelation: "promocodes"; referencedColumns: ["id"] }]
      }
      promocodes: {
        Row: { code: string; course_id: string | null; created_at: string; discount_type: Database["public"]["Enums"]["discount_type"]; discount_value: number; expires_at: string | null; id: string; is_active: boolean; max_uses: number | null; uses_count: number }
        Insert: { code: string; course_id?: string | null; created_at?: string; discount_type: Database["public"]["Enums"]["discount_type"]; discount_value: number; expires_at?: string | null; id?: string; is_active?: boolean; max_uses?: number | null; uses_count?: number }
        Update: { code?: string; course_id?: string | null; created_at?: string; discount_type?: Database["public"]["Enums"]["discount_type"]; discount_value?: number; expires_at?: string | null; id?: string; is_active?: boolean; max_uses?: number | null; uses_count?: number }
        Relationships: [{ foreignKeyName: "promocodes_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }]
      }
      question_options: {
        Row: { id: string; is_correct: boolean; position: number; question_id: string; text: string }
        Insert: { id?: string; is_correct?: boolean; position?: number; question_id: string; text: string }
        Update: { id?: string; is_correct?: boolean; position?: number; question_id?: string; text?: string }
        Relationships: [{ foreignKeyName: "question_options_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] }]
      }
      questions: {
        Row: { created_at: string; id: string; image_url: string | null; marks: number; position: number; test_id: string; text: string }
        Insert: { created_at?: string; id?: string; image_url?: string | null; marks?: number; position?: number; test_id: string; text: string }
        Update: { created_at?: string; id?: string; image_url?: string | null; marks?: number; position?: number; test_id?: string; text?: string }
        Relationships: [{ foreignKeyName: "questions_test_id_fkey"; columns: ["test_id"]; isOneToOne: false; referencedRelation: "tests"; referencedColumns: ["id"] }]
      }
      referrals: {
        Row: { created_at: string; id: string; referred_id: string; referrer_id: string; reward_granted: boolean }
        Insert: { created_at?: string; id?: string; referred_id: string; referrer_id: string; reward_granted?: boolean }
        Update: { created_at?: string; id?: string; referred_id?: string; referrer_id?: string; reward_granted?: boolean }
        Relationships: []
      }
      reward_redemptions: {
        Row: { code_granted: string | null; cost_paid: number; id: string; redeemed_at: string; reward_id: string; user_id: string }
        Insert: { code_granted?: string | null; cost_paid: number; id?: string; redeemed_at?: string; reward_id: string; user_id: string }
        Update: { code_granted?: string | null; cost_paid?: number; id?: string; redeemed_at?: string; reward_id?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "reward_redemptions_reward_id_fkey"; columns: ["reward_id"]; isOneToOne: false; referencedRelation: "rewards"; referencedColumns: ["id"] }]
      }
      rewards: {
        Row: { cost_coins: number; created_at: string; description: string | null; icon: string | null; id: string; is_active: boolean; name: string; reward_type: string; reward_value: string | null; stock: number | null }
        Insert: { cost_coins: number; created_at?: string; description?: string | null; icon?: string | null; id?: string; is_active?: boolean; name: string; reward_type?: string; reward_value?: string | null; stock?: number | null }
        Update: { cost_coins?: number; created_at?: string; description?: string | null; icon?: string | null; id?: string; is_active?: boolean; name?: string; reward_type?: string; reward_value?: string | null; stock?: number | null }
        Relationships: []
      }
      subjects: {
        Row: { course_id: string; created_at: string; id: string; name: string; position: number }
        Insert: { course_id: string; created_at?: string; id?: string; name: string; position?: number }
        Update: { course_id?: string; created_at?: string; id?: string; name?: string; position?: number }
        Relationships: [{ foreignKeyName: "subjects_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }]
      }
      test_answers: {
        Row: { attempt_id: string; id: string; is_correct: boolean; question_id: string; selected_option_id: string | null }
        Insert: { attempt_id: string; id?: string; is_correct?: boolean; question_id: string; selected_option_id?: string | null }
        Update: { attempt_id?: string; id?: string; is_correct?: boolean; question_id?: string; selected_option_id?: string | null }
        Relationships: [{ foreignKeyName: "test_answers_attempt_id_fkey"; columns: ["attempt_id"]; isOneToOne: false; referencedRelation: "test_attempts"; referencedColumns: ["id"] }]
      }
      test_attempts: {
        Row: { finished_at: string | null; id: string; passed: boolean; score: number; started_at: string; test_id: string; total: number; user_id: string }
        Insert: { finished_at?: string | null; id?: string; passed?: boolean; score?: number; started_at?: string; test_id: string; total?: number; user_id: string }
        Update: { finished_at?: string | null; id?: string; passed?: boolean; score?: number; started_at?: string; test_id?: string; total?: number; user_id?: string }
        Relationships: [{ foreignKeyName: "test_attempts_test_id_fkey"; columns: ["test_id"]; isOneToOne: false; referencedRelation: "tests"; referencedColumns: ["id"] }]
      }
      tests: {
        Row: { chapter_id: string | null; course_id: string; created_at: string; description: string | null; duration_minutes: number; id: string; is_published: boolean; pass_score: number; scope: Database["public"]["Enums"]["test_scope"]; subject_id: string | null; test_type: Database["public"]["Enums"]["test_type"]; title: string }
        Insert: { chapter_id?: string | null; course_id: string; created_at?: string; description?: string | null; duration_minutes?: number; id?: string; is_published?: boolean; pass_score?: number; scope?: Database["public"]["Enums"]["test_scope"]; subject_id?: string | null; test_type?: Database["public"]["Enums"]["test_type"]; title: string }
        Update: { chapter_id?: string | null; course_id?: string; created_at?: string; description?: string | null; duration_minutes?: number; id?: string; is_published?: boolean; pass_score?: number; scope?: Database["public"]["Enums"]["test_scope"]; subject_id?: string | null; test_type?: Database["public"]["Enums"]["test_type"]; title?: string }
        Relationships: [{ foreignKeyName: "tests_chapter_id_fkey"; columns: ["chapter_id"]; isOneToOne: false; referencedRelation: "chapters"; referencedColumns: ["id"] }, { foreignKeyName: "tests_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] }, { foreignKeyName: "tests_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] }]
      }
      user_badges: {
        Row: { badge_id: string; earned_at: string; id: string; user_id: string }
        Insert: { badge_id: string; earned_at?: string; id?: string; user_id: string }
        Update: { badge_id?: string; earned_at?: string; id?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "user_badges_badge_id_fkey"; columns: ["badge_id"]; isOneToOne: false; referencedRelation: "badges"; referencedColumns: ["id"] }]
      }
      user_roles: {
        Row: { created_at: string; id: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Insert: { created_at?: string; id?: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Update: { created_at?: string; id?: string; role?: Database["public"]["Enums"]["app_role"]; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      has_role: { Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }; Returns: boolean }
      is_enrolled: { Args: { _course_id: string; _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      discount_type: "percent" | "fixed"
      part_kind: "recorded" | "live"
      test_scope: "course" | "subject" | "chapter"
      test_type: "test" | "quiz" | "dpp"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals }, TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never : never

export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals }, TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never : never

export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals }, TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never : never

export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals }, EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never

export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals }, CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      discount_type: ["percent", "fixed"],
      part_kind: ["recorded", "live"],
      test_scope: ["course", "subject", "chapter"],
      test_type: ["test", "quiz", "dpp"],
    },
  },
} as const