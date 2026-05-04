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
      ad_budgets: {
        Row: {
          account_id: string | null
          alert: boolean | null
          alert_200_sent_at: string | null
          alert_ueberschritten_sent_at: string | null
          ausgegeben: number | null
          campaign_ids: Json | null
          client_id: string | null
          created_at: string | null
          fixes_budget: boolean | null
          id: string
          invoice_ticket_created: boolean | null
          invoice_ticket_id: string | null
          last_synced_at: string | null
          laufzeit: string | null
          mail_gesendet: boolean | null
          name: string
          pausiert: boolean | null
          remaining: number | null
          startdatum: string | null
          sync_status: string | null
          updated_at: string | null
          werbeaccount_name: string
          werbebudget: number
        }
        Insert: {
          account_id?: string | null
          alert?: boolean | null
          alert_200_sent_at?: string | null
          alert_ueberschritten_sent_at?: string | null
          ausgegeben?: number | null
          campaign_ids?: Json | null
          client_id?: string | null
          created_at?: string | null
          fixes_budget?: boolean | null
          id?: string
          invoice_ticket_created?: boolean | null
          invoice_ticket_id?: string | null
          last_synced_at?: string | null
          laufzeit?: string | null
          mail_gesendet?: boolean | null
          name: string
          pausiert?: boolean | null
          remaining?: number | null
          startdatum?: string | null
          sync_status?: string | null
          updated_at?: string | null
          werbeaccount_name: string
          werbebudget: number
        }
        Update: {
          account_id?: string | null
          alert?: boolean | null
          alert_200_sent_at?: string | null
          alert_ueberschritten_sent_at?: string | null
          ausgegeben?: number | null
          campaign_ids?: Json | null
          client_id?: string | null
          created_at?: string | null
          fixes_budget?: boolean | null
          id?: string
          invoice_ticket_created?: boolean | null
          invoice_ticket_id?: string | null
          last_synced_at?: string | null
          laufzeit?: string | null
          mail_gesendet?: boolean | null
          name?: string
          pausiert?: boolean | null
          remaining?: number | null
          startdatum?: string | null
          sync_status?: string | null
          updated_at?: string | null
          werbeaccount_name?: string
          werbebudget?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_budgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_budgets_invoice_ticket_id_fkey"
            columns: ["invoice_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_creatives: {
        Row: {
          body_copy: string | null
          branche: string | null
          created_at: string
          cta: string | null
          figma_url: string | null
          format: string | null
          headline: string | null
          hook_type: string | null
          id: string
          kunde: string | null
          platform: string | null
          produkt: string | null
          reference_frame_id: string | null
          thumbnail_url: string | null
          user_id: string
          zielgruppe: string | null
        }
        Insert: {
          body_copy?: string | null
          branche?: string | null
          created_at?: string
          cta?: string | null
          figma_url?: string | null
          format?: string | null
          headline?: string | null
          hook_type?: string | null
          id?: string
          kunde?: string | null
          platform?: string | null
          produkt?: string | null
          reference_frame_id?: string | null
          thumbnail_url?: string | null
          user_id: string
          zielgruppe?: string | null
        }
        Update: {
          body_copy?: string | null
          branche?: string | null
          created_at?: string
          cta?: string | null
          figma_url?: string | null
          format?: string | null
          headline?: string | null
          hook_type?: string | null
          id?: string
          kunde?: string | null
          platform?: string | null
          produkt?: string | null
          reference_frame_id?: string | null
          thumbnail_url?: string | null
          user_id?: string
          zielgruppe?: string | null
        }
        Relationships: []
      }
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
      ad_performance_kunden: {
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
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string | null
          endpoint: string | null
          id: string
          ip_address: string | null
          method: string | null
          response_time_ms: number | null
          status_code: number | null
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          ip_address?: string | null
          method?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          ip_address?: string | null
          method?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "api_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      api_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked: boolean | null
          revoked_at: string | null
          scopes: Json | null
          token_hash: string
          token_preview: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked?: boolean | null
          revoked_at?: string | null
          scopes?: Json | null
          token_hash: string
          token_preview: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked?: boolean | null
          revoked_at?: string | null
          scopes?: Json | null
          token_hash?: string
          token_preview?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      aria_automation_logs: {
        Row: {
          automation_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          status: string
          steps_executed: Json | null
          triggered_by: string | null
        }
        Insert: {
          automation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          steps_executed?: Json | null
          triggered_by?: string | null
        }
        Update: {
          automation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          steps_executed?: Json | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aria_automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "aria_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      aria_automations: {
        Row: {
          active: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          last_run_at: string | null
          name: string
          run_count: number | null
          steps: Json
          trigger_config: Json | null
          trigger_type: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name: string
          run_count?: number | null
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string
          run_count?: number | null
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string
        }
        Relationships: []
      }
      aria_interactions: {
        Row: {
          actions_executed: Json | null
          aria_response: string
          created_at: string | null
          feedback: number | null
          feedback_note: string | null
          id: string
          session_context: Json | null
          user_id: string | null
          user_message: string
        }
        Insert: {
          actions_executed?: Json | null
          aria_response: string
          created_at?: string | null
          feedback?: number | null
          feedback_note?: string | null
          id?: string
          session_context?: Json | null
          user_id?: string | null
          user_message: string
        }
        Update: {
          actions_executed?: Json | null
          aria_response?: string
          created_at?: string | null
          feedback?: number | null
          feedback_note?: string | null
          id?: string
          session_context?: Json | null
          user_id?: string | null
          user_message?: string
        }
        Relationships: []
      }
      aria_knowledge: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          file_path: string | null
          id: string
          is_active: boolean | null
          last_updated_by: string | null
          priority: number | null
          source_type: string
          source_url: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          content: string
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean | null
          last_updated_by?: string | null
          priority?: number | null
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean | null
          last_updated_by?: string | null
          priority?: number | null
          source_type?: string
          source_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      aria_memory: {
        Row: {
          confidence: number | null
          created_at: string | null
          created_by: string | null
          id: string
          key: string
          last_reinforced_at: string | null
          memory_type: string
          times_confirmed: number | null
          times_contradicted: number | null
          value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          key: string
          last_reinforced_at?: string | null
          memory_type: string
          times_confirmed?: number | null
          times_contradicted?: number | null
          value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          key?: string
          last_reinforced_at?: string | null
          memory_type?: string
          times_confirmed?: number | null
          times_contradicted?: number | null
          value?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string | null
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string | null
          status: string
          steps_log: Json | null
          triggered_by: string | null
        }
        Insert: {
          automation_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          steps_log?: Json | null
          triggered_by?: string | null
        }
        Update: {
          automation_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          steps_log?: Json | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "aria_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          browser_info: string | null
          created_at: string
          description: string
          id: string
          page_url: string | null
          problem_type: string
          screenshot_url: string | null
          slack_message_ts: string | null
          status: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          browser_info?: string | null
          created_at?: string
          description: string
          id?: string
          page_url?: string | null
          problem_type: string
          screenshot_url?: string | null
          slack_message_ts?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          browser_info?: string | null
          created_at?: string
          description?: string
          id?: string
          page_url?: string | null
          problem_type?: string
          screenshot_url?: string | null
          slack_message_ts?: string | null
          status?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      call_coaching: {
        Row: {
          coach_name: string | null
          created_at: string
          datum: string
          id: string
          notes: string | null
          pdf_url: string | null
          score: number | null
          team_member_id: string
        }
        Insert: {
          coach_name?: string | null
          created_at?: string
          datum?: string
          id?: string
          notes?: string | null
          pdf_url?: string | null
          score?: number | null
          team_member_id: string
        }
        Update: {
          coach_name?: string | null
          created_at?: string
          datum?: string
          id?: string
          notes?: string | null
          pdf_url?: string | null
          score?: number | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_coaching_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team"
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
      close_deals: {
        Row: {
          ads_budget: number | null
          ampel: string | null
          ampelstatus: string | null
          art: string | null
          assigned_to: string | null
          branche: string[] | null
          cash_collect_offen: number | null
          client_name: string
          close_lead_id: string | null
          close_opportunity_url: string | null
          clv: number | null
          created_at: string
          crm_kosten: number | null
          deadline: string | null
          deal_type: string | null
          email: string | null
          end_datum: string | null
          gesamt_saldo: number | null
          health_score: number | null
          id: string
          kundenstatus: string | null
          laufzeit: string | null
          laufzeit_in_14t: boolean | null
          laufzeit_monate: number | null
          leistungen: Json | null
          meta_ad_account_id: string | null
          meta_kosten: number | null
          notes: Json | null
          notion_id: string | null
          notion_url: string | null
          onepage_url: string | null
          projekttyp: string[] | null
          start_datum: string | null
          status: string | null
          superchat_kosten: number | null
          telefon: string | null
          unternehmen: string | null
          updated_at: string
          vor_nachname: string | null
          website_kosten: number | null
          website_url: string | null
          wert_eur: number | null
          zahlstatus: string | null
        }
        Insert: {
          ads_budget?: number | null
          ampel?: string | null
          ampelstatus?: string | null
          art?: string | null
          assigned_to?: string | null
          branche?: string[] | null
          cash_collect_offen?: number | null
          client_name: string
          close_lead_id?: string | null
          close_opportunity_url?: string | null
          clv?: number | null
          created_at?: string
          crm_kosten?: number | null
          deadline?: string | null
          deal_type?: string | null
          email?: string | null
          end_datum?: string | null
          gesamt_saldo?: number | null
          health_score?: number | null
          id?: string
          kundenstatus?: string | null
          laufzeit?: string | null
          laufzeit_in_14t?: boolean | null
          laufzeit_monate?: number | null
          leistungen?: Json | null
          meta_ad_account_id?: string | null
          meta_kosten?: number | null
          notes?: Json | null
          notion_id?: string | null
          notion_url?: string | null
          onepage_url?: string | null
          projekttyp?: string[] | null
          start_datum?: string | null
          status?: string | null
          superchat_kosten?: number | null
          telefon?: string | null
          unternehmen?: string | null
          updated_at?: string
          vor_nachname?: string | null
          website_kosten?: number | null
          website_url?: string | null
          wert_eur?: number | null
          zahlstatus?: string | null
        }
        Update: {
          ads_budget?: number | null
          ampel?: string | null
          ampelstatus?: string | null
          art?: string | null
          assigned_to?: string | null
          branche?: string[] | null
          cash_collect_offen?: number | null
          client_name?: string
          close_lead_id?: string | null
          close_opportunity_url?: string | null
          clv?: number | null
          created_at?: string
          crm_kosten?: number | null
          deadline?: string | null
          deal_type?: string | null
          email?: string | null
          end_datum?: string | null
          gesamt_saldo?: number | null
          health_score?: number | null
          id?: string
          kundenstatus?: string | null
          laufzeit?: string | null
          laufzeit_in_14t?: boolean | null
          laufzeit_monate?: number | null
          leistungen?: Json | null
          meta_ad_account_id?: string | null
          meta_kosten?: number | null
          notes?: Json | null
          notion_id?: string | null
          notion_url?: string | null
          onepage_url?: string | null
          projekttyp?: string[] | null
          start_datum?: string | null
          status?: string | null
          superchat_kosten?: number | null
          telefon?: string | null
          unternehmen?: string | null
          updated_at?: string
          vor_nachname?: string | null
          website_kosten?: number | null
          website_url?: string | null
          wert_eur?: number | null
          zahlstatus?: string | null
        }
        Relationships: []
      }
      close_leads: {
        Row: {
          addresses: Json | null
          contacts: Json | null
          custom: Json | null
          date_created: string | null
          date_updated: string | null
          description: string | null
          display_name: string | null
          id: string
          raw: Json | null
          status_id: string | null
          status_label: string | null
          synced_at: string | null
          url: string | null
        }
        Insert: {
          addresses?: Json | null
          contacts?: Json | null
          custom?: Json | null
          date_created?: string | null
          date_updated?: string | null
          description?: string | null
          display_name?: string | null
          id: string
          raw?: Json | null
          status_id?: string | null
          status_label?: string | null
          synced_at?: string | null
          url?: string | null
        }
        Update: {
          addresses?: Json | null
          contacts?: Json | null
          custom?: Json | null
          date_created?: string | null
          date_updated?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          raw?: Json | null
          status_id?: string | null
          status_label?: string | null
          synced_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      close_opportunities: {
        Row: {
          confidence: number | null
          date_created: string | null
          date_lost: string | null
          date_updated: string | null
          date_won: string | null
          id: string
          lead_id: string | null
          lead_name: string | null
          note: string | null
          pipeline_id: string | null
          pipeline_name: string | null
          raw: Json | null
          status_label: string | null
          status_type: string | null
          synced_at: string | null
          value: number | null
          value_currency: string | null
          value_formatted: string | null
          value_period: string | null
        }
        Insert: {
          confidence?: number | null
          date_created?: string | null
          date_lost?: string | null
          date_updated?: string | null
          date_won?: string | null
          id: string
          lead_id?: string | null
          lead_name?: string | null
          note?: string | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          raw?: Json | null
          status_label?: string | null
          status_type?: string | null
          synced_at?: string | null
          value?: number | null
          value_currency?: string | null
          value_formatted?: string | null
          value_period?: string | null
        }
        Update: {
          confidence?: number | null
          date_created?: string | null
          date_lost?: string | null
          date_updated?: string | null
          date_won?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string | null
          note?: string | null
          pipeline_id?: string | null
          pipeline_name?: string | null
          raw?: Json | null
          status_label?: string | null
          status_type?: string | null
          synced_at?: string | null
          value?: number | null
          value_currency?: string | null
          value_formatted?: string | null
          value_period?: string | null
        }
        Relationships: []
      }
      company_logos: {
        Row: {
          bg_color: string | null
          logo_url: string | null
          unternehmen: string
        }
        Insert: {
          bg_color?: string | null
          logo_url?: string | null
          unternehmen: string
        }
        Update: {
          bg_color?: string | null
          logo_url?: string | null
          unternehmen?: string
        }
        Relationships: []
      }
      creative_approvals: {
        Row: {
          approval_type: Database["public"]["Enums"]["creative_approval_type"]
          approved_at: string
          approved_by: string
          asset_id: string
          id: string
          project_id: string
          signature_url: string | null
        }
        Insert: {
          approval_type?: Database["public"]["Enums"]["creative_approval_type"]
          approved_at?: string
          approved_by: string
          asset_id: string
          id?: string
          project_id: string
          signature_url?: string | null
        }
        Update: {
          approval_type?: Database["public"]["Enums"]["creative_approval_type"]
          approved_at?: string
          approved_by?: string
          asset_id?: string
          id?: string
          project_id?: string
          signature_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_approvals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_approvals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "creative_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_assets: {
        Row: {
          drive_file_id: string | null
          drive_preview_url: string | null
          file_name: string
          file_type: Database["public"]["Enums"]["creative_file_type"]
          id: string
          is_active: boolean
          project_id: string
          status: Database["public"]["Enums"]["creative_asset_status"]
          uploaded_at: string
          uploaded_by: string | null
          version_nr: number
        }
        Insert: {
          drive_file_id?: string | null
          drive_preview_url?: string | null
          file_name: string
          file_type?: Database["public"]["Enums"]["creative_file_type"]
          id?: string
          is_active?: boolean
          project_id: string
          status?: Database["public"]["Enums"]["creative_asset_status"]
          uploaded_at?: string
          uploaded_by?: string | null
          version_nr?: number
        }
        Update: {
          drive_file_id?: string | null
          drive_preview_url?: string | null
          file_name?: string
          file_type?: Database["public"]["Enums"]["creative_file_type"]
          id?: string
          is_active?: boolean
          project_id?: string
          status?: Database["public"]["Enums"]["creative_asset_status"]
          uploaded_at?: string
          uploaded_by?: string | null
          version_nr?: number
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "creative_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_feedback: {
        Row: {
          asset_id: string
          author_name: string
          author_type: Database["public"]["Enums"]["creative_author_type"]
          comment: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          timestamp: string
        }
        Insert: {
          asset_id: string
          author_name: string
          author_type?: Database["public"]["Enums"]["creative_author_type"]
          comment: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          timestamp?: string
        }
        Update: {
          asset_id?: string
          author_name?: string
          author_type?: Database["public"]["Enums"]["creative_author_type"]
          comment?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_feedback_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_library: {
        Row: {
          analyzed: boolean | null
          analyzed_at: string | null
          branche: string | null
          created_at: string | null
          farben: Json | null
          figma_file_key: string
          figma_node_id: string
          figma_url: string | null
          format: string | null
          height: number | null
          hook_art: string | null
          id: string
          name: string | null
          performance_score: number | null
          thumbnail_url: string | null
          typ: string | null
          width: number | null
        }
        Insert: {
          analyzed?: boolean | null
          analyzed_at?: string | null
          branche?: string | null
          created_at?: string | null
          farben?: Json | null
          figma_file_key?: string
          figma_node_id: string
          figma_url?: string | null
          format?: string | null
          height?: number | null
          hook_art?: string | null
          id?: string
          name?: string | null
          performance_score?: number | null
          thumbnail_url?: string | null
          typ?: string | null
          width?: number | null
        }
        Update: {
          analyzed?: boolean | null
          analyzed_at?: string | null
          branche?: string | null
          created_at?: string | null
          farben?: Json | null
          figma_file_key?: string
          figma_node_id?: string
          figma_url?: string | null
          format?: string | null
          height?: number | null
          hook_art?: string | null
          id?: string
          name?: string | null
          performance_score?: number | null
          thumbnail_url?: string | null
          typ?: string | null
          width?: number | null
        }
        Relationships: []
      }
      creative_projects: {
        Row: {
          assigned_designer: string | null
          briefing_content: string | null
          client_id: string
          created_at: string
          deliverables: Json | null
          drive_folder_url: string | null
          due_date: string | null
          id: string
          meta_adset_id: string | null
          name: string
          notes: string | null
          review_token: string | null
          status: Database["public"]["Enums"]["creative_project_status"]
          updated_at: string
          vertical: Database["public"]["Enums"]["creative_vertical"]
        }
        Insert: {
          assigned_designer?: string | null
          briefing_content?: string | null
          client_id: string
          created_at?: string
          deliverables?: Json | null
          drive_folder_url?: string | null
          due_date?: string | null
          id?: string
          meta_adset_id?: string | null
          name: string
          notes?: string | null
          review_token?: string | null
          status?: Database["public"]["Enums"]["creative_project_status"]
          updated_at?: string
          vertical?: Database["public"]["Enums"]["creative_vertical"]
        }
        Update: {
          assigned_designer?: string | null
          briefing_content?: string | null
          client_id?: string
          created_at?: string
          deliverables?: Json | null
          drive_folder_url?: string | null
          due_date?: string | null
          id?: string
          meta_adset_id?: string | null
          name?: string
          notes?: string | null
          review_token?: string | null
          status?: Database["public"]["Enums"]["creative_project_status"]
          updated_at?: string
          vertical?: Database["public"]["Enums"]["creative_vertical"]
        }
        Relationships: [
          {
            foreignKeyName: "creative_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_connection: {
        Row: {
          access_token: string | null
          connected_at: string | null
          expires_at: string | null
          google_email: string | null
          id: string
          refresh_token: string | null
          root_folder_id: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          expires_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          root_folder_id?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          expires_at?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          root_folder_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      drive_folder_mappings: {
        Row: {
          created_at: string | null
          drive_folder_id: string
          drive_folder_name: string | null
          drive_folder_url: string | null
          entity_id: string | null
          entity_type: string
          folder_section: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          drive_folder_id: string
          drive_folder_name?: string | null
          drive_folder_url?: string | null
          entity_id?: string | null
          entity_type: string
          folder_section?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          drive_folder_id?: string
          drive_folder_name?: string | null
          drive_folder_url?: string | null
          entity_id?: string | null
          entity_type?: string
          folder_section?: string | null
          id?: string
        }
        Relationships: []
      }
      drive_pinned_files: {
        Row: {
          drive_file_id: string
          drive_url: string | null
          entity_id: string | null
          entity_type: string | null
          file_name: string | null
          id: string
          mime_type: string | null
          pinned_at: string | null
          pinned_by: string
          thumbnail_url: string | null
        }
        Insert: {
          drive_file_id: string
          drive_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          pinned_at?: string | null
          pinned_by: string
          thumbnail_url?: string | null
        }
        Update: {
          drive_file_id?: string
          drive_url?: string | null
          entity_id?: string | null
          entity_type?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          pinned_at?: string | null
          pinned_by?: string
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          created_at: string
          display_name: string | null
          email_address: string
          id: string
          imap_host: string
          imap_password_encrypted: string
          imap_port: number
          imap_secure: boolean
          imap_user: string
          is_active: boolean
          is_default: boolean
          last_polled_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          last_tested_at: string | null
          last_user_activity_at: string | null
          provider: string | null
          smtp_host: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email_address: string
          id?: string
          imap_host: string
          imap_password_encrypted: string
          imap_port?: number
          imap_secure?: boolean
          imap_user: string
          is_active?: boolean
          is_default?: boolean
          last_polled_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          last_user_activity_at?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email_address?: string
          id?: string
          imap_host?: string
          imap_password_encrypted?: string
          imap_port?: number
          imap_secure?: boolean
          imap_user?: string
          is_active?: boolean
          is_default?: boolean
          last_polled_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          last_user_activity_at?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_automation_executions: {
        Row: {
          account_id: string | null
          error: string | null
          executed_at: string
          id: string
          matched_keywords: string[] | null
          message_uid: number | null
          rule_id: string | null
          slack_message_id: string | null
          status: string
        }
        Insert: {
          account_id?: string | null
          error?: string | null
          executed_at?: string
          id?: string
          matched_keywords?: string[] | null
          message_uid?: number | null
          rule_id?: string | null
          slack_message_id?: string | null
          status?: string
        }
        Update: {
          account_id?: string | null
          error?: string | null
          executed_at?: string
          id?: string
          matched_keywords?: string[] | null
          message_uid?: number | null
          rule_id?: string | null
          slack_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_executions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "shared_email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          conditions: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_messages_cache: {
        Row: {
          account_id: string
          attachments: Json | null
          body_fetched_at: string | null
          body_html: string | null
          body_text: string | null
          cc_addresses: string[] | null
          date: string | null
          fetched_at: string
          flags: string[] | null
          folder: string
          from_address: string | null
          from_name: string | null
          has_attachment: boolean | null
          id: string
          message_id: string | null
          size_bytes: number | null
          snippet: string | null
          subject: string | null
          to_addresses: string[] | null
          uid: number
        }
        Insert: {
          account_id: string
          attachments?: Json | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          date?: string | null
          fetched_at?: string
          flags?: string[] | null
          folder: string
          from_address?: string | null
          from_name?: string | null
          has_attachment?: boolean | null
          id?: string
          message_id?: string | null
          size_bytes?: number | null
          snippet?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          uid: number
        }
        Update: {
          account_id?: string
          attachments?: Json | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          date?: string | null
          fetched_at?: string
          flags?: string[] | null
          folder?: string
          from_address?: string | null
          from_name?: string | null
          has_attachment?: boolean | null
          id?: string
          message_id?: string | null
          size_bytes?: number | null
          snippet?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          uid?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_cache_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_requests: {
        Row: {
          abteilung: string | null
          admin_notiz: string | null
          adresse: string | null
          created_at: string
          email: string
          geburtsdatum: string | null
          iban: string | null
          id: string
          nachname: string
          notfall_name: string | null
          notfall_telefon: string | null
          position: string | null
          profilbild_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          startdatum: string | null
          status: string
          telefon: string | null
          ueber_mich: string | null
          user_id: string | null
          vertragsart: string | null
          vorname: string
        }
        Insert: {
          abteilung?: string | null
          admin_notiz?: string | null
          adresse?: string | null
          created_at?: string
          email: string
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          nachname: string
          notfall_name?: string | null
          notfall_telefon?: string | null
          position?: string | null
          profilbild_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startdatum?: string | null
          status?: string
          telefon?: string | null
          ueber_mich?: string | null
          user_id?: string | null
          vertragsart?: string | null
          vorname: string
        }
        Update: {
          abteilung?: string | null
          admin_notiz?: string | null
          adresse?: string | null
          created_at?: string
          email?: string
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          nachname?: string
          notfall_name?: string | null
          notfall_telefon?: string | null
          position?: string | null
          profilbild_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          startdatum?: string | null
          status?: string
          telefon?: string | null
          ueber_mich?: string | null
          user_id?: string | null
          vertragsart?: string | null
          vorname?: string
        }
        Relationships: []
      }
      employment_contracts: {
        Row: {
          arbeitsstunden_pro_woche: number | null
          created_at: string
          drive_vertrag_url: string | null
          enddatum: string | null
          gehalt_brutto: number | null
          gehalt_netto: number | null
          id: string
          kuendigungsfrist: string | null
          member_id: string
          notizen: string | null
          probezeit_bis: string | null
          startdatum: string | null
          status: string | null
          urlaubstage: number | null
          vertragsart: string
        }
        Insert: {
          arbeitsstunden_pro_woche?: number | null
          created_at?: string
          drive_vertrag_url?: string | null
          enddatum?: string | null
          gehalt_brutto?: number | null
          gehalt_netto?: number | null
          id?: string
          kuendigungsfrist?: string | null
          member_id: string
          notizen?: string | null
          probezeit_bis?: string | null
          startdatum?: string | null
          status?: string | null
          urlaubstage?: number | null
          vertragsart?: string
        }
        Update: {
          arbeitsstunden_pro_woche?: number | null
          created_at?: string
          drive_vertrag_url?: string | null
          enddatum?: string | null
          gehalt_brutto?: number | null
          gehalt_netto?: number | null
          id?: string
          kuendigungsfrist?: string | null
          member_id?: string
          notizen?: string | null
          probezeit_bis?: string | null
          startdatum?: string | null
          status?: string | null
          urlaubstage?: number | null
          vertragsart?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_contracts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
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
      google_drive_connections: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string
          google_email: string
          id: string
          last_refreshed_at: string | null
          refresh_token: string
          scope: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at: string
          google_email: string
          id?: string
          last_refreshed_at?: string | null
          refresh_token: string
          scope: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string
          google_email?: string
          id?: string
          last_refreshed_at?: string | null
          refresh_token?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          access_token: string | null
          api_key: string | null
          api_secret: string | null
          config: Json | null
          connected: boolean | null
          created_at: string | null
          display_name: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          provider: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          api_secret?: string | null
          config?: Json | null
          connected?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          provider: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          api_secret?: string | null
          config?: Json | null
          connected?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          anteil_hhs: number | null
          anteil_vc: number | null
          art_des_projekts: string | null
          billing_entity: string | null
          brutto: number | null
          client_name: string | null
          close_deal_id: string | null
          created_at: string
          faelligkeitsdatum: string | null
          id: string
          invoice_nr: string
          leistungsdatum: string | null
          line_items: Json | null
          mwst_betrag: number | null
          mwst_rate: number | null
          netto: number | null
          notion_id: string | null
          notion_url: string | null
          pdf_url: string | null
          projekt_typ: string | null
          re_gesendet_am: string | null
          rechnungsnummer: string | null
          status: string | null
          updated_at: string
          zahldatum: string | null
          zahlstatus_notion: string | null
        }
        Insert: {
          anteil_hhs?: number | null
          anteil_vc?: number | null
          art_des_projekts?: string | null
          billing_entity?: string | null
          brutto?: number | null
          client_name?: string | null
          close_deal_id?: string | null
          created_at?: string
          faelligkeitsdatum?: string | null
          id?: string
          invoice_nr: string
          leistungsdatum?: string | null
          line_items?: Json | null
          mwst_betrag?: number | null
          mwst_rate?: number | null
          netto?: number | null
          notion_id?: string | null
          notion_url?: string | null
          pdf_url?: string | null
          projekt_typ?: string | null
          re_gesendet_am?: string | null
          rechnungsnummer?: string | null
          status?: string | null
          updated_at?: string
          zahldatum?: string | null
          zahlstatus_notion?: string | null
        }
        Update: {
          anteil_hhs?: number | null
          anteil_vc?: number | null
          art_des_projekts?: string | null
          billing_entity?: string | null
          brutto?: number | null
          client_name?: string | null
          close_deal_id?: string | null
          created_at?: string
          faelligkeitsdatum?: string | null
          id?: string
          invoice_nr?: string
          leistungsdatum?: string | null
          line_items?: Json | null
          mwst_betrag?: number | null
          mwst_rate?: number | null
          netto?: number | null
          notion_id?: string | null
          notion_url?: string | null
          pdf_url?: string | null
          projekt_typ?: string | null
          re_gesendet_am?: string | null
          rechnungsnummer?: string | null
          status?: string | null
          updated_at?: string
          zahldatum?: string | null
          zahlstatus_notion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_close_deal_id_fkey"
            columns: ["close_deal_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      kunde_close_deals: {
        Row: {
          close_lead_id: string
          close_lead_name: string | null
          close_opportunity_id: string
          date_won: string | null
          id: string
          kunde_id: string
          match_confidence: number | null
          match_reason: string | null
          match_type: string
          matched_at: string | null
          opportunity_currency: string | null
          opportunity_value: number | null
        }
        Insert: {
          close_lead_id: string
          close_lead_name?: string | null
          close_opportunity_id: string
          date_won?: string | null
          id?: string
          kunde_id: string
          match_confidence?: number | null
          match_reason?: string | null
          match_type: string
          matched_at?: string | null
          opportunity_currency?: string | null
          opportunity_value?: number | null
        }
        Update: {
          close_lead_id?: string
          close_lead_name?: string | null
          close_opportunity_id?: string
          date_won?: string | null
          id?: string
          kunde_id?: string
          match_confidence?: number | null
          match_reason?: string | null
          match_type?: string
          matched_at?: string | null
          opportunity_currency?: string | null
          opportunity_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kunde_close_deals_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      kunde_meta_accounts: {
        Row: {
          id: string
          kunde_id: string
          match_confidence: number | null
          match_type: string
          matched_at: string
          matched_by: string | null
          meta_account_id: string
          meta_account_name: string | null
        }
        Insert: {
          id?: string
          kunde_id: string
          match_confidence?: number | null
          match_type?: string
          matched_at?: string
          matched_by?: string | null
          meta_account_id: string
          meta_account_name?: string | null
        }
        Update: {
          id?: string
          kunde_id?: string
          match_confidence?: number | null
          match_type?: string
          matched_at?: string
          matched_by?: string | null
          meta_account_id?: string
          meta_account_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kunde_meta_accounts_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_insights: {
        Row: {
          ad_account_id: string
          ad_account_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          clicks: number | null
          cpl: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date_start: string
          date_stop: string
          id: string
          impressions: number | null
          leads: number | null
          reach: number | null
          spend: number | null
          synced_at: string | null
        }
        Insert: {
          ad_account_id: string
          ad_account_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date_start: string
          date_stop: string
          id?: string
          impressions?: number | null
          leads?: number | null
          reach?: number | null
          spend?: number | null
          synced_at?: string | null
        }
        Update: {
          ad_account_id?: string
          ad_account_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          clicks?: number | null
          cpl?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date_start?: string
          date_stop?: string
          id?: string
          impressions?: number | null
          leads?: number | null
          reach?: number | null
          spend?: number | null
          synced_at?: string | null
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          device_name: string | null
          device_token_hash: string
          id: string
          ip_address: string | null
          trusted_until: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          device_token_hash: string
          id?: string
          ip_address?: string | null
          trusted_until: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          device_token_hash?: string
          id?: string
          ip_address?: string | null
          trusted_until?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          desktop_push_enabled: boolean | null
          email_enabled: boolean | null
          email_sync_interval: number | null
          id: string
          intern_enabled: boolean | null
          slack_channels: Json | null
          slack_enabled: boolean | null
          sound_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          desktop_push_enabled?: boolean | null
          email_enabled?: boolean | null
          email_sync_interval?: number | null
          id?: string
          intern_enabled?: boolean | null
          slack_channels?: Json | null
          slack_enabled?: boolean | null
          sound_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          desktop_push_enabled?: boolean | null
          email_enabled?: boolean | null
          email_sync_interval?: number | null
          id?: string
          intern_enabled?: boolean | null
          slack_channels?: Json | null
          slack_enabled?: boolean | null
          sound_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          archived: boolean | null
          archived_at: string | null
          body: string | null
          channel: string
          created_at: string | null
          external_id: string | null
          external_thread_id: string | null
          id: string
          metadata: Json | null
          preview: string | null
          read: boolean | null
          reply_to_id: string | null
          sender_avatar: string | null
          sender_name: string | null
          source_avatar_url: string | null
          source_name: string | null
          tag: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          archived?: boolean | null
          archived_at?: string | null
          body?: string | null
          channel: string
          created_at?: string | null
          external_id?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json | null
          preview?: string | null
          read?: boolean | null
          reply_to_id?: string | null
          sender_avatar?: string | null
          sender_name?: string | null
          source_avatar_url?: string | null
          source_name?: string | null
          tag?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          archived?: boolean | null
          archived_at?: string | null
          body?: string | null
          channel?: string
          created_at?: string | null
          external_id?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json | null
          preview?: string | null
          read?: boolean | null
          reply_to_id?: string | null
          sender_avatar?: string | null
          sender_name?: string | null
          source_avatar_url?: string | null
          source_name?: string | null
          tag?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      onepage_project_leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          imported_via: string | null
          nachname: string | null
          nachricht: string | null
          name: string | null
          payload: Json
          phone: string | null
          project_id: string
          received_at: string
          source: string | null
          telefon: string | null
          unternehmen: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          vorname: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          imported_via?: string | null
          nachname?: string | null
          nachricht?: string | null
          name?: string | null
          payload?: Json
          phone?: string | null
          project_id: string
          received_at?: string
          source?: string | null
          telefon?: string | null
          unternehmen?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vorname?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          imported_via?: string | null
          nachname?: string | null
          nachricht?: string | null
          name?: string | null
          payload?: Json
          phone?: string | null
          project_id?: string
          received_at?: string
          source?: string | null
          telefon?: string | null
          unternehmen?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          vorname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onepage_project_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onepage_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onepage_project_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onepage_projects_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      onepage_projects: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          page_url: string | null
          status: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          page_url?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          page_url?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      onepage_webhook_logs: {
        Row: {
          content_type: string | null
          error: string | null
          id: string
          payload: Json | null
          project_id: string | null
          raw_body: string | null
          received_at: string
          status: string
          token: string | null
          user_agent: string | null
        }
        Insert: {
          content_type?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          raw_body?: string | null
          received_at?: string
          status?: string
          token?: string | null
          user_agent?: string | null
        }
        Update: {
          content_type?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          raw_body?: string | null
          received_at?: string
          status?: string
          token?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onepage_webhook_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onepage_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onepage_webhook_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onepage_projects_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_close_matches: {
        Row: {
          ai_reasoning: string | null
          close_lead_id: string
          close_lead_name: string | null
          created_at: string
          id: string
          kunde_id: string
          match_confidence: number
          match_reason: string | null
          match_type: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          ai_reasoning?: string | null
          close_lead_id: string
          close_lead_name?: string | null
          created_at?: string
          id?: string
          kunde_id: string
          match_confidence: number
          match_reason?: string | null
          match_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          ai_reasoning?: string | null
          close_lead_id?: string
          close_lead_name?: string | null
          created_at?: string
          id?: string
          kunde_id?: string
          match_confidence?: number
          match_reason?: string | null
          match_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_close_matches_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_meta_matches: {
        Row: {
          confidence: number
          created_at: string
          id: string
          kunde_id: string
          meta_account_id: string
          meta_account_name: string | null
          reasoning: string | null
          source: string
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          kunde_id: string
          meta_account_id: string
          meta_account_name?: string | null
          reasoning?: string | null
          source?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          kunde_id?: string
          meta_account_id?: string
          meta_account_name?: string | null
          reasoning?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_meta_matches_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipedrive_accounts: {
        Row: {
          api_token_encrypted: string
          color_hex: string | null
          created_at: string | null
          created_by: string | null
          domain: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          linked_kunde_id: string | null
          name: string
          pipedrive_company_name: string | null
          pipedrive_user_email: string | null
          pipedrive_user_id: number | null
          pipedrive_user_name: string | null
          sync_interval_minutes: number | null
          total_deals_synced: number | null
          total_persons_synced: number | null
          updated_at: string | null
        }
        Insert: {
          api_token_encrypted: string
          color_hex?: string | null
          created_at?: string | null
          created_by?: string | null
          domain: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          linked_kunde_id?: string | null
          name: string
          pipedrive_company_name?: string | null
          pipedrive_user_email?: string | null
          pipedrive_user_id?: number | null
          pipedrive_user_name?: string | null
          sync_interval_minutes?: number | null
          total_deals_synced?: number | null
          total_persons_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          api_token_encrypted?: string
          color_hex?: string | null
          created_at?: string | null
          created_by?: string | null
          domain?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          linked_kunde_id?: string | null
          name?: string
          pipedrive_company_name?: string | null
          pipedrive_user_email?: string | null
          pipedrive_user_id?: number | null
          pipedrive_user_name?: string | null
          sync_interval_minutes?: number | null
          total_deals_synced?: number | null
          total_persons_synced?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_accounts_linked_kunde_id_fkey"
            columns: ["linked_kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipedrive_deals: {
        Row: {
          account_id: string | null
          currency: string | null
          expected_close_date: string | null
          id: string
          org_name: string | null
          person_name: string | null
          pipedrive_id: number
          pipedrive_updated_at: string | null
          raw_data: Json | null
          stage_id: number | null
          stage_name: string | null
          status: string | null
          synced_at: string | null
          title: string | null
          value: number | null
        }
        Insert: {
          account_id?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          org_name?: string | null
          person_name?: string | null
          pipedrive_id: number
          pipedrive_updated_at?: string | null
          raw_data?: Json | null
          stage_id?: number | null
          stage_name?: string | null
          status?: string | null
          synced_at?: string | null
          title?: string | null
          value?: number | null
        }
        Update: {
          account_id?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          org_name?: string | null
          person_name?: string | null
          pipedrive_id?: number
          pipedrive_updated_at?: string | null
          raw_data?: Json | null
          stage_id?: number | null
          stage_name?: string | null
          status?: string | null
          synced_at?: string | null
          title?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_deals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pipedrive_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipedrive_persons: {
        Row: {
          account_id: string | null
          email: string[] | null
          id: string
          name: string | null
          org_name: string | null
          phone: string[] | null
          pipedrive_id: number
          raw_data: Json | null
          synced_at: string | null
        }
        Insert: {
          account_id?: string | null
          email?: string[] | null
          id?: string
          name?: string | null
          org_name?: string | null
          phone?: string[] | null
          pipedrive_id: number
          raw_data?: Json | null
          synced_at?: string | null
        }
        Update: {
          account_id?: string | null
          email?: string[] | null
          id?: string
          name?: string | null
          org_name?: string | null
          phone?: string[] | null
          pipedrive_id?: number
          raw_data?: Json | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_persons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pipedrive_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipedrive_pipelines: {
        Row: {
          account_id: string | null
          active: boolean | null
          id: string
          name: string | null
          pipedrive_id: number
          raw_data: Json | null
          synced_at: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean | null
          id?: string
          name?: string | null
          pipedrive_id: number
          raw_data?: Json | null
          synced_at?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean | null
          id?: string
          name?: string | null
          pipedrive_id?: number
          raw_data?: Json | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_pipelines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pipedrive_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipedrive_stages: {
        Row: {
          account_id: string | null
          id: string
          name: string | null
          order_nr: number | null
          pipedrive_id: number
          pipeline_id: number | null
          raw_data: Json | null
          synced_at: string | null
        }
        Insert: {
          account_id?: string | null
          id?: string
          name?: string | null
          order_nr?: number | null
          pipedrive_id: number
          pipeline_id?: number | null
          raw_data?: Json | null
          synced_at?: string | null
        }
        Update: {
          account_id?: string | null
          id?: string
          name?: string | null
          order_nr?: number | null
          pipedrive_id?: number
          pipeline_id?: number | null
          raw_data?: Json | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_stages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pipedrive_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      probewoche_candidates: {
        Row: {
          bewertung: number | null
          created_at: string
          email: string | null
          id: string
          name: string
          notizen: string | null
          position: string | null
          probewoche_end: string | null
          probewoche_start: string | null
          slack_account: string | null
          status: string | null
        }
        Insert: {
          bewertung?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notizen?: string | null
          position?: string | null
          probewoche_end?: string | null
          probewoche_start?: string | null
          slack_account?: string | null
          status?: string | null
        }
        Update: {
          bewertung?: number | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notizen?: string | null
          position?: string | null
          probewoche_end?: string | null
          probewoche_start?: string | null
          slack_account?: string | null
          status?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          ads_budget: number | null
          aktuelle_rate: number | null
          aktueller_monat: string | null
          branche: string[] | null
          cash_collect: number | null
          cash_collect_uebernommen: boolean | null
          client_id: string | null
          created_at: string
          deadline: string | null
          deadline_management: boolean | null
          deadline_mitarbeiter: boolean | null
          enddatum: string | null
          gesamt_saldo: number | null
          id: string
          laufzeit: string | null
          letztes_update: string | null
          mail_gesendet: boolean | null
          mitarbeiter: Json | null
          monat_leadanzahl: string | null
          name: string
          notion_id: string | null
          notion_url: string | null
          offener_cash_collect: number | null
          prioritaet: string | null
          projektname: string | null
          projektstatus: string | null
          projekttyp: string | null
          rate_1: number | null
          rate_2: number | null
          rate_3: number | null
          rate_4: number | null
          rate_5: number | null
          startdatum: string | null
          startdatum_abgehakt: boolean | null
          status: string
          typ: string[] | null
          umsatz_geschr_am: string | null
          updated_at: string
          verarbeitet: boolean | null
          verknuepfte_aufgaben_ids: string[] | null
          verknuepfte_kunden: string[] | null
          verknuepfte_kunden_ids: string[] | null
          verknuepfte_mitarbeiter_ids: string[] | null
          zahldatum: string | null
          zahlstatus: string | null
        }
        Insert: {
          ads_budget?: number | null
          aktuelle_rate?: number | null
          aktueller_monat?: string | null
          branche?: string[] | null
          cash_collect?: number | null
          cash_collect_uebernommen?: boolean | null
          client_id?: string | null
          created_at?: string
          deadline?: string | null
          deadline_management?: boolean | null
          deadline_mitarbeiter?: boolean | null
          enddatum?: string | null
          gesamt_saldo?: number | null
          id?: string
          laufzeit?: string | null
          letztes_update?: string | null
          mail_gesendet?: boolean | null
          mitarbeiter?: Json | null
          monat_leadanzahl?: string | null
          name: string
          notion_id?: string | null
          notion_url?: string | null
          offener_cash_collect?: number | null
          prioritaet?: string | null
          projektname?: string | null
          projektstatus?: string | null
          projekttyp?: string | null
          rate_1?: number | null
          rate_2?: number | null
          rate_3?: number | null
          rate_4?: number | null
          rate_5?: number | null
          startdatum?: string | null
          startdatum_abgehakt?: boolean | null
          status?: string
          typ?: string[] | null
          umsatz_geschr_am?: string | null
          updated_at?: string
          verarbeitet?: boolean | null
          verknuepfte_aufgaben_ids?: string[] | null
          verknuepfte_kunden?: string[] | null
          verknuepfte_kunden_ids?: string[] | null
          verknuepfte_mitarbeiter_ids?: string[] | null
          zahldatum?: string | null
          zahlstatus?: string | null
        }
        Update: {
          ads_budget?: number | null
          aktuelle_rate?: number | null
          aktueller_monat?: string | null
          branche?: string[] | null
          cash_collect?: number | null
          cash_collect_uebernommen?: boolean | null
          client_id?: string | null
          created_at?: string
          deadline?: string | null
          deadline_management?: boolean | null
          deadline_mitarbeiter?: boolean | null
          enddatum?: string | null
          gesamt_saldo?: number | null
          id?: string
          laufzeit?: string | null
          letztes_update?: string | null
          mail_gesendet?: boolean | null
          mitarbeiter?: Json | null
          monat_leadanzahl?: string | null
          name?: string
          notion_id?: string | null
          notion_url?: string | null
          offener_cash_collect?: number | null
          prioritaet?: string | null
          projektname?: string | null
          projektstatus?: string | null
          projekttyp?: string | null
          rate_1?: number | null
          rate_2?: number | null
          rate_3?: number | null
          rate_4?: number | null
          rate_5?: number | null
          startdatum?: string | null
          startdatum_abgehakt?: boolean | null
          status?: string
          typ?: string[] | null
          umsatz_geschr_am?: string | null
          updated_at?: string
          verarbeitet?: boolean | null
          verknuepfte_aufgaben_ids?: string[] | null
          verknuepfte_kunden?: string[] | null
          verknuepfte_kunden_ids?: string[] | null
          verknuepfte_mitarbeiter_ids?: string[] | null
          zahldatum?: string | null
          zahlstatus?: string | null
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
      qonto_transactions: {
        Row: {
          amount_cents: number | null
          amount_currency: string | null
          attachment_ids: Json | null
          category: string | null
          counterparty_name: string | null
          created_at: string | null
          direction: string | null
          emitted_at: string | null
          id: string
          label: string | null
          qonto_id: string
          raw: Json | null
          reference: string | null
          settled_at: string | null
          status: string | null
        }
        Insert: {
          amount_cents?: number | null
          amount_currency?: string | null
          attachment_ids?: Json | null
          category?: string | null
          counterparty_name?: string | null
          created_at?: string | null
          direction?: string | null
          emitted_at?: string | null
          id?: string
          label?: string | null
          qonto_id: string
          raw?: Json | null
          reference?: string | null
          settled_at?: string | null
          status?: string | null
        }
        Update: {
          amount_cents?: number | null
          amount_currency?: string | null
          attachment_ids?: Json | null
          category?: string | null
          counterparty_name?: string | null
          created_at?: string | null
          direction?: string | null
          emitted_at?: string | null
          id?: string
          label?: string | null
          qonto_id?: string
          raw?: Json | null
          reference?: string | null
          settled_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      recurring_revenues: {
        Row: {
          client_name: string
          close_deal_id: string | null
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean | null
          monthly_amount: number | null
          start_date: string | null
        }
        Insert: {
          client_name: string
          close_deal_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          monthly_amount?: number | null
          start_date?: string | null
        }
        Update: {
          client_name?: string
          close_deal_id?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          monthly_amount?: number | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_revenues_close_deal_id_fkey"
            columns: ["close_deal_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      referenz_meta_ads: {
        Row: {
          ad_format: string | null
          campaign_period_end: string | null
          campaign_period_start: string | null
          created_by: string | null
          custom_description: string | null
          custom_performance_notes: string | null
          custom_tags: string[] | null
          custom_title: string | null
          display_order: number | null
          filter_values: Json | null
          id: string
          imported_at: string | null
          is_active: boolean | null
          is_featured: boolean | null
          linked_kunde_id: string | null
          meta_account_id: string
          meta_account_name: string | null
          meta_ad_id: string
          meta_ad_name: string | null
          meta_adset_id: string | null
          meta_adset_name: string | null
          meta_campaign_id: string | null
          meta_campaign_name: string | null
          meta_creative_id: string | null
          meta_metrics: Json | null
          metrics_last_refreshed_at: string | null
          preview_url: string | null
          thumbnail_url: string | null
          thumbnail_url_meta: string | null
          thumbnail_url_persisted: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          ad_format?: string | null
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          created_by?: string | null
          custom_description?: string | null
          custom_performance_notes?: string | null
          custom_tags?: string[] | null
          custom_title?: string | null
          display_order?: number | null
          filter_values?: Json | null
          id?: string
          imported_at?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          meta_account_id: string
          meta_account_name?: string | null
          meta_ad_id: string
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          meta_creative_id?: string | null
          meta_metrics?: Json | null
          metrics_last_refreshed_at?: string | null
          preview_url?: string | null
          thumbnail_url?: string | null
          thumbnail_url_meta?: string | null
          thumbnail_url_persisted?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          ad_format?: string | null
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          created_by?: string | null
          custom_description?: string | null
          custom_performance_notes?: string | null
          custom_tags?: string[] | null
          custom_title?: string | null
          display_order?: number | null
          filter_values?: Json | null
          id?: string
          imported_at?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          meta_account_id?: string
          meta_account_name?: string | null
          meta_ad_id?: string
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          meta_creative_id?: string | null
          meta_metrics?: Json | null
          metrics_last_refreshed_at?: string | null
          preview_url?: string | null
          thumbnail_url?: string | null
          thumbnail_url_meta?: string | null
          thumbnail_url_persisted?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referenz_meta_ads_linked_kunde_id_fkey"
            columns: ["linked_kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      referenz_meta_campaigns: {
        Row: {
          campaign_period_end: string | null
          campaign_period_start: string | null
          created_by: string | null
          custom_description: string | null
          custom_results_summary: string | null
          custom_setup_notes: string | null
          custom_tags: string[] | null
          custom_title: string | null
          display_order: number | null
          filter_values: Json | null
          id: string
          imported_at: string | null
          is_active: boolean | null
          is_featured: boolean | null
          linked_kunde_id: string | null
          meta_account_id: string
          meta_account_name: string | null
          meta_campaign_id: string
          meta_campaign_name: string | null
          meta_objective: string | null
          meta_status: string | null
          metrics: Json | null
          metrics_last_refreshed_at: string | null
          total_ads_count: number | null
          total_adsets_count: number | null
          updated_at: string | null
        }
        Insert: {
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          created_by?: string | null
          custom_description?: string | null
          custom_results_summary?: string | null
          custom_setup_notes?: string | null
          custom_tags?: string[] | null
          custom_title?: string | null
          display_order?: number | null
          filter_values?: Json | null
          id?: string
          imported_at?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          meta_account_id: string
          meta_account_name?: string | null
          meta_campaign_id: string
          meta_campaign_name?: string | null
          meta_objective?: string | null
          meta_status?: string | null
          metrics?: Json | null
          metrics_last_refreshed_at?: string | null
          total_ads_count?: number | null
          total_adsets_count?: number | null
          updated_at?: string | null
        }
        Update: {
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          created_by?: string | null
          custom_description?: string | null
          custom_results_summary?: string | null
          custom_setup_notes?: string | null
          custom_tags?: string[] | null
          custom_title?: string | null
          display_order?: number | null
          filter_values?: Json | null
          id?: string
          imported_at?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          meta_account_id?: string
          meta_account_name?: string | null
          meta_campaign_id?: string
          meta_campaign_name?: string | null
          meta_objective?: string | null
          meta_status?: string | null
          metrics?: Json | null
          metrics_last_refreshed_at?: string | null
          total_ads_count?: number | null
          total_adsets_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referenz_meta_campaigns_linked_kunde_id_fkey"
            columns: ["linked_kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      referenz_showcase: {
        Row: {
          ad_format: string | null
          ad_platform: string | null
          branche: string | null
          campaign_period_end: string | null
          campaign_period_start: string | null
          client_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          fallback_image_url: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          linked_kunde_id: string | null
          metrics: Json | null
          preview_image_url: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string | null
          video_url: string | null
          website_url: string | null
        }
        Insert: {
          ad_format?: string | null
          ad_platform?: string | null
          branche?: string | null
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          client_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          fallback_image_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          metrics?: Json | null
          preview_image_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string | null
          video_url?: string | null
          website_url?: string | null
        }
        Update: {
          ad_format?: string | null
          ad_platform?: string | null
          branche?: string | null
          campaign_period_end?: string | null
          campaign_period_start?: string | null
          client_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          fallback_image_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          linked_kunde_id?: string | null
          metrics?: Json | null
          preview_image_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          video_url?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referenz_showcase_linked_kunde_id_fkey"
            columns: ["linked_kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      rejected_meta_matches: {
        Row: {
          id: string
          kunde_id: string
          meta_account_id: string
          rejected_at: string
          rejected_by: string | null
        }
        Insert: {
          id?: string
          kunde_id: string
          meta_account_id: string
          rejected_at?: string
          rejected_by?: string | null
        }
        Update: {
          id?: string
          kunde_id?: string
          meta_account_id?: string
          rejected_at?: string
          rejected_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rejected_meta_matches_kunde_id_fkey"
            columns: ["kunde_id"]
            isOneToOne: false
            referencedRelation: "close_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          betrag_brutto: number | null
          betrag_netto: number | null
          created_at: string
          id: string
          member_id: string
          monat: string
          notizen: string | null
          status: string | null
          ueberwiesen_am: string | null
        }
        Insert: {
          betrag_brutto?: number | null
          betrag_netto?: number | null
          created_at?: string
          id?: string
          member_id: string
          monat: string
          notizen?: string | null
          status?: string | null
          ueberwiesen_am?: string | null
        }
        Update: {
          betrag_brutto?: number | null
          betrag_netto?: number | null
          created_at?: string
          id?: string
          member_id?: string
          monat?: string
          notizen?: string | null
          status?: string | null
          ueberwiesen_am?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team"
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
      shared_email_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          email_address: string
          id: string
          imap_host: string
          imap_password_encrypted: string
          imap_port: number
          imap_secure: boolean
          imap_user: string
          is_active: boolean
          is_default: boolean
          last_polled_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          last_tested_at: string | null
          provider: string | null
          smtp_host: string | null
          smtp_password_encrypted: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email_address: string
          id?: string
          imap_host: string
          imap_password_encrypted: string
          imap_port?: number
          imap_secure?: boolean
          imap_user: string
          is_active?: boolean
          is_default?: boolean
          last_polled_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email_address?: string
          id?: string
          imap_host?: string
          imap_password_encrypted?: string
          imap_port?: number
          imap_secure?: boolean
          imap_user?: string
          is_active?: boolean
          is_default?: boolean
          last_polled_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          last_tested_at?: string | null
          provider?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shared_email_messages_cache: {
        Row: {
          account_id: string
          attachments: Json | null
          body_fetched_at: string | null
          body_html: string | null
          body_text: string | null
          cc_addresses: string[] | null
          date: string | null
          fetched_at: string
          flags: string[] | null
          folder: string
          from_address: string | null
          from_name: string | null
          has_attachment: boolean | null
          id: string
          message_id: string | null
          size_bytes: number | null
          snippet: string | null
          subject: string | null
          to_addresses: string[] | null
          uid: number
        }
        Insert: {
          account_id: string
          attachments?: Json | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          date?: string | null
          fetched_at?: string
          flags?: string[] | null
          folder: string
          from_address?: string | null
          from_name?: string | null
          has_attachment?: boolean | null
          id?: string
          message_id?: string | null
          size_bytes?: number | null
          snippet?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          uid: number
        }
        Update: {
          account_id?: string
          attachments?: Json | null
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_addresses?: string[] | null
          date?: string | null
          fetched_at?: string
          flags?: string[] | null
          folder?: string
          from_address?: string | null
          from_name?: string | null
          has_attachment?: boolean | null
          id?: string
          message_id?: string | null
          size_bytes?: number | null
          snippet?: string | null
          subject?: string | null
          to_addresses?: string[] | null
          uid?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_email_messages_cache_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "shared_email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      showcase_filter_categories: {
        Row: {
          applies_to: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_auto_synced: boolean
          is_required: boolean | null
          key: string
          label: string
          synced_from_field: string | null
          updated_at: string | null
        }
        Insert: {
          applies_to: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_synced?: boolean
          is_required?: boolean | null
          key: string
          label: string
          synced_from_field?: string | null
          updated_at?: string | null
        }
        Update: {
          applies_to?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_synced?: boolean
          is_required?: boolean | null
          key?: string
          label?: string
          synced_from_field?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      showcase_filter_options: {
        Row: {
          category_id: string
          color_hex: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_auto_synced: boolean
          key: string
          label: string
        }
        Insert: {
          category_id: string
          color_hex?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_synced?: boolean
          key: string
          label: string
        }
        Update: {
          category_id?: string
          color_hex?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_synced?: boolean
          key?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "showcase_filter_options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "showcase_filter_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          error_stack: string | null
          error_type: string | null
          id: string
          page_url: string | null
          priority: string | null
          slack_message_ts: string | null
          status: string | null
          ticket_nr: string
          updated_at: string | null
          user_email: string | null
          user_id: string | null
          user_message: string
          user_name: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          id?: string
          page_url?: string | null
          priority?: string | null
          slack_message_ts?: string | null
          status?: string | null
          ticket_nr?: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_message: string
          user_name?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          id?: string
          page_url?: string | null
          priority?: string | null
          slack_message_ts?: string | null
          status?: string | null
          ticket_nr?: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_message?: string
          user_name?: string | null
        }
        Relationships: []
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
          notion_id: string | null
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
          notion_id?: string | null
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
          notion_id?: string | null
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
          abteilung: string[] | null
          avatar_url: string | null
          created_at: string
          department: string | null
          display_category: string | null
          einstiegsdatum: string | null
          email: string | null
          gehalt: number | null
          gehalt_typ: string | null
          id: string
          mitarbeiter_status: string | null
          mitarbeiter_typ: string | null
          must_change_password: boolean | null
          name: string
          nda_unterschrieben: boolean | null
          notion_id: string | null
          notion_url: string | null
          notizen: string | null
          onboarding_abgeschlossen: boolean | null
          onboarding_completed_at: string | null
          password_changed_at: string | null
          portal_rolle: string | null
          position: string | null
          probezeit_ende: string | null
          rolle: Database["public"]["Enums"]["team_rolle"]
          startdatum: string | null
          telefonnummer: string | null
          updated_at: string
          verfuegbarkeit_h_woche: number | null
          vertrag_beginn: string | null
          vertrag_ende: string | null
          vertrag_typ: string | null
          wochenstunden: number | null
          zugaenge: string[] | null
        }
        Insert: {
          abteilung?: string[] | null
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_category?: string | null
          einstiegsdatum?: string | null
          email?: string | null
          gehalt?: number | null
          gehalt_typ?: string | null
          id?: string
          mitarbeiter_status?: string | null
          mitarbeiter_typ?: string | null
          must_change_password?: boolean | null
          name: string
          nda_unterschrieben?: boolean | null
          notion_id?: string | null
          notion_url?: string | null
          notizen?: string | null
          onboarding_abgeschlossen?: boolean | null
          onboarding_completed_at?: string | null
          password_changed_at?: string | null
          portal_rolle?: string | null
          position?: string | null
          probezeit_ende?: string | null
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          telefonnummer?: string | null
          updated_at?: string
          verfuegbarkeit_h_woche?: number | null
          vertrag_beginn?: string | null
          vertrag_ende?: string | null
          vertrag_typ?: string | null
          wochenstunden?: number | null
          zugaenge?: string[] | null
        }
        Update: {
          abteilung?: string[] | null
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_category?: string | null
          einstiegsdatum?: string | null
          email?: string | null
          gehalt?: number | null
          gehalt_typ?: string | null
          id?: string
          mitarbeiter_status?: string | null
          mitarbeiter_typ?: string | null
          must_change_password?: boolean | null
          name?: string
          nda_unterschrieben?: boolean | null
          notion_id?: string | null
          notion_url?: string | null
          notizen?: string | null
          onboarding_abgeschlossen?: boolean | null
          onboarding_completed_at?: string | null
          password_changed_at?: string | null
          portal_rolle?: string | null
          position?: string | null
          probezeit_ende?: string | null
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          telefonnummer?: string | null
          updated_at?: string
          verfuegbarkeit_h_woche?: number | null
          vertrag_beginn?: string | null
          vertrag_ende?: string | null
          vertrag_typ?: string | null
          wochenstunden?: number | null
          zugaenge?: string[] | null
        }
        Relationships: []
      }
      team_hr_data: {
        Row: {
          adresse_land: string | null
          adresse_ort: string | null
          adresse_plz: string | null
          adresse_strasse: string | null
          bank_name: string | null
          bic: string | null
          created_at: string
          familienstand: string | null
          geburtsdatum: string | null
          geburtsort: string | null
          iban: string | null
          kinder_anzahl: number | null
          konfession: string | null
          krankenkasse: string | null
          krankenversicherung_nummer: string | null
          notfallkontakt_beziehung: string | null
          notfallkontakt_name: string | null
          notfallkontakt_telefon: string | null
          rentenversicherungsnummer: string | null
          sozialversicherungsnummer: string | null
          staatsangehoerigkeit: string | null
          steuer_id: string | null
          steuerklasse: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          familienstand?: string | null
          geburtsdatum?: string | null
          geburtsort?: string | null
          iban?: string | null
          kinder_anzahl?: number | null
          konfession?: string | null
          krankenkasse?: string | null
          krankenversicherung_nummer?: string | null
          notfallkontakt_beziehung?: string | null
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          rentenversicherungsnummer?: string | null
          sozialversicherungsnummer?: string | null
          staatsangehoerigkeit?: string | null
          steuer_id?: string | null
          steuerklasse?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          adresse_land?: string | null
          adresse_ort?: string | null
          adresse_plz?: string | null
          adresse_strasse?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          familienstand?: string | null
          geburtsdatum?: string | null
          geburtsort?: string | null
          iban?: string | null
          kinder_anzahl?: number | null
          konfession?: string | null
          krankenkasse?: string | null
          krankenversicherung_nummer?: string | null
          notfallkontakt_beziehung?: string | null
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          rentenversicherungsnummer?: string | null
          sozialversicherungsnummer?: string | null
          staatsangehoerigkeit?: string | null
          steuer_id?: string | null
          steuerklasse?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          client_id: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          notes: string | null
          started_at: string
          stopped_at: string | null
          task_id: string | null
          task_label: string | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          started_at: string
          stopped_at?: string | null
          task_id?: string | null
          task_label?: string | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          started_at?: string
          stopped_at?: string | null
          task_id?: string | null
          task_label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      time_off_requests: {
        Row: {
          anmerkung: string | null
          bis: string
          created_at: string
          entschieden_von: string | null
          id: string
          member_id: string
          status: string | null
          tage: number | null
          typ: string
          von: string
        }
        Insert: {
          anmerkung?: string | null
          bis: string
          created_at?: string
          entschieden_von?: string | null
          id?: string
          member_id: string
          status?: string | null
          tage?: number | null
          typ?: string
          von: string
        }
        Update: {
          anmerkung?: string | null
          bis?: string
          created_at?: string
          entschieden_von?: string | null
          id?: string
          member_id?: string
          status?: string | null
          tage?: number | null
          typ?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_entschieden_von_fkey"
            columns: ["entschieden_von"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mfa_status: {
        Row: {
          last_enrolled_factor_id: string | null
          mfa_enrolled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_enrolled_factor_id?: string | null
          mfa_enrolled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_enrolled_factor_id?: string | null
          mfa_enrolled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_manage_settings: boolean
          can_view_close: boolean
          can_view_finanzen: boolean
          can_view_fulfillment: boolean
          can_view_kunden: boolean
          can_view_meta_ads: boolean
          can_view_projekte: boolean
          can_view_sales_kpis: boolean
          can_view_team_hr: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_manage_settings?: boolean
          can_view_close?: boolean
          can_view_finanzen?: boolean
          can_view_fulfillment?: boolean
          can_view_kunden?: boolean
          can_view_meta_ads?: boolean
          can_view_projekte?: boolean
          can_view_sales_kpis?: boolean
          can_view_team_hr?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_manage_settings?: boolean
          can_view_close?: boolean
          can_view_finanzen?: boolean
          can_view_fulfillment?: boolean
          can_view_kunden?: boolean
          can_view_meta_ads?: boolean
          can_view_projekte?: boolean
          can_view_sales_kpis?: boolean
          can_view_team_hr?: boolean
          updated_at?: string
          user_id?: string
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
      vertriebsakademie_progress: {
        Row: {
          chapter: string
          completed_at: string | null
          created_at: string
          id: string
          lesson: string | null
          status: string | null
          team_member_id: string
        }
        Insert: {
          chapter: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson?: string | null
          status?: string | null
          team_member_id: string
        }
        Update: {
          chapter?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          lesson?: string | null
          status?: string | null
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vertriebsakademie_progress_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
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
      wiki_pages: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          parent_id: string | null
          section: string | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id?: string | null
          section?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id?: string | null
          section?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "wiki_pages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      onepage_projects_with_stats: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          last_lead_at: string | null
          lead_count_30d: number | null
          lead_count_7d: number | null
          lead_count_total: number | null
          name: string | null
          notes: string | null
          page_url: string | null
          status: string | null
          updated_at: string | null
          webhook_secret: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      decrypt_imap_password: {
        Args: { encrypted: string; encryption_key: string }
        Returns: string
      }
      encrypt_imap_password: {
        Args: { encryption_key: string; password: string }
        Returns: string
      }
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
      creative_approval_type: "Intern" | "Kunde"
      creative_asset_status:
        | "Draft"
        | "Interner Review"
        | "Feedback erhalten"
        | "Überarbeitung"
        | "Freigegeben"
        | "Abgelehnt"
      creative_author_type: "Intern" | "Kunde"
      creative_file_type: "image" | "video" | "carousel"
      creative_project_status:
        | "Briefing"
        | "In Produktion"
        | "Interner Review"
        | "Kunde Review"
        | "Änderungen nötig"
        | "Freigegeben"
        | "Live"
        | "Archiviert"
      creative_vertical:
        | "PKV"
        | "BU"
        | "Rechtsschutz"
        | "Altersvorsorge"
        | "Sonstiges"
      finanz_typ: "Einnahme" | "Ausgabe"
      kundenstatus: "In Betreuung" | "Pausiert" | "Churned" | "Lead"
      team_rolle:
        | "Admin"
        | "Account-Manager"
        | "Setter"
        | "Closer"
        | "Management"
        | "Fulfillment"
        | "Freelancer"
        | "GF"
        | "Vollzeit"
        | "Teilzeit"
        | "Minijob"
        | "Werkstudent"
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
      creative_approval_type: ["Intern", "Kunde"],
      creative_asset_status: [
        "Draft",
        "Interner Review",
        "Feedback erhalten",
        "Überarbeitung",
        "Freigegeben",
        "Abgelehnt",
      ],
      creative_author_type: ["Intern", "Kunde"],
      creative_file_type: ["image", "video", "carousel"],
      creative_project_status: [
        "Briefing",
        "In Produktion",
        "Interner Review",
        "Kunde Review",
        "Änderungen nötig",
        "Freigegeben",
        "Live",
        "Archiviert",
      ],
      creative_vertical: [
        "PKV",
        "BU",
        "Rechtsschutz",
        "Altersvorsorge",
        "Sonstiges",
      ],
      finanz_typ: ["Einnahme", "Ausgabe"],
      kundenstatus: ["In Betreuung", "Pausiert", "Churned", "Lead"],
      team_rolle: [
        "Admin",
        "Account-Manager",
        "Setter",
        "Closer",
        "Management",
        "Fulfillment",
        "Freelancer",
        "GF",
        "Vollzeit",
        "Teilzeit",
        "Minijob",
        "Werkstudent",
      ],
    },
  },
} as const
