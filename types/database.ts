export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
        };
      };
      members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: "owner" | "admin" | "member" | "viewer";
          invited_by: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role?: "owner" | "admin" | "member" | "viewer";
          invited_by?: string | null;
          joined_at?: string;
        };
        Update: {
          role?: "owner" | "admin" | "member" | "viewer";
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          color: string;
          is_archived: boolean;
          is_favorite: boolean;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string | null;
          color?: string;
          is_archived?: boolean;
          is_favorite?: boolean;
          owner_id?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          color?: string;
          is_archived?: boolean;
          is_favorite?: boolean;
          owner_id?: string | null;
        };
      };
      columns: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          position: number;
          color: string | null;
          is_done_column: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          position?: number;
          color?: string | null;
          is_done_column?: boolean;
        };
        Update: {
          name?: string;
          position?: number;
          color?: string | null;
          is_done_column?: boolean;
        };
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          column_id: string;
          org_id: string;
          title: string;
          description: string | null;
          priority: "low" | "medium" | "high" | "urgent";
          position: number;
          assignee_id: string | null;
          due_date: string | null;
          estimated_hours: number | null;
          tracked_hours: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          // v2 fields
          is_urgent: boolean;
          status: "open" | "in_progress" | "delivered" | "archived";
          type_id: string | null;
          requesting_area_id: string | null;
          requested_area_id: string | null;
          desired_start_date: string | null;
          start_date: string | null;
          delivery_date: string | null;
          sla_minutes: number | null;
          parent_task_id: string | null;
          recurrence_config: Record<string, unknown> | null;
          priority_number: number | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          column_id: string;
          org_id: string;
          title: string;
          description?: string | null;
          priority?: "low" | "medium" | "high" | "urgent";
          position?: number;
          assignee_id?: string | null;
          due_date?: string | null;
          estimated_hours?: number | null;
          tracked_hours?: number;
          created_by?: string | null;
          // v2 fields
          is_urgent?: boolean;
          status?: "open" | "in_progress" | "delivered" | "archived";
          type_id?: string | null;
          requesting_area_id?: string | null;
          requested_area_id?: string | null;
          desired_start_date?: string | null;
          start_date?: string | null;
          delivery_date?: string | null;
          sla_minutes?: number | null;
          parent_task_id?: string | null;
          recurrence_config?: Record<string, unknown> | null;
          priority_number?: number | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          priority?: "low" | "medium" | "high" | "urgent";
          position?: number;
          column_id?: string;
          assignee_id?: string | null;
          due_date?: string | null;
          estimated_hours?: number | null;
          tracked_hours?: number;
          // v2 fields
          is_urgent?: boolean;
          status?: "open" | "in_progress" | "delivered" | "archived";
          type_id?: string | null;
          requesting_area_id?: string | null;
          requested_area_id?: string | null;
          desired_start_date?: string | null;
          start_date?: string | null;
          delivery_date?: string | null;
          sla_minutes?: number | null;
          parent_task_id?: string | null;
          recurrence_config?: Record<string, unknown> | null;
          priority_number?: number | null;
        };
      };
      labels: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          color: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          color?: string;
        };
        Update: {
          name?: string;
          color?: string;
        };
      };
      task_labels: {
        Row: {
          task_id: string;
          label_id: string;
        };
        Insert: {
          task_id: string;
          label_id: string;
        };
        Update: never;
      };
      comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          content: string;
        };
        Update: {
          content?: string;
          updated_at?: string;
        };
      };
      checklist_items: {
        Row: {
          id: string;
          task_id: string;
          title: string;
          is_done: boolean;
          position: number;
        };
        Insert: {
          id?: string;
          task_id: string;
          title: string;
          is_done?: boolean;
          position?: number;
        };
        Update: {
          title?: string;
          is_done?: boolean;
          position?: number;
        };
      };
      task_activities: {
        Row: {
          id: string;
          task_id: string;
          user_id: string | null;
          action: string;
          old_value: string | null;
          new_value: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id?: string | null;
          action: string;
          old_value?: string | null;
          new_value?: string | null;
        };
        Update: never;
      };
      task_types: {
        Row: {
          id: string;
          org_id: string;
          project_id: string | null;
          name: string;
          color: string;
          default_hours: number;
        };
        Insert: {
          id?: string;
          org_id: string;
          project_id?: string | null;
          name: string;
          color?: string;
          default_hours?: number;
        };
        Update: {
          name?: string;
          color?: string;
          default_hours?: number;
          project_id?: string | null;
        };
      };
      areas: {
        Row: { id: string; org_id: string; name: string };
        Insert: { id?: string; org_id: string; name: string };
        Update: { name?: string };
      };
      task_assignees: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          sequence_order: number;
          delivered_at: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          sequence_order?: number;
          delivered_at?: string | null;
        };
        Update: {
          sequence_order?: number;
          delivered_at?: string | null;
        };
      };
      time_entries: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          duration_minutes: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          started_at: string;
          ended_at?: string | null;
          duration_minutes?: number | null;
          note?: string | null;
        };
        Update: {
          ended_at?: string | null;
          duration_minutes?: number | null;
          note?: string | null;
        };
      };
      active_timers: {
        Row: {
          user_id: string;
          task_id: string;
          started_at: string;
        };
        Insert: {
          user_id: string;
          task_id: string;
          started_at?: string;
        };
        Update: { task_id?: string };
      };
      saved_filters: {
        Row: {
          id: string;
          user_id: string;
          board_id: string | null;
          name: string;
          filters_json: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          board_id?: string | null;
          name: string;
          filters_json?: Record<string, unknown>;
        };
        Update: { name?: string; filters_json?: Record<string, unknown> };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          content: string;
          task_id: string | null;
          from_user_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          content: string;
          task_id?: string | null;
          from_user_id?: string | null;
        };
        Update: { read_at?: string | null };
      };
      mural_channels: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
        };
        Insert: { id?: string; org_id: string; name: string; is_default?: boolean };
        Update: { name?: string; is_default?: boolean };
      };
      mural_posts: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          content: string;
          created_at: string;
        };
        Insert: { id?: string; channel_id: string; user_id: string; content: string };
        Update: never;
      };
      automations: {
        Row: {
          id: string;
          board_id: string;
          name: string;
          trigger_event: string;
          trigger_config: Record<string, unknown>;
          action_type: string;
          action_config: Record<string, unknown>;
          is_active: boolean;
          execution_count: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          name: string;
          trigger_event: string;
          trigger_config?: Record<string, unknown>;
          action_type: string;
          action_config?: Record<string, unknown>;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          is_active?: boolean;
          execution_count?: number;
        };
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: string;
          token: string;
          invited_by: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: string;
          token?: string;
          invited_by?: string | null;
          expires_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_orgs: {
        Args: Record<string, never>;
        Returns: string[];
      };
      is_org_admin: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
};
