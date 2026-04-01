export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ad_performance_intern: {
        Row: {
          appointments: number | null
          client_id: string
          cost_per_appointment: number | null
          cpl: number | null
          created_at: string
          datum: string
          id: string
          leads: number | null
          spend: number | null
        }
        Insert: {
          appointments?: number | null
          client_id: string
          cost_per_appointment?: number | null
          cpl?: number | null
          created_at?: string
          datum?: string
          id?: string
          leads?: number | null
          spend?: number | null
        }
        Update: {
          appointments?: number | null
          client_id?: string
          cost_per_appointment?: number | null
          cpl?: number | null
          created_at?: string
          datum?: string
          id?: string
          leads?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_performance_intern_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ampelstatus: Database["public"]["Enums"]["ampelstatus"]
          branche: string | null
          clv: number | null
          created_at: string
          email: string | null
          enddatum: string | null
          id: string
          kundenstatus: Database["public"]["Enums"]["kundenstatus"]
          laufzeit: string | null
          name: string
          phone: string | null
          projekttyp: string | null
          startdatum: string | null
          updated_at: string
          website: string | null
          zahlstatus: string | null
        }
        Insert: {
          ampelstatus?: Database["public"]["Enums"]["ampelstatus"]
          branche?: string | null
          clv?: number | null
          created_at?: string
          email?: string | null
          enddatum?: string | null
          id?: string
          kundenstatus?: Database["public"]["Enums"]["kundenstatus"]
          laufzeit?: string | null
          name: string
          phone?: string | null
          projekttyp?: string | null
          startdatum?: string | null
          updated_at?: string
          website?: string | null
          zahlstatus?: string | null
        }
        Update: {
          ampelstatus?: Database["public"]["Enums"]["ampelstatus"]
          branche?: string | null
          clv?: number | null
          created_at?: string
          email?: string | null
          enddatum?: string | null
          id?: string
          kundenstatus?: Database["public"]["Enums"]["kundenstatus"]
          laufzeit?: string | null
          name?: string
          phone?: string | null
          projekttyp?: string | null
          startdatum?: string | null
          updated_at?: string
          website?: string | null
          zahlstatus?: string | null
        }
        Relationships: []
      }
      finance: {
        Row: {
          betrag: number
          client_id: string | null
          created_at: string
          datum: string
          id: string
          rechnung_nr: string | null
          typ: Database["public"]["Enums"]["finanz_typ"]
          updated_at: string
          zahlstatus: string
        }
        Insert: {
          betrag?: number
          client_id?: string | null
          created_at?: string
          datum?: string
          id?: string
          rechnung_nr?: string | null
          typ?: Database["public"]["Enums"]["finanz_typ"]
          updated_at?: string
          zahlstatus?: string
        }
        Update: {
          betrag?: number
          client_id?: string | null
          created_at?: string
          datum?: string
          id?: string
          rechnung_nr?: string | null
          typ?: Database["public"]["Enums"]["finanz_typ"]
          updated_at?: string
          zahlstatus?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ads_budget: number | null
          client_id: string
          created_at: string
          enddatum: string | null
          gesamt_saldo: number | null
          id: string
          name: string
          projekttyp: string | null
          startdatum: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ads_budget?: number | null
          client_id: string
          created_at?: string
          enddatum?: string | null
          gesamt_saldo?: number | null
          id?: string
          name: string
          projekttyp?: string | null
          startdatum?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ads_budget?: number | null
          client_id?: string
          created_at?: string
          enddatum?: string | null
          gesamt_saldo?: number | null
          id?: string
          name?: string
          projekttyp?: string | null
          startdatum?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_performance: {
        Row: {
          appointments_set: number | null
          calls_made: number | null
          closes: number | null
          cold_mail_responses: number | null
          cold_mails_sent: number | null
          created_at: string
          datum: string
          id: string
          revenue_generated: number | null
          setter_id: string
          show_ups: number | null
        }
        Insert: {
          appointments_set?: number | null
          calls_made?: number | null
          closes?: number | null
          cold_mail_responses?: number | null
          cold_mails_sent?: number | null
          created_at?: string
          datum?: string
          id?: string
          revenue_generated?: number | null
          setter_id: string
          show_ups?: number | null
        }
        Update: {
          appointments_set?: number | null
          calls_made?: number | null
          closes?: number | null
          cold_mail_responses?: number | null
          cold_mails_sent?: number | null
          created_at?: string
          datum?: string
          id?: string
          revenue_generated?: number | null
          setter_id?: string
          show_ups?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_performance_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          created_at: string
          due_date: string | null
          geplante_zeit: number | null
          id: string
          ist_zeit: number | null
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          geplante_zeit?: number | null
          id?: string
          ist_zeit?: number | null
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          geplante_zeit?: number | null
          id?: string
          ist_zeit?: number | null
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      team: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          rolle: Database["public"]["Enums"]["team_rolle"]
          startdatum: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vorquali_kpi: {
        Row: {
          appointments_set: number | null
          created_at: string
          datum: string
          id: string
          leads_called: number | null
          no_shows: number | null
          setter_id: string
          terminquote: number | null
        }
        Insert: {
          appointments_set?: number | null
          created_at?: string
          datum?: string
          id?: string
          leads_called?: number | null
          no_shows?: number | null
          setter_id: string
          terminquote?: number | null
        }
        Update: {
          appointments_set?: number | null
          created_at?: string
          datum?: string
          id?: string
          leads_called?: number | null
          no_shows?: number | null
          setter_id?: string
          terminquote?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vorquali_kpi_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      ampelstatus: "Grün" | "Gelb" | "Rot" | "CC"
      app_role: "admin" | "account-manager" | "setter"
      finanz_typ: "Einnahme" | "Ausgabe"
      kundenstatus: "In Betreuung" | "Pausiert" | "Churned" | "Lead"
      team_rolle: "Admin" | "Account-Manager" | "Setter" | "Closer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ampelstatus: ["Grün", "Gelb", "Rot", "CC"],
      app_role: ["admin", "account-manager", "setter"],
      finanz_typ: ["Einnahme", "Ausgabe"],
      kundenstatus: ["In Betreuung", "Pausiert", "Churned", "Lead"],
      team_rolle: ["Admin", "Account-Manager", "Setter", "Closer"],
    },
  },
} as const
