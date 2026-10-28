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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      _q31_test_stage: {
        Row: {
          name: string
          run: boolean
          script: string
        }
        Insert: {
          name: string
          run?: boolean
          script: string
        }
        Update: {
          name?: string
          run?: boolean
          script?: string
        }
        Relationships: []
      }
      _q69_suites: {
        Row: {
          name: string
          result: string | null
          script: string
        }
        Insert: {
          name: string
          result?: string | null
          script: string
        }
        Update: {
          name?: string
          result?: string | null
          script?: string
        }
        Relationships: []
      }
      action_items: {
        Row: {
          action_required: string | null
          client_id: string
          comments: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          drop_reason: string | null
          due_date: string | null
          evidence_url: string | null
          id: string
          issue: string
          link_ref: string | null
          pipeline_id: string | null
          priority: Database["public"]["Enums"]["action_priority"]
          responsible_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          updated_at: string
        }
        Insert: {
          action_required?: string | null
          client_id: string
          comments?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          drop_reason?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          issue: string
          link_ref?: string | null
          pipeline_id?: string | null
          priority?: Database["public"]["Enums"]["action_priority"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
        }
        Update: {
          action_required?: string | null
          client_id?: string
          comments?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          drop_reason?: string | null
          due_date?: string | null
          evidence_url?: string | null
          id?: string
          issue?: string
          link_ref?: string | null
          pipeline_id?: string | null
          priority?: Database["public"]["Enums"]["action_priority"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_holidays: {
        Row: {
          day: string
          name: string
        }
        Insert: {
          day: string
          name: string
        }
        Update: {
          day?: string
          name?: string
        }
        Relationships: []
      }
      activity_items: {
        Row: {
          activity_type_id: string | null
          backup_id: string
          id: string
          name: string
          occurrence_key: string
          owner_id: string
          plan_id: string
          publish_on: string
          quantity: number
        }
        Insert: {
          activity_type_id?: string | null
          backup_id: string
          id?: string
          name: string
          occurrence_key?: string
          owner_id: string
          plan_id: string
          publish_on: string
          quantity: number
        }
        Update: {
          activity_type_id?: string | null
          backup_id?: string
          id?: string
          name?: string
          occurrence_key?: string
          owner_id?: string
          plan_id?: string
          publish_on?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_items_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_items_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "activity_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_pipeline_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          month: string
          previous_id: string | null
          status: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          month: string
          previous_id?: string | null
          status?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          month?: string
          previous_id?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_plans_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_plans_previous_id_fkey"
            columns: ["previous_id"]
            isOneToOne: false
            referencedRelation: "activity_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_task_history: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          new_due: string | null
          old_due: string | null
          reason: string | null
          task_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          new_due?: string | null
          old_due?: string | null
          reason?: string | null
          task_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          new_due?: string | null
          old_due?: string | null
          reason?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_types: {
        Row: {
          active: boolean
          id: string
          name: string
          pipeline_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          pipeline_id: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          pipeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_types_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      addons_catalogue: {
        Row: {
          active: boolean
          billing: string
          code: string
          description: string | null
          id: string
          name: string
          price_inr: number | null
          price_type: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          billing?: string
          code: string
          description?: string | null
          id?: string
          name: string
          price_inr?: number | null
          price_type?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          billing?: string
          code?: string
          description?: string | null
          id?: string
          name?: string
          price_inr?: number | null
          price_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          id: string
          outcome: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          outcome?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          outcome?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      bd_targets: {
        Row: {
          bd_user_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          kind: string
          notes: string | null
          period_start: string | null
          plan_code: string | null
          source: string | null
          target_value: number
        }
        Insert: {
          bd_user_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kind: string
          notes?: string | null
          period_start?: string | null
          plan_code?: string | null
          source?: string | null
          target_value: number
        }
        Update: {
          bd_user_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          period_start?: string | null
          plan_code?: string | null
          source?: string | null
          target_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "bd_targets_bd_user_id_fkey"
            columns: ["bd_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_guest_contacts: {
        Row: {
          booking_id: string
          guest_email: string | null
          guest_phone: string | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          guest_email?: string | null
          guest_phone?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          guest_email?: string | null
          guest_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_guest_contacts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          adults: number | null
          advance_deposit_date: string | null
          advance_inr: number | null
          advance_pct: number | null
          booked_on: string | null
          category: string | null
          check_in: string | null
          check_out: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deal_inr: number
          due_balance_inr: number | null
          guest_city: string | null
          guest_name: string | null
          id: string
          import_flags: string[]
          import_key: string | null
          infants: number | null
          is_demo: boolean
          kids: number | null
          meal_plan: string | null
          nights: number | null
          package: string | null
          package_note: string | null
          room_category: string | null
          rooms: number | null
          sales_person_id: string | null
          sales_person_name: string | null
          source: string | null
          special_request: string | null
          status: string
          stay_month: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          adults?: number | null
          advance_deposit_date?: string | null
          advance_inr?: number | null
          advance_pct?: number | null
          booked_on?: string | null
          category?: string | null
          check_in?: string | null
          check_out?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deal_inr?: number
          due_balance_inr?: number | null
          guest_city?: string | null
          guest_name?: string | null
          id?: string
          import_flags?: string[]
          import_key?: string | null
          infants?: number | null
          is_demo?: boolean
          kids?: number | null
          meal_plan?: string | null
          nights?: number | null
          package?: string | null
          package_note?: string | null
          room_category?: string | null
          rooms?: number | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string | null
          special_request?: string | null
          status?: string
          stay_month: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          adults?: number | null
          advance_deposit_date?: string | null
          advance_inr?: number | null
          advance_pct?: number | null
          booked_on?: string | null
          category?: string | null
          check_in?: string | null
          check_out?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deal_inr?: number
          due_balance_inr?: number | null
          guest_city?: string | null
          guest_name?: string | null
          id?: string
          import_flags?: string[]
          import_key?: string | null
          infants?: number | null
          is_demo?: boolean
          kids?: number | null
          meal_plan?: string | null
          nights?: number | null
          package?: string | null
          package_note?: string | null
          room_category?: string | null
          rooms?: number | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string | null
          special_request?: string | null
          status?: string
          stay_month?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_sales_person_id_fkey"
            columns: ["sales_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_plans: {
        Row: {
          plan_id: string
          template_id: string
        }
        Insert: {
          plan_id: string
          template_id: string
        }
        Update: {
          plan_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          code: string
          evidence_required: boolean
          gate_code: string | null
          id: string
          module_code: string
          name: string
          owner_action_kind: string | null
          phase_code: string | null
          pipeline_code: string | null
          plan_id: string
          requires_client_approval: boolean
          sort_order: number
          standard: string | null
          superseded_by: string | null
          week_due: number
          week_label: string | null
          week_start: number
        }
        Insert: {
          active?: boolean
          code: string
          evidence_required?: boolean
          gate_code?: string | null
          id?: string
          module_code: string
          name: string
          owner_action_kind?: string | null
          phase_code?: string | null
          pipeline_code?: string | null
          plan_id: string
          requires_client_approval?: boolean
          sort_order?: number
          standard?: string | null
          superseded_by?: string | null
          week_due?: number
          week_label?: string | null
          week_start?: number
        }
        Update: {
          active?: boolean
          code?: string
          evidence_required?: boolean
          gate_code?: string | null
          id?: string
          module_code?: string
          name?: string
          owner_action_kind?: string | null
          phase_code?: string | null
          pipeline_code?: string | null
          plan_id?: string
          requires_client_approval?: boolean
          sort_order?: number
          standard?: string | null
          superseded_by?: string | null
          week_due?: number
          week_label?: string | null
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "launch_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "checklist_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assets: {
        Row: {
          category: string
          client_id: string
          created_at: string
          file_path: string | null
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string
          file_path?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          file_path?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_checklist_items: {
        Row: {
          client_id: string
          created_at: string
          id: string
          item: string
          mandatory: boolean
          notes: string | null
          section: string
          sort_order: number
          status: string
          template_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          item: string
          mandatory?: boolean
          notes?: string | null
          section: string
          sort_order?: number
          status?: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          item?: string
          mandatory?: boolean
          notes?: string | null
          section?: string
          sort_order?: number
          status?: string
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_checklist_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credentials: {
        Row: {
          access_status: string
          client_id: string
          created_at: string
          id: string
          notes: string | null
          password_cipher: string | null
          platform: string
          updated_at: string
          username: string | null
        }
        Insert: {
          access_status?: string
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          password_cipher?: string | null
          platform: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          access_status?: string
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          password_cipher?: string | null
          platform?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_gates: {
        Row: {
          approval_file_path: string | null
          approval_method: string | null
          client_approved_at: string | null
          client_approved_by: string | null
          client_id: string
          criteria: string[]
          due_date: string
          due_week: number
          gate_code: string
          gate_name: string
          id: string
          launch_id: string
          notes: string | null
          phase_code: string | null
          rule: string
          signed_at: string | null
          signed_by: string | null
          signer_role: string
          status: string
        }
        Insert: {
          approval_file_path?: string | null
          approval_method?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id: string
          criteria?: string[]
          due_date: string
          due_week: number
          gate_code: string
          gate_name: string
          id?: string
          launch_id: string
          notes?: string | null
          phase_code?: string | null
          rule?: string
          signed_at?: string | null
          signed_by?: string | null
          signer_role: string
          status?: string
        }
        Update: {
          approval_file_path?: string | null
          approval_method?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id?: string
          criteria?: string[]
          due_date?: string
          due_week?: number
          gate_code?: string
          gate_name?: string
          id?: string
          launch_id?: string
          notes?: string | null
          phase_code?: string | null
          rule?: string
          signed_at?: string | null
          signed_by?: string | null
          signer_role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_gates_client_approved_by_fkey"
            columns: ["client_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_gates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_gates_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_kpi_targets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_pipeline_id: string
          created_at: string
          id: string
          kpi_definition_id: string
          month: string | null
          proposed_at: string | null
          proposed_by: string | null
          status: string
          suggested: number | null
          target: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id: string
          created_at?: string
          id?: string
          kpi_definition_id: string
          month?: string | null
          proposed_at?: string | null
          proposed_by?: string | null
          status?: string
          suggested?: number | null
          target: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id?: string
          created_at?: string
          id?: string
          kpi_definition_id?: string
          month?: string | null
          proposed_at?: string | null
          proposed_by?: string | null
          status?: string
          suggested?: number | null
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_kpi_targets_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kpi_targets_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_launches: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          addons: string[]
          advance_amount: number | null
          advance_received_at: string | null
          annual_revision_applicable: boolean | null
          annual_revision_pct: number | null
          auto_renew: boolean | null
          bd_owner_id: string | null
          billing_basis: string | null
          booking_advances_via_alcor: boolean | null
          change_kind: string | null
          client_id: string
          closed_at: string | null
          closed_reason: string | null
          closing_reason_code: string | null
          commission_direct_pct: number | null
          commission_ota_pct: number | null
          commission_other_pct: number | null
          commission_reconcile_day: number | null
          commission_weddings_pct: number | null
          contract_end: string | null
          contract_reference: string | null
          contract_signed_on: string | null
          contract_start: string | null
          contract_start_approx: boolean
          created_at: string
          created_by: string | null
          crm_option: string | null
          custom_plan_id: string | null
          day0_date: string | null
          deposit_inr: number | null
          due_day: number | null
          exit_checklist_version: number | null
          exit_date: string | null
          google_budget_daily: number | null
          id: string
          import_flags: Json
          internal_owner_id: string | null
          invoice_day: number | null
          last_revised_on: string | null
          late_interest_pct: number | null
          launch_date: string | null
          meta_budget_daily: number | null
          min_term_end: string | null
          min_term_months: number | null
          no_launch_checklist: boolean
          notice_date: string | null
          notice_days: number | null
          notice_deadline: string | null
          notice_file_path: string | null
          notice_from: string | null
          notice_reason: string | null
          notice_within_min_term: boolean
          on_hold_reason: string | null
          on_hold_since: string | null
          payment_cycle: string | null
          payment_reference: string | null
          payment_screenshot_path: string | null
          plan_id: string
          plan_version_id: string | null
          previous_launch_id: string | null
          previous_status: string | null
          quarterly_fee_inr: number | null
          renewal_date: string | null
          retainer_inr: number | null
          setup_fee_inr: number | null
          snapshot_addon_ids: string[]
          source_row: number | null
          status: string
          team_incentive_pct: number | null
          third_party_cost_items: string[] | null
          third_party_costs: string | null
          updated_at: string
          upgraded_from_launch_id: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          addons?: string[]
          advance_amount?: number | null
          advance_received_at?: string | null
          annual_revision_applicable?: boolean | null
          annual_revision_pct?: number | null
          auto_renew?: boolean | null
          bd_owner_id?: string | null
          billing_basis?: string | null
          booking_advances_via_alcor?: boolean | null
          change_kind?: string | null
          client_id: string
          closed_at?: string | null
          closed_reason?: string | null
          closing_reason_code?: string | null
          commission_direct_pct?: number | null
          commission_ota_pct?: number | null
          commission_other_pct?: number | null
          commission_reconcile_day?: number | null
          commission_weddings_pct?: number | null
          contract_end?: string | null
          contract_reference?: string | null
          contract_signed_on?: string | null
          contract_start?: string | null
          contract_start_approx?: boolean
          created_at?: string
          created_by?: string | null
          crm_option?: string | null
          custom_plan_id?: string | null
          day0_date?: string | null
          deposit_inr?: number | null
          due_day?: number | null
          exit_checklist_version?: number | null
          exit_date?: string | null
          google_budget_daily?: number | null
          id?: string
          import_flags?: Json
          internal_owner_id?: string | null
          invoice_day?: number | null
          last_revised_on?: string | null
          late_interest_pct?: number | null
          launch_date?: string | null
          meta_budget_daily?: number | null
          min_term_end?: string | null
          min_term_months?: number | null
          no_launch_checklist?: boolean
          notice_date?: string | null
          notice_days?: number | null
          notice_deadline?: string | null
          notice_file_path?: string | null
          notice_from?: string | null
          notice_reason?: string | null
          notice_within_min_term?: boolean
          on_hold_reason?: string | null
          on_hold_since?: string | null
          payment_cycle?: string | null
          payment_reference?: string | null
          payment_screenshot_path?: string | null
          plan_id: string
          plan_version_id?: string | null
          previous_launch_id?: string | null
          previous_status?: string | null
          quarterly_fee_inr?: number | null
          renewal_date?: string | null
          retainer_inr?: number | null
          setup_fee_inr?: number | null
          snapshot_addon_ids?: string[]
          source_row?: number | null
          status?: string
          team_incentive_pct?: number | null
          third_party_cost_items?: string[] | null
          third_party_costs?: string | null
          updated_at?: string
          upgraded_from_launch_id?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          addons?: string[]
          advance_amount?: number | null
          advance_received_at?: string | null
          annual_revision_applicable?: boolean | null
          annual_revision_pct?: number | null
          auto_renew?: boolean | null
          bd_owner_id?: string | null
          billing_basis?: string | null
          booking_advances_via_alcor?: boolean | null
          change_kind?: string | null
          client_id?: string
          closed_at?: string | null
          closed_reason?: string | null
          closing_reason_code?: string | null
          commission_direct_pct?: number | null
          commission_ota_pct?: number | null
          commission_other_pct?: number | null
          commission_reconcile_day?: number | null
          commission_weddings_pct?: number | null
          contract_end?: string | null
          contract_reference?: string | null
          contract_signed_on?: string | null
          contract_start?: string | null
          contract_start_approx?: boolean
          created_at?: string
          created_by?: string | null
          crm_option?: string | null
          custom_plan_id?: string | null
          day0_date?: string | null
          deposit_inr?: number | null
          due_day?: number | null
          exit_checklist_version?: number | null
          exit_date?: string | null
          google_budget_daily?: number | null
          id?: string
          import_flags?: Json
          internal_owner_id?: string | null
          invoice_day?: number | null
          last_revised_on?: string | null
          late_interest_pct?: number | null
          launch_date?: string | null
          meta_budget_daily?: number | null
          min_term_end?: string | null
          min_term_months?: number | null
          no_launch_checklist?: boolean
          notice_date?: string | null
          notice_days?: number | null
          notice_deadline?: string | null
          notice_file_path?: string | null
          notice_from?: string | null
          notice_reason?: string | null
          notice_within_min_term?: boolean
          on_hold_reason?: string | null
          on_hold_since?: string | null
          payment_cycle?: string | null
          payment_reference?: string | null
          payment_screenshot_path?: string | null
          plan_id?: string
          plan_version_id?: string | null
          previous_launch_id?: string | null
          previous_status?: string | null
          quarterly_fee_inr?: number | null
          renewal_date?: string | null
          retainer_inr?: number | null
          setup_fee_inr?: number | null
          snapshot_addon_ids?: string[]
          source_row?: number | null
          status?: string
          team_incentive_pct?: number | null
          third_party_cost_items?: string[] | null
          third_party_costs?: string | null
          updated_at?: string
          upgraded_from_launch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_launches_bd_owner_id_fkey"
            columns: ["bd_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_closing_reason_code_fkey"
            columns: ["closing_reason_code"]
            isOneToOne: false
            referencedRelation: "closing_reasons"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "client_launches_custom_plan_id_fkey"
            columns: ["custom_plan_id"]
            isOneToOne: false
            referencedRelation: "custom_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_internal_owner_id_fkey"
            columns: ["internal_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_previous_launch_id_fkey"
            columns: ["previous_launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_launches_upgraded_from_launch_id_fkey"
            columns: ["upgraded_from_launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_merges: {
        Row: {
          field_choices: Json
          id: string
          merged_at: string
          merged_by: string | null
          merged_id: string
          moved: Json
          survivor_id: string
          undone_at: string | null
        }
        Insert: {
          field_choices?: Json
          id?: string
          merged_at?: string
          merged_by?: string | null
          merged_id: string
          moved?: Json
          survivor_id: string
          undone_at?: string | null
        }
        Update: {
          field_choices?: Json
          id?: string
          merged_at?: string
          merged_by?: string | null
          merged_id?: string
          moved?: Json
          survivor_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_merges_merged_id_fkey"
            columns: ["merged_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merges_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_message_outbox: {
        Row: {
          activation_request_id: string | null
          attempts: number
          blocker_id: string | null
          body: string | null
          cc_addresses: string[]
          channel: string
          client_id: string
          created_at: string
          dedupe_key: string | null
          error: string | null
          failed_at: string | null
          held: boolean
          id: string
          kind: string
          sent_at: string | null
          subject: string | null
          task_id: string | null
          to_address: string | null
        }
        Insert: {
          activation_request_id?: string | null
          attempts?: number
          blocker_id?: string | null
          body?: string | null
          cc_addresses?: string[]
          channel?: string
          client_id: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          failed_at?: string | null
          held?: boolean
          id?: string
          kind: string
          sent_at?: string | null
          subject?: string | null
          task_id?: string | null
          to_address?: string | null
        }
        Update: {
          activation_request_id?: string | null
          attempts?: number
          blocker_id?: string | null
          body?: string | null
          cc_addresses?: string[]
          channel?: string
          client_id?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          failed_at?: string | null
          held?: boolean
          id?: string
          kind?: string
          sent_at?: string | null
          subject?: string | null
          task_id?: string | null
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_message_outbox_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_message_outbox_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_module_assignments: {
        Row: {
          backup_user_id: string | null
          client_contact_name: string | null
          client_contact_phone: string | null
          client_id: string
          id: string
          launch_id: string
          module_code: string
          primary_user_id: string | null
        }
        Insert: {
          backup_user_id?: string | null
          client_contact_name?: string | null
          client_contact_phone?: string | null
          client_id: string
          id?: string
          launch_id: string
          module_code: string
          primary_user_id?: string | null
        }
        Update: {
          backup_user_id?: string | null
          client_contact_name?: string | null
          client_contact_phone?: string | null
          client_id?: string
          id?: string
          launch_id?: string
          module_code?: string
          primary_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_module_assignments_backup_user_id_fkey"
            columns: ["backup_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_module_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_module_assignments_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_module_assignments_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "launch_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "client_module_assignments_primary_user_id_fkey"
            columns: ["primary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pipelines: {
        Row: {
          backup_manager_id: string | null
          client_id: string
          created_at: string
          id: string
          manager_id: string | null
          monthly_target: string | null
          pipeline_id: string
          start_date: string | null
          status: string
          updated_at: string
          weight: number
        }
        Insert: {
          backup_manager_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          manager_id?: string | null
          monthly_target?: string | null
          pipeline_id: string
          start_date?: string | null
          status?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          backup_manager_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          manager_id?: string | null
          monthly_target?: string | null
          pipeline_id?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_pipelines_backup_manager_id_fkey"
            columns: ["backup_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipelines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipelines_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_pipelines_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_question_replies: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          question_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          question_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_question_replies_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "client_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_questions: {
        Row: {
          asked_by: string | null
          body: string
          client_id: string
          client_pipeline_id: string | null
          created_at: string
          id: string
          last_activity_at: string
          pipeline_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          asked_by?: string | null
          body: string
          client_id: string
          client_pipeline_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          pipeline_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          asked_by?: string | null
          body?: string
          client_id?: string
          client_pipeline_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string
          pipeline_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_questions_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_questions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      client_review_items: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_review_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_social_accounts: {
        Row: {
          access_received: boolean
          access_required: boolean
          access_verified: boolean
          client_id: string
          created_at: string
          id: string
          notes: string | null
          platform: string
          profile_url: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          access_received?: boolean
          access_required?: boolean
          access_verified?: boolean
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          platform: string
          profile_url?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          access_received?: boolean
          access_required?: boolean
          access_verified?: boolean
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string
          profile_url?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_staff_assignments: {
        Row: {
          client_id: string
          created_at: string
          excluded: boolean
          id: string
          last_calculated_at: string
          matched_service: string | null
          pipeline_id: string
          role: string
          source: string
          source_launch_id: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          excluded?: boolean
          id?: string
          last_calculated_at?: string
          matched_service?: string | null
          pipeline_id: string
          role: string
          source?: string
          source_launch_id?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          excluded?: boolean
          id?: string
          last_calculated_at?: string
          matched_service?: string | null
          pipeline_id?: string
          role?: string
          source?: string
          source_launch_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_staff_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_staff_assignments_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_staff_assignments_source_launch_id_fkey"
            columns: ["source_launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_staff_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          assignee_id: string | null
          backup_id: string | null
          blocked_since: string | null
          blocker_impact: string | null
          blocker_reason: string | null
          carried_from_task_id: string | null
          client_approval_requested_at: string | null
          client_approved_at: string | null
          client_approved_by: string | null
          client_id: string
          client_reminder_sent_at: string | null
          code: string
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string
          escalation_level: number
          evidence_url: string | null
          exit_financial: boolean
          exit_owner_side: string | null
          exit_stage: string | null
          exit_withdrawn: boolean
          gate_a_override_at: string | null
          gate_a_override_by: string | null
          gate_a_override_reason: string | null
          id: string
          last_escalated_at: string | null
          launch_id: string
          module_code: string
          name: string
          notes: string | null
          owner_action_kind: string | null
          phase: string
          phase_code: string | null
          pipeline_code: string | null
          requires_client_approval: boolean
          sort_order: number
          standard: string | null
          status: string
          template_id: string | null
          updated_at: string
          week_due: number
          week_label: string | null
          week_start: number
        }
        Insert: {
          assignee_id?: string | null
          backup_id?: string | null
          blocked_since?: string | null
          blocker_impact?: string | null
          blocker_reason?: string | null
          carried_from_task_id?: string | null
          client_approval_requested_at?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id: string
          client_reminder_sent_at?: string | null
          code: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date: string
          escalation_level?: number
          evidence_url?: string | null
          exit_financial?: boolean
          exit_owner_side?: string | null
          exit_stage?: string | null
          exit_withdrawn?: boolean
          gate_a_override_at?: string | null
          gate_a_override_by?: string | null
          gate_a_override_reason?: string | null
          id?: string
          last_escalated_at?: string | null
          launch_id: string
          module_code: string
          name: string
          notes?: string | null
          owner_action_kind?: string | null
          phase?: string
          phase_code?: string | null
          pipeline_code?: string | null
          requires_client_approval?: boolean
          sort_order?: number
          standard?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          week_due: number
          week_label?: string | null
          week_start: number
        }
        Update: {
          assignee_id?: string | null
          backup_id?: string | null
          blocked_since?: string | null
          blocker_impact?: string | null
          blocker_reason?: string | null
          carried_from_task_id?: string | null
          client_approval_requested_at?: string | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_id?: string
          client_reminder_sent_at?: string | null
          code?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string
          escalation_level?: number
          evidence_url?: string | null
          exit_financial?: boolean
          exit_owner_side?: string | null
          exit_stage?: string | null
          exit_withdrawn?: boolean
          gate_a_override_at?: string | null
          gate_a_override_by?: string | null
          gate_a_override_reason?: string | null
          id?: string
          last_escalated_at?: string | null
          launch_id?: string
          module_code?: string
          name?: string
          notes?: string | null
          owner_action_kind?: string | null
          phase?: string
          phase_code?: string | null
          pipeline_code?: string | null
          requires_client_approval?: boolean
          sort_order?: number
          standard?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          week_due?: number
          week_label?: string | null
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_carried_from_task_id_fkey"
            columns: ["carried_from_task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_gate_a_override_by_fkey"
            columns: ["gate_a_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager_id: string | null
          address: string | null
          bd_owner_id: string | null
          check_in: string | null
          check_out: string | null
          city: string | null
          client_code: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          destination: string | null
          email: string | null
          extra_fields: Json
          facebook_url: string | null
          gbp_access_email: string
          gbp_access_provided: boolean
          gbp_access_status: string
          gbp_profile_name: string | null
          gbp_url: string | null
          gst_number: string | null
          hotel_name: string
          id: string
          import_flags: Json
          in_room_amenities: string[]
          instagram_url: string | null
          is_demo: boolean
          is_internal: boolean
          is_test: boolean
          lead_source: string | null
          linkedin_url: string | null
          location_note: string | null
          maps_url: string | null
          mobile: string | null
          nearest_airport: string | null
          nearest_railway: string | null
          number_of_rooms: number | null
          onboarding_stage: string
          onboarding_status: string
          owner_name: string | null
          parent_client_id: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_mode: string | null
          payment_screenshot_path: string | null
          payment_status: string
          pin_code: string | null
          policy_cancellation: string | null
          policy_checkin: string | null
          policy_checkout: string | null
          policy_child: string | null
          policy_extra_bed: string | null
          policy_other: string | null
          policy_pet: string | null
          pro_hotelier: boolean
          property_amenities: string[]
          property_type: string | null
          reservation_email: string | null
          service_model: string
          state: string | null
          status: string
          target_customer: string | null
          tourist_attractions: string | null
          transaction_id: string | null
          updated_at: string
          usp: string | null
          website: string | null
          whatsapp: string | null
          youtube_url: string | null
        }
        Insert: {
          account_manager_id?: string | null
          address?: string | null
          bd_owner_id?: string | null
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          client_code?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: string | null
          email?: string | null
          extra_fields?: Json
          facebook_url?: string | null
          gbp_access_email?: string
          gbp_access_provided?: boolean
          gbp_access_status?: string
          gbp_profile_name?: string | null
          gbp_url?: string | null
          gst_number?: string | null
          hotel_name: string
          id?: string
          import_flags?: Json
          in_room_amenities?: string[]
          instagram_url?: string | null
          is_demo?: boolean
          is_internal?: boolean
          is_test?: boolean
          lead_source?: string | null
          linkedin_url?: string | null
          location_note?: string | null
          maps_url?: string | null
          mobile?: string | null
          nearest_airport?: string | null
          nearest_railway?: string | null
          number_of_rooms?: number | null
          onboarding_stage?: string
          onboarding_status?: string
          owner_name?: string | null
          parent_client_id?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_screenshot_path?: string | null
          payment_status?: string
          pin_code?: string | null
          policy_cancellation?: string | null
          policy_checkin?: string | null
          policy_checkout?: string | null
          policy_child?: string | null
          policy_extra_bed?: string | null
          policy_other?: string | null
          policy_pet?: string | null
          pro_hotelier?: boolean
          property_amenities?: string[]
          property_type?: string | null
          reservation_email?: string | null
          service_model?: string
          state?: string | null
          status?: string
          target_customer?: string | null
          tourist_attractions?: string | null
          transaction_id?: string | null
          updated_at?: string
          usp?: string | null
          website?: string | null
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Update: {
          account_manager_id?: string | null
          address?: string | null
          bd_owner_id?: string | null
          check_in?: string | null
          check_out?: string | null
          city?: string | null
          client_code?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          destination?: string | null
          email?: string | null
          extra_fields?: Json
          facebook_url?: string | null
          gbp_access_email?: string
          gbp_access_provided?: boolean
          gbp_access_status?: string
          gbp_profile_name?: string | null
          gbp_url?: string | null
          gst_number?: string | null
          hotel_name?: string
          id?: string
          import_flags?: Json
          in_room_amenities?: string[]
          instagram_url?: string | null
          is_demo?: boolean
          is_internal?: boolean
          is_test?: boolean
          lead_source?: string | null
          linkedin_url?: string | null
          location_note?: string | null
          maps_url?: string | null
          mobile?: string | null
          nearest_airport?: string | null
          nearest_railway?: string | null
          number_of_rooms?: number | null
          onboarding_stage?: string
          onboarding_status?: string
          owner_name?: string | null
          parent_client_id?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_screenshot_path?: string | null
          payment_status?: string
          pin_code?: string | null
          policy_cancellation?: string | null
          policy_checkin?: string | null
          policy_checkout?: string | null
          policy_child?: string | null
          policy_extra_bed?: string | null
          policy_other?: string | null
          policy_pet?: string | null
          pro_hotelier?: boolean
          property_amenities?: string[]
          property_type?: string | null
          reservation_email?: string | null
          service_model?: string
          state?: string | null
          status?: string
          target_customer?: string | null
          tourist_attractions?: string | null
          transaction_id?: string | null
          updated_at?: string
          usp?: string | null
          website?: string | null
          whatsapp?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_bd_owner_id_fkey"
            columns: ["bd_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_reasons: {
        Row: {
          code: string
          is_churn: boolean
          label: string
          requires_notes: boolean
          sort_order: number
        }
        Insert: {
          code: string
          is_churn?: boolean
          label: string
          requires_notes?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          is_churn?: boolean
          label?: string
          requires_notes?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      commercial_term_changes: {
        Row: {
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          launch_id: string
          new_terms: Json
          old_terms: Json
          reason: string | null
          requested_by: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          launch_id: string
          new_terms: Json
          old_terms: Json
          reason?: string | null
          requested_by: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          launch_id?: string
          new_terms?: Json
          old_terms?: Json
          reason?: string | null
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_term_changes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_term_changes_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_access_log: {
        Row: {
          created_at: string
          credential_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_access_log_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "client_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_secrets: {
        Row: {
          created_at: string
          name: string
          secret: string
        }
        Insert: {
          created_at?: string
          name: string
          secret?: string
        }
        Update: {
          created_at?: string
          name?: string
          secret?: string
        }
        Relationships: []
      }
      custom_plan_services: {
        Row: {
          custom_plan_id: string
          frequency: string | null
          id: string
          included: boolean
          pipeline_code: string | null
          scope: string | null
          service_name: string
          sort_order: number
        }
        Insert: {
          custom_plan_id: string
          frequency?: string | null
          id?: string
          included?: boolean
          pipeline_code?: string | null
          scope?: string | null
          service_name: string
          sort_order?: number
        }
        Update: {
          custom_plan_id?: string
          frequency?: string | null
          id?: string
          included?: boolean
          pipeline_code?: string | null
          scope?: string | null
          service_name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_plan_services_custom_plan_id_fkey"
            columns: ["custom_plan_id"]
            isOneToOne: false
            referencedRelation: "custom_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_plans: {
        Row: {
          addon_ids: string[]
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          base_plan_version_id: string
          commission_direct_pct: number | null
          commission_ota_pct: number | null
          commission_other_pct: number
          commission_weddings_pct: number | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          created_by: string | null
          id: string
          includes_reservations_sales_tools: boolean
          monthly_retainer_inr: number | null
          name: string
          notes: string | null
          notice_days: number | null
          payment_cycle: string
          rejection_reason: string | null
          setup_fee_inr: number | null
          status: string
          termination_terms: string | null
          third_party_cost_items: string[]
          third_party_costs: string
          updated_at: string
        }
        Insert: {
          addon_ids?: string[]
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_plan_version_id: string
          commission_direct_pct?: number | null
          commission_ota_pct?: number | null
          commission_other_pct?: number
          commission_weddings_pct?: number | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          includes_reservations_sales_tools?: boolean
          monthly_retainer_inr?: number | null
          name: string
          notes?: string | null
          notice_days?: number | null
          payment_cycle?: string
          rejection_reason?: string | null
          setup_fee_inr?: number | null
          status?: string
          termination_terms?: string | null
          third_party_cost_items?: string[]
          third_party_costs?: string
          updated_at?: string
        }
        Update: {
          addon_ids?: string[]
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          base_plan_version_id?: string
          commission_direct_pct?: number | null
          commission_ota_pct?: number | null
          commission_other_pct?: number
          commission_weddings_pct?: number | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          includes_reservations_sales_tools?: boolean
          monthly_retainer_inr?: number | null
          name?: string
          notes?: string | null
          notice_days?: number | null
          payment_cycle?: string
          rejection_reason?: string | null
          setup_fee_inr?: number | null
          status?: string
          termination_terms?: string | null
          third_party_cost_items?: string[]
          third_party_costs?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_plans_base_plan_version_id_fkey"
            columns: ["base_plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      department_kpi_targets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          kpi_definition_id: string
          month: string
          pipeline_id: string
          proposed_by: string | null
          status: string
          target: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          kpi_definition_id: string
          month: string
          pipeline_id: string
          proposed_by?: string | null
          status?: string
          target: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          kpi_definition_id?: string
          month?: string
          pipeline_id?: string
          proposed_by?: string | null
          status?: string
          target?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_kpi_targets_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_kpi_targets_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      department_month_entries: {
        Row: {
          meetings: number | null
          month: string
          outside_proposals: number | null
          pipeline_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          meetings?: number | null
          month: string
          outside_proposals?: number | null
          pipeline_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          meetings?: number | null
          month?: string
          outside_proposals?: number | null
          pipeline_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_month_entries_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          client_id: string
          created_at: string
          doc_type: string
          expiry_date: string | null
          file_path: string | null
          generated_proposal: boolean
          id: string
          mandatory: boolean
          notes: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_path?: string | null
          generated_proposal?: boolean
          id?: string
          mandatory?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_path?: string | null
          generated_proposal?: boolean
          id?: string
          mandatory?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      exit_checklist_items: {
        Row: {
          active: boolean
          anchor: string
          code: string
          custom_plan_id: string | null
          financial: boolean
          id: string
          item_text: string
          offset_days: number
          owner_side: string
          plan_id: string
          sort_order: number
          source: string
          stage: string
          working_days: boolean
        }
        Insert: {
          active?: boolean
          anchor?: string
          code: string
          custom_plan_id?: string | null
          financial?: boolean
          id?: string
          item_text: string
          offset_days?: number
          owner_side?: string
          plan_id: string
          sort_order?: number
          source?: string
          stage: string
          working_days?: boolean
        }
        Update: {
          active?: boolean
          anchor?: string
          code?: string
          custom_plan_id?: string | null
          financial?: boolean
          id?: string
          item_text?: string
          offset_days?: number
          owner_side?: string
          plan_id?: string
          sort_order?: number
          source?: string
          stage?: string
          working_days?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "exit_checklist_items_custom_plan_id_fkey"
            columns: ["custom_plan_id"]
            isOneToOne: false
            referencedRelation: "custom_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_checklist_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_criteria: {
        Row: {
          criterion: string
          due_week: number
          gate_code: string
          gate_name: string
          id: string
          phase_code: string | null
          plan_id: string
          rule: string
          signer_role: string
          sort_order: number
        }
        Insert: {
          criterion: string
          due_week: number
          gate_code: string
          gate_name: string
          id?: string
          phase_code?: string | null
          plan_id: string
          rule?: string
          signer_role: string
          sort_order?: number
        }
        Update: {
          criterion?: string
          due_week?: number
          gate_code?: string
          gate_name?: string
          id?: string
          phase_code?: string | null
          plan_id?: string
          rule?: string
          signer_role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gate_criteria_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_kpi_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          booking_clicks: number
          calls: number
          chat_clicks: number
          client_id: string
          client_pipeline_id: string
          created_at: string
          created_by: string | null
          direction_requests: number
          five_star_reviews: number
          id: string
          is_demo: boolean
          month: string
          notes: string | null
          photos: number
          posts: number
          profile_interactions: number
          status: string
          updated_at: string
          views: number
          website_clicks: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          booking_clicks?: number
          calls?: number
          chat_clicks?: number
          client_id: string
          client_pipeline_id: string
          created_at?: string
          created_by?: string | null
          direction_requests?: number
          five_star_reviews?: number
          id?: string
          is_demo?: boolean
          month: string
          notes?: string | null
          photos?: number
          posts?: number
          profile_interactions?: number
          status?: string
          updated_at?: string
          views?: number
          website_clicks?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          booking_clicks?: number
          calls?: number
          chat_clicks?: number
          client_id?: string
          client_pipeline_id?: string
          created_at?: string
          created_by?: string | null
          direction_requests?: number
          five_star_reviews?: number
          id?: string
          is_demo?: boolean
          month?: string
          notes?: string | null
          photos?: number
          posts?: number
          profile_interactions?: number
          status?: string
          updated_at?: string
          views?: number
          website_clicks?: number
        }
        Relationships: [
          {
            foreignKeyName: "gbp_kpi_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_kpi_entries_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_monthly_goals: {
        Row: {
          client_id: string
          client_pipeline_id: string
          created_at: string
          created_by: string | null
          id: string
          month: string
          notes: string | null
          target_photos: number
          target_posts: number
          target_reviews: number
          updated_at: string
        }
        Insert: {
          client_id: string
          client_pipeline_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          month: string
          notes?: string | null
          target_photos?: number
          target_posts?: number
          target_reviews?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_pipeline_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          month?: string
          notes?: string | null
          target_photos?: number
          target_posts?: number
          target_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gbp_monthly_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_monthly_goals_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_reports: {
        Row: {
          client_id: string
          client_pipeline_id: string
          created_at: string
          file_path: string | null
          id: string
          kind: string
          month: string | null
          notes: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          client_pipeline_id: string
          created_at?: string
          file_path?: string | null
          id?: string
          kind?: string
          month?: string | null
          notes?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          client_pipeline_id?: string
          created_at?: string
          file_path?: string | null
          id?: string
          kind?: string
          month?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_reports_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_launch_tasks: {
        Row: {
          client_id: string
          code: string
          id: string
          imported_at: string
          launch_id: string
          module_code: string
          name: string
          notes: string
          phase_code: string | null
          sort_order: number
          standard: string | null
          status: string
          template_id: string
          week_due: number
          week_label: string | null
          week_start: number
        }
        Insert: {
          client_id: string
          code: string
          id?: string
          imported_at?: string
          launch_id: string
          module_code: string
          name: string
          notes?: string
          phase_code?: string | null
          sort_order?: number
          standard?: string | null
          status?: string
          template_id: string
          week_due: number
          week_label?: string | null
          week_start: number
        }
        Update: {
          client_id?: string
          code?: string
          id?: string
          imported_at?: string
          launch_id?: string
          module_code?: string
          name?: string
          notes?: string
          phase_code?: string | null
          sort_order?: number
          standard?: string | null
          status?: string
          template_id?: string
          week_due?: number
          week_label?: string | null
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_launch_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_launch_tasks_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_launch_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_issues: {
        Row: {
          action_item_id: string | null
          action_taken: string | null
          candidate_client_ids: string[]
          category: string | null
          client_id: string | null
          created_at: string
          flag: string | null
          id: string
          issue: string
          issue_no: number
          owner_id: string | null
          owner_name: string | null
          raised_by: string | null
          raised_on: string | null
          source: string
          status: string
        }
        Insert: {
          action_item_id?: string | null
          action_taken?: string | null
          candidate_client_ids?: string[]
          category?: string | null
          client_id?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          issue: string
          issue_no: number
          owner_id?: string | null
          owner_name?: string | null
          raised_by?: string | null
          raised_on?: string | null
          source?: string
          status: string
        }
        Update: {
          action_item_id?: string | null
          action_taken?: string | null
          candidate_client_ids?: string[]
          category?: string | null
          client_id?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          issue?: string
          issue_no?: number
          owner_id?: string | null
          owner_name?: string | null
          raised_by?: string | null
          raised_on?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_issues_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_issues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_programs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          contract_url: string | null
          created_at: string
          goals: Json
          head_id: string | null
          id: string
          launch_id: string
          owner_comment: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          contract_url?: string | null
          created_at?: string
          goals?: Json
          head_id?: string | null
          id?: string
          launch_id: string
          owner_comment?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          contract_url?: string | null
          created_at?: string
          goals?: Json
          head_id?: string | null
          id?: string
          launch_id?: string
          owner_comment?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "influencer_programs_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: true
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          body: string
          category: string
          client_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          category?: string
          client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          category?: string
          client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_inr: number
          client_id: string
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          invoice_no: string
          invoice_type: string
          late_interest_pct: number | null
          launch_id: string | null
          notes: string | null
          paid_amount_inr: number
          paid_on: string | null
          period_end: string | null
          period_start: string | null
          raised_on: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_inr: number
          client_id: string
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          invoice_no: string
          invoice_type: string
          late_interest_pct?: number | null
          launch_id?: string | null
          notes?: string | null
          paid_amount_inr?: number
          paid_on?: string | null
          period_end?: string | null
          period_start?: string | null
          raised_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          invoice_no?: string
          invoice_type?: string
          late_interest_pct?: number | null
          launch_id?: string | null
          notes?: string | null
          paid_amount_inr?: number
          paid_on?: string | null
          period_end?: string | null
          period_start?: string | null
          raised_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          active: boolean
          controllable: boolean
          counts_toward_score: boolean
          created_at: string
          default_target: number | null
          definition: string | null
          direction: string
          id: string
          is_main: boolean
          kpi_type: string
          main_group: string | null
          main_position: number | null
          name: string
          pipeline_id: string
          platform: string | null
          sort_order: number
          source_key: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          controllable?: boolean
          counts_toward_score?: boolean
          created_at?: string
          default_target?: number | null
          definition?: string | null
          direction?: string
          id?: string
          is_main?: boolean
          kpi_type?: string
          main_group?: string | null
          main_position?: number | null
          name: string
          pipeline_id: string
          platform?: string | null
          sort_order?: number
          source_key?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          controllable?: boolean
          counts_toward_score?: boolean
          created_at?: string
          default_target?: number | null
          definition?: string | null
          direction?: string
          id?: string
          is_main?: boolean
          kpi_type?: string
          main_group?: string | null
          main_position?: number | null
          name?: string
          pipeline_id?: string
          platform?: string | null
          sort_order?: number
          source_key?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_entries: {
        Row: {
          achievement_pct: number | null
          action_deadline: string | null
          action_item_id: string | null
          action_owner_id: string | null
          actual: number | null
          comment: string | null
          corrective_action: string | null
          created_at: string
          id: string
          kpi_definition_id: string
          provisional_target: number | null
          red_reason: string | null
          report_id: string
          target: number | null
          target_status: string | null
          text_value: string | null
          updated_at: string
        }
        Insert: {
          achievement_pct?: number | null
          action_deadline?: string | null
          action_item_id?: string | null
          action_owner_id?: string | null
          actual?: number | null
          comment?: string | null
          corrective_action?: string | null
          created_at?: string
          id?: string
          kpi_definition_id: string
          provisional_target?: number | null
          red_reason?: string | null
          report_id: string
          target?: number | null
          target_status?: string | null
          text_value?: string | null
          updated_at?: string
        }
        Update: {
          achievement_pct?: number | null
          action_deadline?: string | null
          action_item_id?: string | null
          action_owner_id?: string | null
          actual?: number | null
          comment?: string | null
          corrective_action?: string | null
          created_at?: string
          id?: string
          kpi_definition_id?: string
          provisional_target?: number | null
          red_reason?: string | null
          report_id?: string
          target?: number | null
          target_status?: string | null
          text_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_entries_action_item_id_fkey"
            columns: ["action_item_id"]
            isOneToOne: false
            referencedRelation: "action_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_action_owner_id_fkey"
            columns: ["action_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_kpi_definition_id_fkey"
            columns: ["kpi_definition_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_fetched_extras: {
        Row: {
          extra_values: Json
          fetched_at: string
          fetched_value_id: string
          raw_data: Json | null
        }
        Insert: {
          extra_values?: Json
          fetched_at?: string
          fetched_value_id: string
          raw_data?: Json | null
        }
        Update: {
          extra_values?: Json
          fetched_at?: string
          fetched_value_id?: string
          raw_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_fetched_extras_fetched_value_id_fkey"
            columns: ["fetched_value_id"]
            isOneToOne: true
            referencedRelation: "kpi_fetched_values"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_fetched_values: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_pipeline_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          corrected_at: string | null
          corrected_by: string | null
          corrected_values: Json | null
          fetched_at: string
          fetched_values: Json
          id: string
          is_partial: boolean
          mapping_id: string
          month: string
          raw_data: Json
          source: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_values?: Json | null
          fetched_at?: string
          fetched_values: Json
          id?: string
          is_partial?: boolean
          mapping_id: string
          month: string
          raw_data?: Json
          source: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          corrected_values?: Json | null
          fetched_at?: string
          fetched_values?: Json
          id?: string
          is_partial?: boolean
          mapping_id?: string
          month?: string
          raw_data?: Json
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_fetched_values_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_fetched_values_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "kpi_source_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_source_history: {
        Row: {
          action: string
          actor: string | null
          after_values: Json | null
          before_values: Json | null
          created_at: string
          fetched_id: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          fetched_id: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          fetched_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_source_history_fetched_id_fkey"
            columns: ["fetched_id"]
            isOneToOne: false
            referencedRelation: "kpi_fetched_values"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_source_mappings: {
        Row: {
          active: boolean
          client_pipeline_id: string
          confirmed_at: string
          confirmed_by: string
          external_id: string
          external_name: string
          id: string
          source: string
        }
        Insert: {
          active?: boolean
          client_pipeline_id: string
          confirmed_at?: string
          confirmed_by: string
          external_id: string
          external_name: string
          id?: string
          source: string
        }
        Update: {
          active?: boolean
          client_pipeline_id?: string
          confirmed_at?: string
          confirmed_by?: string
          external_id?: string
          external_name?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_source_mappings_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_sync_runs: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          mapping_id: string | null
          month: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          mapping_id?: string | null
          month?: string | null
          source: string
          status: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          mapping_id?: string | null
          month?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_sync_runs_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "kpi_source_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_events: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          launch_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          launch_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          launch_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_events_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_modules: {
        Row: {
          client_side: boolean
          code: string
          gate_code: string
          kpi_pipeline_code: string | null
          kpi_primary: boolean
          name: string
          owner_role: string
          phase_code: string | null
          pipeline_code: string | null
        }
        Insert: {
          client_side?: boolean
          code: string
          gate_code: string
          kpi_pipeline_code?: string | null
          kpi_primary?: boolean
          name: string
          owner_role: string
          phase_code?: string | null
          pipeline_code?: string | null
        }
        Update: {
          client_side?: boolean
          code?: string
          gate_code?: string
          kpi_pipeline_code?: string | null
          kpi_primary?: boolean
          name?: string
          owner_role?: string
          phase_code?: string | null
          pipeline_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_modules_phase_code_fkey"
            columns: ["phase_code"]
            isOneToOne: false
            referencedRelation: "launch_phases"
            referencedColumns: ["code"]
          },
        ]
      }
      launch_phases: {
        Row: {
          code: string
          name: string
          pipeline_code: string | null
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          pipeline_code?: string | null
          sort_order: number
        }
        Update: {
          code?: string
          name?: string
          pipeline_code?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      launch_recurring_fees: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          launch_id: string
          monthly_inr: number
          name: string
          pipeline_code: string | null
          starts_on: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          launch_id: string
          monthly_inr: number
          name: string
          pipeline_code?: string | null
          starts_on: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          launch_id?: string
          monthly_inr?: number
          name?: string
          pipeline_code?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_recurring_fees_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "launch_recurring_fees_launch_id_fkey"
            columns: ["launch_id"]
            isOneToOne: false
            referencedRelation: "client_launches"
            referencedColumns: ["id"]
          },
        ]
      }
      login_emails: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          requested_by: string | null
          sent_at: string | null
          source: string
          to_address: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          requested_by?: string | null
          sent_at?: string | null
          source?: string
          to_address: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          requested_by?: string | null
          sent_at?: string | null
          source?: string
          to_address?: string
          user_id?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          am_review_comment: string | null
          approved_at: string | null
          approved_by: string | null
          challenges: string | null
          client_id: string
          client_pipeline_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          highlights: string[]
          id: string
          is_demo: boolean
          manager_comments: string | null
          month: string
          next_month_action: string | null
          no_data_reason: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          updated_at: string
          work_items: string[]
        }
        Insert: {
          am_review_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          challenges?: string | null
          client_id: string
          client_pipeline_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          highlights?: string[]
          id?: string
          is_demo?: boolean
          manager_comments?: string | null
          month: string
          next_month_action?: string | null
          no_data_reason?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          updated_at?: string
          work_items?: string[]
        }
        Update: {
          am_review_comment?: string | null
          approved_at?: string | null
          approved_by?: string | null
          challenges?: string | null
          client_id?: string
          client_pipeline_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          highlights?: string[]
          id?: string
          is_demo?: boolean
          manager_comments?: string | null
          month?: string
          next_month_action?: string | null
          no_data_reason?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          updated_at?: string
          work_items?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      nap_audits: {
        Row: {
          address_ok: boolean
          audit_status: string | null
          consistency_pct: number | null
          created_at: string
          id: string
          name_ok: boolean
          notes: string | null
          phone_ok: boolean
          report_id: string
          website_ok: boolean
        }
        Insert: {
          address_ok?: boolean
          audit_status?: string | null
          consistency_pct?: number | null
          created_at?: string
          id?: string
          name_ok?: boolean
          notes?: string | null
          phone_ok?: boolean
          report_id: string
          website_ok?: boolean
        }
        Update: {
          address_ok?: boolean
          audit_status?: string | null
          consistency_pct?: number | null
          created_at?: string
          id?: string
          name_ok?: boolean
          notes?: string | null
          phone_ok?: boolean
          report_id?: string
          website_ok?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "nap_audits_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      offboarding_templates: {
        Row: {
          active: boolean
          anchor: string
          code: string
          id: string
          module_code: string
          name: string
          offset_days: number
          plan_id: string
          sort_order: number
          source: string
          standard: string | null
        }
        Insert: {
          active?: boolean
          anchor: string
          code: string
          id?: string
          module_code: string
          name: string
          offset_days?: number
          plan_id: string
          sort_order?: number
          source?: string
          standard?: string | null
        }
        Update: {
          active?: boolean
          anchor?: string
          code?: string
          id?: string
          module_code?: string
          name?: string
          offset_days?: number
          plan_id?: string
          sort_order?: number
          source?: string
          standard?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_templates_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "launch_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "offboarding_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_audit_log: {
        Row: {
          action: string
          client_id: string
          created_at: string
          field: string | null
          id: string
          new_value: string | null
          previous_value: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          previous_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          item: string
          mandatory: boolean
          pipeline_code: string | null
          pro_hotelier_only: boolean
          section: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          item: string
          mandatory?: boolean
          pipeline_code?: string | null
          pro_hotelier_only?: boolean
          section: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          item?: string
          mandatory?: boolean
          pipeline_code?: string | null
          pro_hotelier_only?: boolean
          section?: string
          sort_order?: number
        }
        Relationships: []
      }
      ota_records: {
        Row: {
          active_channels: number
          adr: number | null
          approved_at: string | null
          approved_by: string | null
          bookings: number | null
          cancellation_pct: number | null
          client_id: string | null
          client_pipeline_id: string | null
          commission: number | null
          content_score: number | null
          conversion_rate: number | null
          created_at: string
          created_by: string | null
          id: string
          live_channels: number
          month: string | null
          new_channels: number
          notes: string | null
          occupancy: number | null
          ota_name: string
          ranking: number | null
          report_id: string | null
          reputation_score: number | null
          revenue: number | null
          room_nights: number | null
          status: string
          updated_at: string
        }
        Insert: {
          active_channels?: number
          adr?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bookings?: number | null
          cancellation_pct?: number | null
          client_id?: string | null
          client_pipeline_id?: string | null
          commission?: number | null
          content_score?: number | null
          conversion_rate?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          live_channels?: number
          month?: string | null
          new_channels?: number
          notes?: string | null
          occupancy?: number | null
          ota_name?: string
          ranking?: number | null
          report_id?: string | null
          reputation_score?: number | null
          revenue?: number | null
          room_nights?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          active_channels?: number
          adr?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bookings?: number | null
          cancellation_pct?: number | null
          client_id?: string | null
          client_pipeline_id?: string | null
          commission?: number | null
          content_score?: number | null
          conversion_rate?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          live_channels?: number
          month?: string | null
          new_channels?: number
          notes?: string | null
          occupancy?: number | null
          ota_name?: string
          ranking?: number | null
          report_id?: string | null
          reputation_score?: number | null
          revenue?: number | null
          room_nights?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_records_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ota_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_activation_requests: {
        Row: {
          assigned_to: string | null
          client_id: string
          created_at: string
          follow_up_due: string | null
          id: string
          onboarding_completed_at: string | null
          pipeline_id: string
          scope_confirmed_at: string | null
          scope_notes: string | null
          status: string
          tasks_assigned_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          created_at?: string
          follow_up_due?: string | null
          id?: string
          onboarding_completed_at?: string | null
          pipeline_id: string
          scope_confirmed_at?: string | null
          scope_notes?: string | null
          status?: string
          tasks_assigned_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          created_at?: string
          follow_up_due?: string | null
          id?: string
          onboarding_completed_at?: string | null
          pipeline_id?: string
          scope_confirmed_at?: string | null
          scope_notes?: string | null
          status?: string
          tasks_assigned_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_activation_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_activation_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_activation_requests_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_baselines: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_pipeline_id: string
          entered_by: string | null
          id: string
          month: string
          status: string
          updated_at: string
          values: Json
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id: string
          entered_by?: string | null
          id?: string
          month: string
          status?: string
          updated_at?: string
          values?: Json
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_pipeline_id?: string
          entered_by?: string | null
          id?: string
          month?: string
          status?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_baselines_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: true
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_kpi_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          channel: string
          client_id: string
          client_pipeline_id: string
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          metrics: Json
          month: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          client_id: string
          client_pipeline_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          metrics?: Json
          month: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          client_id?: string
          client_pipeline_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          metrics?: Json
          month?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_kpi_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_kpi_entries_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_members: {
        Row: {
          active: boolean
          backup_id: string | null
          created_at: string
          id: string
          pipeline_id: string
          role: string
          source: string
          user_id: string
        }
        Insert: {
          active?: boolean
          backup_id?: string | null
          created_at?: string
          id?: string
          pipeline_id: string
          role: string
          source?: string
          user_id: string
        }
        Update: {
          active?: boolean
          backup_id?: string | null
          created_at?: string
          id?: string
          pipeline_id?: string
          role?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_members_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_members_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_vendors: {
        Row: {
          created_at: string
          id: string
          name: string
          note: string | null
          pipeline_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          note?: string | null
          pipeline_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          pipeline_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_vendors_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          active: boolean
          client_facing: boolean
          code: string
          created_at: string
          default_weight: number
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          client_facing?: boolean
          code: string
          created_at?: string
          default_weight?: number
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          client_facing?: boolean
          code?: string
          created_at?: string
          default_weight?: number
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      plan_modules: {
        Row: {
          module_code: string
          plan_id: string
          window_label: string | null
        }
        Insert: {
          module_code: string
          plan_id: string
          window_label?: string | null
        }
        Update: {
          module_code?: string
          plan_id?: string
          window_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_modules_module_code_fkey"
            columns: ["module_code"]
            isOneToOne: false
            referencedRelation: "launch_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "plan_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_services: {
        Row: {
          frequency: string | null
          id: string
          included: boolean
          pipeline_code: string | null
          plan_version_id: string
          scope: string | null
          service_name: string
          sort_order: number
        }
        Insert: {
          frequency?: string | null
          id?: string
          included?: boolean
          pipeline_code?: string | null
          plan_version_id: string
          scope?: string | null
          service_name: string
          sort_order?: number
        }
        Update: {
          frequency?: string | null
          id?: string
          included?: boolean
          pipeline_code?: string | null
          plan_version_id?: string
          scope?: string | null
          service_name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_services_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_task_carryover: {
        Row: {
          from_code: string
          from_plan_id: string
          id: string
          to_code: string
          to_plan_id: string
        }
        Insert: {
          from_code: string
          from_plan_id: string
          id?: string
          to_code: string
          to_plan_id: string
        }
        Update: {
          from_code?: string
          from_plan_id?: string
          id?: string
          to_code?: string
          to_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_task_carryover_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_task_carryover_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          annual_revision_pct: number
          auto_renew: boolean
          billing_basis: string
          code: string
          created_at: string
          due_day: number
          effective_from: string
          effective_to: string | null
          id: string
          includes_reservations_sales_tools: boolean
          invoice_day: number
          late_interest_pct: number
          min_term_months: number
          monthly_retainer_inr: number
          name: string
          notice_days: number
          plan_id: string
          status: string
          team_incentive_pct: number
          third_party_cost_items: string[]
          third_party_costs: string
          version: number
        }
        Insert: {
          annual_revision_pct?: number
          auto_renew?: boolean
          billing_basis?: string
          code: string
          created_at?: string
          due_day: number
          effective_from: string
          effective_to?: string | null
          id?: string
          includes_reservations_sales_tools?: boolean
          invoice_day: number
          late_interest_pct?: number
          min_term_months?: number
          monthly_retainer_inr: number
          name: string
          notice_days: number
          plan_id: string
          status?: string
          team_incentive_pct?: number
          third_party_cost_items?: string[]
          third_party_costs?: string
          version: number
        }
        Update: {
          annual_revision_pct?: number
          auto_renew?: boolean
          billing_basis?: string
          code?: string
          created_at?: string
          due_day?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          includes_reservations_sales_tools?: boolean
          invoice_day?: number
          late_interest_pct?: number
          min_term_months?: number
          monthly_retainer_inr?: number
          name?: string
          notice_days?: number
          plan_id?: string
          status?: string
          team_incentive_pct?: number
          third_party_cost_items?: string[]
          third_party_costs?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          billing_period: string
          code: string
          created_at: string
          day0_requires_noc: boolean
          description: string | null
          duration_weeks: number
          fee_inr: number | null
          final_gate_code: string
          id: string
          launch_day: number
          lock_exempt_modules: string[]
          lock_gate_code: string
          min_term_months: number | null
          name: string
          notice_days: number | null
          quarterly_fee_inr: number | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          billing_period?: string
          code: string
          created_at?: string
          day0_requires_noc?: boolean
          description?: string | null
          duration_weeks?: number
          fee_inr?: number | null
          final_gate_code?: string
          id?: string
          launch_day?: number
          lock_exempt_modules?: string[]
          lock_gate_code?: string
          min_term_months?: number | null
          name: string
          notice_days?: number | null
          quarterly_fee_inr?: number | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          billing_period?: string
          code?: string
          created_at?: string
          day0_requires_noc?: boolean
          description?: string | null
          duration_weeks?: number
          fee_inr?: number | null
          final_gate_code?: string
          id?: string
          launch_day?: number
          lock_exempt_modules?: string[]
          lock_gate_code?: string
          min_term_months?: number | null
          name?: string
          notice_days?: number | null
          quarterly_fee_inr?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      prelaunch_work_history: {
        Row: {
          client_id: string
          created_at: string
          description: string
          entered_by: string
          evidence_url: string | null
          id: string
          pipeline_id: string
          work_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description: string
          entered_by: string
          evidence_url?: string | null
          id?: string
          pipeline_id: string
          work_date: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string
          entered_by?: string
          evidence_url?: string | null
          id?: string
          pipeline_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prelaunch_work_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prelaunch_work_history_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prelaunch_work_history_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string
          department: string | null
          email: string | null
          email_task_reminders: boolean
          full_name: string
          id: string
          joined_on: string | null
          launch_roles: string[]
          mobile: string | null
          must_change_password: boolean
          photo_url: string | null
          source_sheet_status: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_task_reminders?: boolean
          full_name?: string
          id: string
          joined_on?: string | null
          launch_roles?: string[]
          mobile?: string | null
          must_change_password?: boolean
          photo_url?: string | null
          source_sheet_status?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          email_task_reminders?: boolean
          full_name?: string
          id?: string
          joined_on?: string | null
          launch_roles?: string[]
          mobile?: string | null
          must_change_password?: boolean
          photo_url?: string | null
          source_sheet_status?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      q48_test_stage: {
        Row: {
          name: string
          result: string | null
          script: string
        }
        Insert: {
          name: string
          result?: string | null
          script: string
        }
        Update: {
          name?: string
          result?: string | null
          script?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
        }
        Relationships: []
      }
      rd_call_handling: {
        Row: {
          answered: number
          id: string
          inbound_calls: number
          missed: number
          notes: string | null
          slot: string
          source: string
          unworked_leads: number
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          answered?: number
          id?: string
          inbound_calls?: number
          missed?: number
          notes?: string | null
          slot: string
          source?: string
          unworked_leads?: number
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          answered?: number
          id?: string
          inbound_calls?: number
          missed?: number
          notes?: string | null
          slot?: string
          source?: string
          unworked_leads?: number
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: []
      }
      rd_daily_logs: {
        Row: {
          connects: number
          created_at: string
          dials: number
          evening_checkin: string | null
          followups_due: number
          followups_on_time: number
          id: string
          leads_received: number
          log_date: string
          morning_checkin: string | null
          notes: string | null
          presence: string
          ta_connects: number
          ta_leads_moved: number
          updated_at: string
          updated_by: string | null
          user_id: string
          won_deal_connects: number
        }
        Insert: {
          connects?: number
          created_at?: string
          dials?: number
          evening_checkin?: string | null
          followups_due?: number
          followups_on_time?: number
          id?: string
          leads_received?: number
          log_date: string
          morning_checkin?: string | null
          notes?: string | null
          presence?: string
          ta_connects?: number
          ta_leads_moved?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
          won_deal_connects?: number
        }
        Update: {
          connects?: number
          created_at?: string
          dials?: number
          evening_checkin?: string | null
          followups_due?: number
          followups_on_time?: number
          id?: string
          leads_received?: number
          log_date?: string
          morning_checkin?: string | null
          notes?: string | null
          presence?: string
          ta_connects?: number
          ta_leads_moved?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          won_deal_connects?: number
        }
        Relationships: [
          {
            foreignKeyName: "rd_daily_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_followup_actions: {
        Row: {
          actioned_on: string
          created_at: string
          due_date: string
          followup_id: string
          outcome: string | null
          user_id: string
        }
        Insert: {
          actioned_on: string
          created_at?: string
          due_date: string
          followup_id: string
          outcome?: string | null
          user_id: string
        }
        Update: {
          actioned_on?: string
          created_at?: string
          due_date?: string
          followup_id?: string
          outcome?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_followup_actions_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "rd_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_followup_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_followup_contacts: {
        Row: {
          followup_id: string
          lead_name: string | null
          lead_phone: string | null
          updated_at: string
        }
        Insert: {
          followup_id: string
          lead_name?: string | null
          lead_phone?: string | null
          updated_at?: string
        }
        Update: {
          followup_id?: string
          lead_name?: string | null
          lead_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_followup_contacts_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: true
            referencedRelation: "rd_followups"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_followups: {
        Row: {
          client_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          next_followup_date: string
          notes: string | null
          outcome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_followup_date: string
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_followup_date?: string
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_followups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_followups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_person_goals: {
        Row: {
          flag: string | null
          notes: string | null
          starts_on: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          year: number
          yearly_goal_inr: number | null
        }
        Insert: {
          flag?: string | null
          notes?: string | null
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          year: number
          yearly_goal_inr?: number | null
        }
        Update: {
          flag?: string | null
          notes?: string | null
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          year?: number
          yearly_goal_inr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rd_person_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_property_billing: {
        Row: {
          client_id: string
          direct_billed_inr: number | null
          month: string
          notes: string | null
          ota_billed_inr: number | null
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          direct_billed_inr?: number | null
          month: string
          notes?: string | null
          ota_billed_inr?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          direct_billed_inr?: number | null
          month?: string
          notes?: string | null
          ota_billed_inr?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rd_property_billing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_week_goal_overrides: {
        Row: {
          goal_inr: number
          set_by: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          goal_inr: number
          set_by?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          goal_inr?: number
          set_by?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_week_goal_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_tasks: {
        Row: {
          backup_id: string
          blocked_since: string | null
          blocker_impact: string | null
          blocker_reason: string | null
          created_at: string
          done_at: string | null
          done_by: string | null
          due_date: string
          escalation_level: number
          family_id: string
          id: string
          item_id: string
          last_escalated_at: string | null
          notes: string | null
          occurrence_key: string
          original_due_date: string
          owner_id: string
          plan_id: string
          review_reason: string | null
          stage: string
          status: string
        }
        Insert: {
          backup_id: string
          blocked_since?: string | null
          blocker_impact?: string | null
          blocker_reason?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date: string
          escalation_level?: number
          family_id: string
          id?: string
          item_id: string
          last_escalated_at?: string | null
          notes?: string | null
          occurrence_key: string
          original_due_date: string
          owner_id: string
          plan_id: string
          review_reason?: string | null
          stage: string
          status?: string
        }
        Update: {
          backup_id?: string
          blocked_since?: string | null
          blocker_impact?: string | null
          blocker_reason?: string | null
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          due_date?: string
          escalation_level?: number
          family_id?: string
          id?: string
          item_id?: string
          last_escalated_at?: string | null
          notes?: string | null
          occurrence_key?: string
          original_due_date?: string
          owner_id?: string
          plan_id?: string
          review_reason?: string | null
          stage?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "activity_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "activity_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      report_history: {
        Row: {
          client_id: string | null
          created_at: string
          flag: string | null
          id: string
          month: string
          source: string
          source_name: string
          status: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          month: string
          source?: string
          source_name: string
          status?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          flag?: string | null
          id?: string
          month?: string
          source?: string
          source_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      room_categories: {
        Row: {
          amenities: string[]
          client_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          number_of_rooms: number | null
          photos: string[]
          rack_rate: number | null
          selling_rate: number | null
        }
        Insert: {
          amenities?: string[]
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          number_of_rooms?: number | null
          photos?: string[]
          rack_rate?: number | null
          selling_rate?: number | null
        }
        Update: {
          amenities?: string[]
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          number_of_rooms?: number | null
          photos?: string[]
          rack_rate?: number | null
          selling_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_categories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          fy: number
          goal_inr: number
          id: string
          month_no: number
          scope: string
          subject_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fy: number
          goal_inr: number
          id?: string
          month_no: number
          scope: string
          subject_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fy?: number
          goal_inr?: number
          id?: string
          month_no?: number
          scope?: string
          subject_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      social_kpi_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          client_pipeline_id: string
          content_views: number
          created_at: string
          created_by: string | null
          engagement: number
          followers: number
          id: string
          is_demo: boolean
          month: string
          new_followers: number
          notes: string | null
          platform: string
          posts: number
          profile_views: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          client_pipeline_id: string
          content_views?: number
          created_at?: string
          created_by?: string | null
          engagement?: number
          followers?: number
          id?: string
          is_demo?: boolean
          month: string
          new_followers?: number
          notes?: string | null
          platform: string
          posts?: number
          profile_views?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          client_pipeline_id?: string
          content_views?: number
          created_at?: string
          created_by?: string | null
          engagement?: number
          followers?: number
          id?: string
          is_demo?: boolean
          month?: string
          new_followers?: number
          notes?: string | null
          platform?: string
          posts?: number
          profile_views?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_kpi_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_kpi_entries_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_digest_outbox: {
        Row: {
          attempts: number
          body: string
          created_at: string
          email_skipped: string | null
          error: string | null
          failed_at: string | null
          held: boolean
          id: string
          items: Json
          sent_at: string | null
          slot_at: string
          subject: string
          to_address: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          email_skipped?: string | null
          error?: string | null
          failed_at?: string | null
          held?: boolean
          id?: string
          items: Json
          sent_at?: string | null
          slot_at: string
          subject: string
          to_address?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          email_skipped?: string | null
          error?: string | null
          failed_at?: string | null
          held?: boolean
          id?: string
          items?: Json
          sent_at?: string | null
          slot_at?: string
          subject?: string
          to_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_digest_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_duty_templates: {
        Row: {
          active: boolean
          anchor_client_pipeline_id: string
          backup_id: string | null
          count_target: number | null
          created_at: string
          created_by: string | null
          details: string | null
          due_date: string | null
          frequency: string
          id: string
          month_days: number[] | null
          owner_id: string
          pipeline_id: string
          title: string
        }
        Insert: {
          active?: boolean
          anchor_client_pipeline_id: string
          backup_id?: string | null
          count_target?: number | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_date?: string | null
          frequency?: string
          id?: string
          month_days?: number[] | null
          owner_id: string
          pipeline_id: string
          title: string
        }
        Update: {
          active?: boolean
          anchor_client_pipeline_id?: string
          backup_id?: string | null
          count_target?: number | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          due_date?: string | null
          frequency?: string
          id?: string
          month_days?: number[] | null
          owner_id?: string
          pipeline_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_duty_templates_anchor_client_pipeline_id_fkey"
            columns: ["anchor_client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_duty_templates_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_duty_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_duty_templates_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          action: string
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          task_id: string
          to_status: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          task_id: string
          to_status?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          task_id?: string
          to_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_approval_blockers: {
        Row: {
          blocked_since: string
          client_id: string
          first_reminder_at: string | null
          id: string
          impact: string
          last_reminder_at: string | null
          owner_approved_at: string | null
          pipeline_id: string | null
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          task_id: string
          task_kind: string
          task_name: string
        }
        Insert: {
          blocked_since: string
          client_id: string
          first_reminder_at?: string | null
          id?: string
          impact: string
          last_reminder_at?: string | null
          owner_approved_at?: string | null
          pipeline_id?: string | null
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id: string
          task_kind: string
          task_name: string
        }
        Update: {
          blocked_since?: string
          client_id?: string
          first_reminder_at?: string | null
          id?: string
          impact?: string
          last_reminder_at?: string | null
          owner_approved_at?: string | null
          pipeline_id?: string | null
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          task_id?: string
          task_kind?: string
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_approval_blockers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_approval_blockers_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_approval_blockers_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      weekly_kpi_entries: {
        Row: {
          ad_spend: number
          campaigns_live: number
          channel: string
          client_id: string
          client_pipeline_id: string
          cost_per_lead: number | null
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          leads: number
          notes: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          ad_spend?: number
          campaigns_live?: number
          channel?: string
          client_id: string
          client_pipeline_id: string
          cost_per_lead?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          leads?: number
          notes?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          ad_spend?: number
          campaigns_live?: number
          channel?: string
          client_id?: string
          client_pipeline_id?: string
          cost_per_lead?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          leads?: number
          notes?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_kpi_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_kpi_entries_client_pipeline_id_fkey"
            columns: ["client_pipeline_id"]
            isOneToOne: false
            referencedRelation: "client_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_term_change: { Args: { _change_id: string }; Returns: undefined }
      _code_num: { Args: { _n: number }; Returns: string }
      _day0_missing: {
        Args: { l: Database["public"]["Tables"]["client_launches"]["Row"] }
        Returns: string[]
      }
      _department_actual: {
        Args: { _key: string; _month: string; _pipeline: string }
        Returns: number
      }
      _duty_working_on_or_before: { Args: { _d: string }; Returns: string }
      _finish_plan_exit: {
        Args: { _launch: string; _override?: string }
        Returns: undefined
      }
      _is_backend_caller: { Args: never; Returns: boolean }
      _kpi_caller_ok: { Args: { _cp: string }; Returns: boolean }
      _kpi_prev_actual_core: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: number
      }
      _kpi_target_state_core: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: Record<string, unknown>
      }
      _launch_terms: { Args: { _launch_id: string }; Returns: Json }
      _min_term_info: {
        Args: { _launch_id: string; _notice_date: string }
        Returns: Json
      }
      _q31_staged_test: { Args: { _sql: string }; Returns: string }
      _q71_run_suite: { Args: { _script: string }; Returns: string }
      _q74_run_suite: { Args: { _script: string }; Returns: string }
      _q77_run_suite: { Args: { _script: string }; Returns: string }
      _rd_associates_core: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      _rd_booked_core: {
        Args: { _from: string; _to: string; _uid: string }
        Returns: number
      }
      _rd_caller_ok: { Args: { _uid: string }; Returns: boolean }
      _rd_stats: {
        Args: { _from: string; _to: string; _uid: string }
        Returns: Json
      }
      _rd_stats_core: {
        Args: { _from: string; _to: string; _uid: string }
        Returns: Json
      }
      _refresh_report_kpis: { Args: { _report_id: string }; Returns: number }
      _revision_candidates: {
        Args: { _on: string }
        Returns: {
          anniversary: string
          client_id: string
          hotel_name: string
          launch_id: string
          new_retainer: number
          old_retainer: number
          pct: number
        }[]
      }
      _working_days_after: { Args: { _d: string; _n: number }; Returns: string }
      access_overview: { Args: never; Returns: Json }
      activate_client_launch: { Args: { _launch_id: string }; Returns: number }
      activate_due_upgrades: { Args: { _today?: string }; Returns: number }
      activity_can_head: { Args: { _cp: string }; Returns: boolean }
      activity_can_read: { Args: { _cp: string }; Returns: boolean }
      activity_person_summary: { Args: { _month: string }; Returns: Json }
      activity_require_ready: { Args: never; Returns: undefined }
      activity_settings: {
        Args: {
          _active?: boolean
          _id: string
          _kind: string
          _name: string
          _pipeline?: string
        }
        Returns: undefined
      }
      activity_working_before: {
        Args: { _date: string; _days: number }
        Returns: string
      }
      activity_workspace: {
        Args: {
          _client?: string
          _code?: string
          _mine?: boolean
          _month: string
        }
        Returns: Json
      }
      all_kpi_values: {
        Args: { _cp: string; _month: string }
        Returns: {
          definition_id: string
          direction: string
          kpi_type: string
          main_group: string
          main_position: number
          name: string
          unit: string
          value: number
        }[]
      }
      approve_fetched_kpis: { Args: { _id: string }; Returns: undefined }
      approve_kpi_targets: { Args: { _ids: string[] }; Returns: number }
      approve_pipeline_baseline: { Args: { _cp: string }; Returns: undefined }
      approve_recurring_blocker: { Args: { _id: string }; Returns: undefined }
      approved_hotel_score: {
        Args: { _client: string; _month: string }
        Returns: number
      }
      assign_imported_issue: {
        Args: { _client_id: string; _issue_id: string }
        Returns: string
      }
      bd_target_progress: { Args: never; Returns: Json }
      blocked_escalation_level: {
        Args: { _at: string; _since: string }
        Returns: number
      }
      blocked_task_reason: {
        Args: { _id: string; _impact: string; _kind: string; _reason: string }
        Returns: undefined
      }
      blocked_workspace: { Args: never; Returns: Json }
      blocker_can_manage: {
        Args: { _client: string; _pipeline: string }
        Returns: boolean
      }
      brand_rollup: { Args: { _month: string; _parent: string }; Returns: Json }
      build_task_digests: {
        Args: { _at: string }
        Returns: {
          body: string
          email: string
          items: Json
          overdue_n: number
          subject: string
          user_id: string
          wants_email: boolean
        }[]
      }
      can_edit_client: { Args: { _client_id: string }; Returns: boolean }
      can_manage_finance: { Args: { _uid: string }; Returns: boolean }
      can_manage_rd: { Args: { _uid: string }; Returns: boolean }
      can_read_client_file: { Args: { _name: string }; Returns: boolean }
      can_read_fetched: { Args: { _cp: string }; Returns: boolean }
      can_view_action: {
        Args: { _client_id: string; _pipeline_id: string; _responsible: string }
        Returns: boolean
      }
      can_view_client: { Args: { _client_id: string }; Returns: boolean }
      can_view_client_as: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_client_full: { Args: { _client_id: string }; Returns: boolean }
      can_view_commercials: { Args: { _user_id: string }; Returns: boolean }
      can_view_pipeline: {
        Args: { _client_pipeline_id: string }
        Returns: boolean
      }
      can_view_report: {
        Args: {
          _client_id: string
          _client_pipeline_id: string
          _status: Database["public"]["Enums"]["report_status"]
        }
        Returns: boolean
      }
      can_view_task: { Args: { _task_id: string }; Returns: boolean }
      can_write_client_file: { Args: { _name: string }; Returns: boolean }
      cancel_launch: {
        Args: { _launch_id: string; _reason?: string }
        Returns: undefined
      }
      change_plan: {
        Args: { _launch_id: string; _plan_code: string; _reason: string }
        Returns: string
      }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      client_approve_gate: { Args: { _gate: string }; Returns: undefined }
      client_approve_task: {
        Args: { _note?: string; _task_id: string }
        Returns: undefined
      }
      client_codes: {
        Args: never
        Returns: {
          client_code: string
          id: string
        }[]
      }
      client_commercials: { Args: { _client_id: string }; Returns: Json }
      client_on_hold: { Args: { _client_id: string }; Returns: boolean }
      client_request_changes: {
        Args: { _comment: string; _task_id: string }
        Returns: undefined
      }
      close_launch: {
        Args: { _launch_id: string; _notes?: string; _reason_code: string }
        Returns: undefined
      }
      combined_monthly_report: {
        Args: { _client: string; _month: string }
        Returns: Json
      }
      commercial_terms_list: { Args: never; Returns: Json }
      commission_due: { Args: { _month: string }; Returns: Json }
      complete_activation_followup: {
        Args: {
          _assigned: boolean
          _id: string
          _onboarded: boolean
          _scope: string
        }
        Returns: undefined
      }
      complete_offboarding: { Args: { _launch_id: string }; Returns: undefined }
      confirm_day0: {
        Args: { _day0?: string; _launch_id: string }
        Returns: undefined
      }
      confirm_kpi_mapping: {
        Args: { _cp: string; _external: string; _name: string; _source: string }
        Returns: string
      }
      create_monthly_reports: { Args: { _month?: string }; Returns: number }
      create_rd_followup: {
        Args: {
          _client: string
          _date: string
          _name: string
          _notes: string
          _phone: string
          _user: string
        }
        Returns: string
      }
      custom_exit_copy: { Args: { _custom: string }; Returns: undefined }
      dashboard_pipeline_scores: {
        Args: { _months: string[] }
        Returns: {
          client_id: string
          client_pipeline_id: string
          hotel_name: string
          month: string
          score: number
          weight: number
        }[]
      }
      day0_readiness: { Args: { _launch_id: string }; Returns: Json }
      decide_activity_plan: {
        Args: { _approve: boolean; _comment?: string; _plan: string }
        Returns: undefined
      }
      decide_influencer_program: {
        Args: { _approve: boolean; _comment?: string; _id: string }
        Returns: undefined
      }
      decide_terms_change: {
        Args: { _approve: boolean; _change_id: string; _note?: string }
        Returns: undefined
      }
      department_scorecards: { Args: { _month: string }; Returns: Json }
      effective_exit_items: {
        Args: { _launch: string }
        Returns: {
          active: boolean
          anchor: string
          code: string
          custom_plan_id: string | null
          financial: boolean
          id: string
          item_text: string
          offset_days: number
          owner_side: string
          plan_id: string
          sort_order: number
          source: string
          stage: string
          working_days: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "exit_checklist_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_influencer_program: {
        Args: { _launch: string }
        Returns: undefined
      }
      escalate_blocked_tasks: { Args: { _at?: string }; Returns: number }
      escalate_overdue_tasks: { Args: never; Returns: number }
      exit_item_due: {
        Args: {
          _anchor: string
          _exit: string
          _notice: string
          _offset: number
          _working: boolean
        }
        Returns: string
      }
      exit_working_after: {
        Args: { _date: string; _days: number }
        Returns: string
      }
      exit_workspace: { Args: { _launch?: string }; Returns: Json }
      finance_overview: { Args: never; Returns: Json }
      find_client_duplicates: {
        Args: {
          _address: string
          _city: string
          _email: string
          _gstin: string
          _name: string
          _phone: string
          _website: string
        }
        Returns: {
          city: string
          client_id: string
          email: string
          gst_number: string
          hotel_name: string
          launches: Json
          matched_on: string[]
          mobile: string
          state: string
          website: string
        }[]
      }
      flag_monthly_activity_missed: {
        Args: { _today?: string }
        Returns: number
      }
      gate_task_filter: {
        Args: {
          _gate: string
          _gate_week: number
          _module_gate: string
          _rule: string
          _week_due: number
        }
        Returns: boolean
      }
      gbp_profile_names: {
        Args: never
        Returns: {
          client_id: string
          external_name: string
        }[]
      }
      generate_staff_duties: { Args: { _month?: string }; Returns: number }
      get_my_alcor_contact: {
        Args: never
        Returns: {
          email: string
          full_name: string
          mobile: string
        }[]
      }
      get_my_kpis: { Args: { _from?: string }; Returns: Json }
      get_my_launch: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_launch: {
        Args: { _launch_id: string; _reason: string }
        Returns: undefined
      }
      hotel_scorecard: {
        Args: { _client_id: string; _month: string }
        Returns: Json
      }
      hr_staff_overview: { Args: never; Returns: Json }
      influencer_workspace: {
        Args: { _client?: string; _mine?: boolean }
        Returns: Json
      }
      invoice_effective_status: {
        Args: { _due: string; _status: string }
        Returns: string
      }
      is_client_am: { Args: { _client_id: string }; Returns: boolean }
      is_launch_am: { Args: { _launch_id: string }; Returns: boolean }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      is_pipeline_head: {
        Args: { _pipeline_id: string; _user_id: string }
        Returns: boolean
      }
      is_pipeline_member: {
        Args: { _pipeline_id: string; _user_id: string }
        Returns: boolean
      }
      is_rd_associate: { Args: { _uid: string }; Returns: boolean }
      is_real_client: { Args: { _client: string }; Returns: boolean }
      is_res_desk_head: { Args: { _uid: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      kpi_achievement: {
        Args: { _actual: number; _direction: string; _target: number }
        Returns: number
      }
      kpi_backentry_progress: { Args: { _at?: string }; Returns: Json }
      kpi_prev_actual: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: number
      }
      kpi_source_value: {
        Args: { _avg?: boolean; _cp: string; _key: string; _month: string }
        Returns: number
      }
      kpi_source_value_legacy: {
        Args: { _avg?: boolean; _cp: string; _key: string; _month: string }
        Returns: number
      }
      kpi_suggest_target: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: number
      }
      kpi_target_for: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: number
      }
      kpi_target_state: {
        Args: { _cp: string; _def: string; _month: string }
        Returns: Record<string, unknown>
      }
      launch_commercials: { Args: { _launch_id: string }; Returns: Json }
      launch_due_date: {
        Args: { _day0: string; _week: number }
        Returns: string
      }
      launch_reporting_counts: { Args: never; Returns: Json }
      log_admin_action: {
        Args: {
          _action: string
          _actor: string
          _details?: Json
          _outcome?: string
          _target_id?: string
          _target_type?: string
        }
        Returns: undefined
      }
      main_kpi_values: {
        Args: { _cp: string; _month: string }
        Returns: {
          definition_id: string
          direction: string
          kpi_type: string
          main_group: string
          main_position: number
          name: string
          unit: string
          value: number
        }[]
      }
      manages_pipeline: {
        Args: { _client_pipeline_id: string }
        Returns: boolean
      }
      merge_clients: {
        Args: { _field_choices?: Json; _merged: string; _survivor: string }
        Returns: Json
      }
      min_term_check: {
        Args: { _launch_id: string; _notice_date: string }
        Returns: Json
      }
      my_alcor_team: { Args: never; Returns: Json }
      my_client_id: { Args: never; Returns: string }
      my_documents: { Args: never; Returns: Json }
      my_invoices: { Args: never; Returns: Json }
      my_pipeline_status: { Args: never; Returns: Json }
      norm_domain: { Args: { _v: string }; Returns: string }
      norm_phone: { Args: { _v: string }; Returns: string }
      norm_text: { Args: { _v: string }; Returns: string }
      notify_targets_due: { Args: { _today?: string }; Returns: number }
      overdue_digest_items: {
        Args: { _on: string }
        Returns: {
          item: Json
          user_id: string
        }[]
      }
      override_gate_a_task: {
        Args: { _reason: string; _task: string }
        Returns: undefined
      }
      override_offboarding: {
        Args: { _launch_id: string; _reason: string }
        Returns: undefined
      }
      owner_launch_input: {
        Args: { _input: string; _task: string }
        Returns: undefined
      }
      owner_launch_upload: {
        Args: { _path: string; _task: string }
        Returns: undefined
      }
      person_access_summary: { Args: { _user_id: string }; Returns: Json }
      pipeline_default_backup: { Args: { _pipeline: string }; Returns: string }
      pipeline_member_backup: {
        Args: { _person: string; _pipeline: string }
        Returns: string
      }
      portfolio_main_kpi_values: {
        Args: { _month: string }
        Returns: {
          client_pipeline_id: string
          definition_id: string
          direction: string
          kpi_type: string
          main_group: string
          main_position: number
          name: string
          pipeline_code: string
          pipeline_name: string
          unit: string
          value: number
        }[]
      }
      portfolio_report_health: { Args: { _month: string }; Returns: Json }
      process_stage3_blockers: { Args: never; Returns: number }
      property_goal_progress: {
        Args: { _client_id: string; _fy: number }
        Returns: Json
      }
      q57_can_review: {
        Args: { _at?: string; _month: string }
        Returns: boolean
      }
      q57_review_open: {
        Args: { _at?: string; _month: string }
        Returns: boolean
      }
      queue_blocker_reminders: { Args: { _at?: string }; Returns: number }
      queue_overdue_digest: { Args: { _at?: string }; Returns: number }
      rd_associates: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      rd_booked: {
        Args: { _from: string; _to: string; _uid: string }
        Returns: number
      }
      rd_dials_band: { Args: { _dials_per_week: number }; Returns: string }
      rd_grade_label: { Args: { _total: number }; Returns: string }
      rd_grade_points: { Args: { _kpi: string; _v: number }; Returns: number }
      rd_grades: { Args: { _from: string; _to: string }; Returns: Json }
      rd_pacing: { Args: { _user: string; _year: number }; Returns: Json }
      rd_performance: {
        Args: { _from: string; _to: string; _user?: string }
        Returns: Json
      }
      rd_property_months: { Args: { _fy: number }; Returns: Json }
      rd_today: { Args: never; Returns: string }
      rd_week_goal: { Args: { _uid: string; _week: string }; Returns: number }
      reactivate_team_member: { Args: { _user: string }; Returns: undefined }
      recalc_client_assignments: {
        Args: { _client_id: string; _reset_manual?: boolean }
        Returns: Json
      }
      record_prelaunch_work: {
        Args: {
          _client: string
          _date: string
          _description: string
          _evidence?: string
          _pipeline: string
        }
        Returns: string
      }
      record_termination_notice: {
        Args: {
          _launch_id: string
          _notice_date: string
          _notice_file_path?: string
          _notice_from: string
          _reason?: string
        }
        Returns: string
      }
      refresh_gate_status: { Args: { _launch_id: string }; Returns: undefined }
      refresh_report_kpis: { Args: { _report_id: string }; Returns: number }
      relaunch_client: {
        Args: { _client_id: string; _plan_code: string }
        Returns: string
      }
      remind_client_approvals: { Args: never; Returns: number }
      remind_report_deadlines: { Args: never; Returns: number }
      report_due_date: { Args: { _month: string }; Returns: string }
      report_editable: { Args: { _report_id: string }; Returns: boolean }
      report_visible: { Args: { _report_id: string }; Returns: boolean }
      request_pipeline_activation: {
        Args: { _pipeline_code: string }
        Returns: string
      }
      request_terms_change: {
        Args: { _launch_id: string; _reason?: string; _terms: Json }
        Returns: Json
      }
      request_third_party_change: {
        Args: {
          _costs: string
          _items: string[]
          _launch_id: string
          _reason?: string
        }
        Returns: Json
      }
      resolve_approval_blocker: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      resume_launch: { Args: { _launch_id: string }; Returns: string }
      review_fetched_kpis: {
        Args: { _confirm?: boolean; _id: string; _values: Json }
        Returns: undefined
      }
      run_annual_revisions: { Args: { _today?: string }; Returns: Json }
      run_overdue_digest: { Args: never; Returns: number }
      save_activity_plan: {
        Args: {
          _cp: string
          _items: Json
          _month: string
          _plan?: string
          _submit?: boolean
        }
        Returns: string
      }
      save_department_month: {
        Args: {
          _meetings: number
          _month: string
          _outside: number
          _pipeline: string
        }
        Returns: undefined
      }
      save_department_target: {
        Args: {
          _approve?: boolean
          _definition: string
          _month: string
          _pipeline: string
          _target: number
        }
        Returns: undefined
      }
      save_influencer_program: {
        Args: { _contract?: string; _goals?: Json; _id: string }
        Returns: undefined
      }
      save_pipeline_baseline: {
        Args: {
          _cp: string
          _month: string
          _reason?: string
          _submit?: boolean
          _values: Json
        }
        Returns: undefined
      }
      scorecard_band: { Args: { _score: number }; Returns: string }
      scorecard_can_view: { Args: { _person: string }; Returns: boolean }
      scorecard_member_reports: {
        Args: { _month: string; _person: string }
        Returns: Json
      }
      set_pipeline_backup: {
        Args: { _backup: string; _member: string }
        Returns: undefined
      }
      set_plan_tools: {
        Args: { _custom: boolean; _id: string; _included: boolean }
        Returns: undefined
      }
      set_scorecard_bands: {
        Args: { _amber: number; _green: number }
        Returns: undefined
      }
      setup_required: { Args: never; Returns: boolean }
      shares_work_with: { Args: { _target: string }; Returns: boolean }
      shift_day0: {
        Args: { _launch_id: string; _new_day0: string; _reason: string }
        Returns: number
      }
      sign_gate: {
        Args: {
          _approval_file_path?: string
          _gate_id: string
          _notes?: string
        }
        Returns: undefined
      }
      source_mapping_status: {
        Args: { _source: string }
        Returns: {
          client_pipeline_id: string
          listings: number
        }[]
      }
      source_monthly_agg: {
        Args: { _from: string; _source: string; _to: string }
        Returns: {
          approved: boolean
          client_pipeline_id: string
          month: string
          vals: Json
        }[]
      }
      source_profile_monthly: {
        Args: { _from: string; _source: string; _to: string }
        Returns: {
          approved: boolean
          client_pipeline_id: string
          fetched_at: string
          mapping_id: string
          month: string
          vals: Json
        }[]
      }
      source_profile_names: {
        Args: { _source: string }
        Returns: {
          client_pipeline_id: string
          external_name: string
          mapping_id: string
        }[]
      }
      start_downgrade: {
        Args: {
          _from_launch_id: string
          _reason?: string
          _services?: Json
          _start_date: string
          _terms?: Json
          _to_plan_code: string
        }
        Returns: string
      }
      start_upgrade: {
        Args: {
          _from_launch_id: string
          _reason?: string
          _services?: Json
          _start_date?: string
          _terms?: Json
          _to_plan_code: string
        }
        Returns: string
      }
      targets_due: {
        Args: { _month?: string }
        Returns: {
          baseline: boolean
          client_code: string
          client_id: string
          client_pipeline_id: string
          direction: string
          hotel_name: string
          kpi_definition_id: string
          kpi_name: string
          pipeline_code: string
          pipeline_name: string
          prev_actual: number
          status: string
          suggested: number
          target: number
          target_id: string
          unit: string
        }[]
      }
      task_digest_items: {
        Args: { _on: string }
        Returns: {
          item: Json
          user_id: string
        }[]
      }
      task_gate_a_locked: { Args: { _task: string }; Returns: boolean }
      tasks_gate_a_locked: {
        Args: { _tasks: string[] }
        Returns: {
          locked: boolean
          task_id: string
        }[]
      }
      team_member_workload: { Args: { _user: string }; Returns: Json }
      team_scorecard: {
        Args: { _month?: string }
        Returns: {
          full_name: string
          kpi_pct: number
          launch_pct: number
          on_time_pct: number
          open_actions: number
          overall_score: number
          overdue_actions: number
          red_action_score: number
          reports_due: number
          reports_on_time: number
          role: string
          tasks_due: number
          tasks_on_time: number
          user_id: string
        }[]
      }
      transfer_team_member_work: {
        Args: {
          _deactivate?: boolean
          _default_to: string
          _from: string
          _module_overrides?: Json
        }
        Returns: Json
      }
      update_exit_item: {
        Args: { _evidence?: string; _status: string; _task: string }
        Returns: undefined
      }
      update_recurring_task: {
        Args: {
          _backup?: string
          _due?: string
          _evidence?: string
          _owner?: string
          _reason?: string
          _status: string
          _task: string
        }
        Returns: undefined
      }
      void_booking: {
        Args: { _booking_id: string; _reason: string }
        Returns: undefined
      }
      who_pays: {
        Args: {
          _client?: string
          _custom?: string
          _launch?: string
          _version?: string
        }
        Returns: Json
      }
      withdraw_termination_notice: {
        Args: { _launch_id: string; _note?: string }
        Returns: undefined
      }
      working_day_after: { Args: { _date: string }; Returns: string }
      working_days_after: {
        Args: { _end: string; _start: string }
        Returns: number
      }
    }
    Enums: {
      action_priority: "critical" | "high" | "medium" | "low"
      action_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "delayed"
        | "dropped"
      app_role:
        | "admin"
        | "management"
        | "bd_manager"
        | "pipeline_manager"
        | "team_member"
        | "client"
        | "finance"
        | "hr"
      doc_status: "pending" | "uploaded" | "verified" | "rejected"
      report_status: "draft" | "submitted" | "review" | "approved"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      action_priority: ["critical", "high", "medium", "low"],
      action_status: [
        "not_started",
        "in_progress",
        "completed",
        "delayed",
        "dropped",
      ],
      app_role: [
        "admin",
        "management",
        "bd_manager",
        "pipeline_manager",
        "team_member",
        "client",
        "finance",
        "hr",
      ],
      doc_status: ["pending", "uploaded", "verified", "rejected"],
      report_status: ["draft", "submitted", "review", "approved"],
    },
  },
} as const
