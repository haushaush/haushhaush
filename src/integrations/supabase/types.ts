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
          ampelstatus: string | null
          art: string | null
          assigned_to: string | null
          client_name: string
          close_lead_id: string | null
          close_opportunity_url: string | null
          created_at: string
          deal_type: string | null
          health_score: number | null
          id: string
          laufzeit_monate: number | null
          leistungen: Json | null
          meta_ad_account_id: string | null
          notes: Json | null
          onepage_url: string | null
          start_datum: string | null
          status: string | null
          updated_at: string
          wert_eur: number | null
          zahlstatus: string | null
        }
        Insert: {
          ampelstatus?: string | null
          art?: string | null
          assigned_to?: string | null
          client_name: string
          close_lead_id?: string | null
          close_opportunity_url?: string | null
          created_at?: string
          deal_type?: string | null
          health_score?: number | null
          id?: string
          laufzeit_monate?: number | null
          leistungen?: Json | null
          meta_ad_account_id?: string | null
          notes?: Json | null
          onepage_url?: string | null
          start_datum?: string | null
          status?: string | null
          updated_at?: string
          wert_eur?: number | null
          zahlstatus?: string | null
        }
        Update: {
          ampelstatus?: string | null
          art?: string | null
          assigned_to?: string | null
          client_name?: string
          close_lead_id?: string | null
          close_opportunity_url?: string | null
          created_at?: string
          deal_type?: string | null
          health_score?: number | null
          id?: string
          laufzeit_monate?: number | null
          leistungen?: Json | null
          meta_ad_account_id?: string | null
          notes?: Json | null
          onepage_url?: string | null
          start_datum?: string | null
          status?: string | null
          updated_at?: string
          wert_eur?: number | null
          zahlstatus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "close_deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team"
            referencedColumns: ["id"]
          },
        ]
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
      invoices: {
        Row: {
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
          pdf_url: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
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
          pdf_url?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
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
          pdf_url?: string | null
          status?: string | null
          updated_at?: string
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
          department: string | null
          email: string
          id: string
          name: string
          rolle: Database["public"]["Enums"]["team_rolle"]
          startdatum: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          id?: string
          name: string
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          name?: string
          rolle?: Database["public"]["Enums"]["team_rolle"]
          startdatum?: string | null
          updated_at?: string
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
      team_rolle: ["Admin", "Account-Manager", "Setter", "Closer"],
    },
  },
} as const
