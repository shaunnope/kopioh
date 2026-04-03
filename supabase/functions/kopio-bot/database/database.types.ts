export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = "user" | "moderator" | "admin"
export type ContentType = "message" | "poll"

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: number
          created_at: string
          role: UserRole
        }
        Insert: {
          id: number
          created_at?: string
          role?: UserRole
        }
        Update: {
          id?: number
          created_at?: string
          role?: UserRole
        }
        Relationships: []
      }
      connections: {
        Row: {
          id: string
          broadcast_id: number
          submit_id: number
          logs_id: number | null
          created_at: string
        }
        Insert: {
          id?: string
          broadcast_id: number
          submit_id: number
          logs_id?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          broadcast_id?: number
          submit_id?: number
          logs_id?: number | null
          created_at?: string
        }
        Relationships: []
      }
      connection_roles: {
        Row: {
          user_id: number
          connection_id: string
          role: UserRole
          created_at: string
        }
        Insert: {
          user_id: number
          connection_id: string
          role?: UserRole
          created_at?: string
        }
        Update: {
          user_id?: number
          connection_id?: string
          role?: UserRole
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_roles_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          chat_id: number
          data: Json
        }
        Insert: {
          chat_id: number
          data?: Json
        }
        Update: {
          chat_id?: number
          data?: Json
        }
        Relationships: []
      }
      submissions: {
        Row: {
          id: string
          broadcast_id: number
          created_by: number
          content: Json
          content_type: ContentType
          original_content: Json | null
          created_at: string
          in_review: string | null
          reviewed_by: number | null
          reviewed_at: string | null
          posted_at: string | null
          is_rejected: boolean
        }
        Insert: {
          id?: string
          broadcast_id: number
          created_by: number
          content: Json
          content_type?: ContentType
          original_content?: Json | null
          created_at?: string
          in_review?: string | null
          reviewed_by?: number | null
          reviewed_at?: string | null
          posted_at?: string | null
          is_rejected?: boolean
        }
        Update: {
          id?: string
          broadcast_id?: number
          created_by?: number
          content?: Json
          content_type?: ContentType
          original_content?: Json | null
          created_at?: string
          in_review?: string | null
          reviewed_by?: number | null
          reviewed_at?: string | null
          posted_at?: string | null
          is_rejected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      content_type: ContentType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
