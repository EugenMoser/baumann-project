
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_generation": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"entity": string,"entity_id": number,"field": string,"id": number,"model": string,"output": string,"prompt_version": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"entity": string,"entity_id": number,"field": string,"id"?: never,"model": string,"output": string,"prompt_version": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: number,"field"?: string,"id"?: never,"model"?: string,"output"?: string,"prompt_version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"article": {
                  Row: {
                    "article_number": string,"description": string | null,"id": number,"material_id": number | null,"material_note": string | null,"name": string | null,"note": string | null,"product_id": number,"sort_order": number
                  }
                  Insert: {
                    "article_number": string,"description"?: string | null,"id"?: never,"material_id"?: number | null,"material_note"?: string | null,"name"?: string | null,"note"?: string | null,"product_id": number,"sort_order"?: number
                  }
                  Update: {
                    "article_number"?: string,"description"?: string | null,"id"?: never,"material_id"?: number | null,"material_note"?: string | null,"name"?: string | null,"note"?: string | null,"product_id"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "material"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "article_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product"
      referencedColumns: ["id"]
    }
                  ]
                },"article_attribute": {
                  Row: {
                    "article_id": number,"attribute_id": number,"value_decimal": number | null,"value_text": string | null
                  }
                  Insert: {
                    "article_id": number,"attribute_id": number,"value_decimal"?: number | null,"value_text"?: string | null
                  }
                  Update: {
                    "article_id"?: number,"attribute_id"?: number,"value_decimal"?: number | null,"value_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_attribute_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "article"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "article_attribute_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "variant"
      referencedColumns: ["article_id"]
    },{
      foreignKeyName: "article_attribute_attribute_id_fkey"
      columns: ["attribute_id"]
isOneToOne: false
      referencedRelation: "attribute"
      referencedColumns: ["id"]
    }
                  ]
                },"article_packaging": {
                  Row: {
                    "article_id": number,"label": string | null,"quantity": number,"sort_order": number
                  }
                  Insert: {
                    "article_id": number,"label"?: string | null,"quantity": number,"sort_order"?: number
                  }
                  Update: {
                    "article_id"?: number,"label"?: string | null,"quantity"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_packaging_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "article"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "article_packaging_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "variant"
      referencedColumns: ["article_id"]
    }
                  ]
                },"attribute": {
                  Row: {
                    "data_type": Database["public"]['Enums']["attribute_data_type"],"id": number,"key": string,"label": string,"sort_order": number,"unit": string | null
                  }
                  Insert: {
                    "data_type": Database["public"]['Enums']["attribute_data_type"],"id"?: never,"key": string,"label": string,"sort_order"?: number,"unit"?: string | null
                  }
                  Update: {
                    "data_type"?: Database["public"]['Enums']["attribute_data_type"],"id"?: never,"key"?: string,"label"?: string,"sort_order"?: number,"unit"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"category": {
                  Row: {
                    "id": number,"intro_text": string,"name": string,"seo_description": string | null,"seo_title": string | null,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "id"?: never,"intro_text"?: string,"name": string,"seo_description"?: string | null,"seo_title"?: string | null,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "id"?: never,"intro_text"?: string,"name"?: string,"seo_description"?: string | null,"seo_title"?: string | null,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"category_attribute": {
                  Row: {
                    "attribute_id": number,"category_id": number,"sort_order": number
                  }
                  Insert: {
                    "attribute_id": number,"category_id": number,"sort_order"?: number
                  }
                  Update: {
                    "attribute_id"?: number,"category_id"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_attribute_attribute_id_fkey"
      columns: ["attribute_id"]
isOneToOne: false
      referencedRelation: "attribute"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "category_attribute_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category"
      referencedColumns: ["id"]
    }
                  ]
                },"certificate": {
                  Row: {
                    "id": number,"preview_alt": string,"preview_height": number,"preview_path": string,"preview_width": number,"sort_order": number,"standard": string,"title": string
                  }
                  Insert: {
                    "id"?: never,"preview_alt": string,"preview_height": number,"preview_path": string,"preview_width": number,"sort_order"?: number,"standard": string,"title": string
                  }
                  Update: {
                    "id"?: never,"preview_alt"?: string,"preview_height"?: number,"preview_path"?: string,"preview_width"?: number,"sort_order"?: number,"standard"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"certificate_document": {
                  Row: {
                    "certificate_id": number,"language": string,"storage_path": string
                  }
                  Insert: {
                    "certificate_id": number,"language": string,"storage_path": string
                  }
                  Update: {
                    "certificate_id"?: number,"language"?: string,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificate_document_certificate_id_fkey"
      columns: ["certificate_id"]
isOneToOne: false
      referencedRelation: "certificate"
      referencedColumns: ["id"]
    }
                  ]
                },"color": {
                  Row: {
                    "family": string,"hex_code": string,"id": number,"name": string,"ral_reference": string | null
                  }
                  Insert: {
                    "family": string,"hex_code": string,"id"?: never,"name": string,"ral_reference"?: string | null
                  }
                  Update: {
                    "family"?: string,"hex_code"?: string,"id"?: never,"name"?: string,"ral_reference"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"material": {
                  Row: {
                    "code": string,"id": number,"name": string
                  }
                  Insert: {
                    "code": string,"id"?: never,"name": string
                  }
                  Update: {
                    "code"?: string,"id"?: never,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"media": {
                  Row: {
                    "alt_origin": Database["public"]['Enums']["content_origin"],"alt_text": string,"height": number,"id": number,"storage_path": string,"width": number
                  }
                  Insert: {
                    "alt_origin"?: Database["public"]['Enums']["content_origin"],"alt_text": string,"height": number,"id"?: never,"storage_path": string,"width": number
                  }
                  Update: {
                    "alt_origin"?: Database["public"]['Enums']["content_origin"],"alt_text"?: string,"height"?: number,"id"?: never,"storage_path"?: string,"width"?: number
                  }
                  Relationships: [
                    
                  ]
                },"product": {
                  Row: {
                    "category_id": number,"created_at": string,"description": string | null,"description_origin": Database["public"]['Enums']["content_origin"],"id": number,"legacy_product_id": number | null,"material_id": number | null,"material_note": string | null,"name": string,"search": unknown,"seo_description": string | null,"seo_origin": Database["public"]['Enums']["content_origin"],"seo_title": string | null,"slug": string,"sort_order": number,"status": Database["public"]['Enums']["product_status"],"subtitle": string | null,"updated_at": string
                  }
                  Insert: {
                    "category_id": number,"created_at"?: string,"description"?: string | null,"description_origin"?: Database["public"]['Enums']["content_origin"],"id"?: never,"legacy_product_id"?: number | null,"material_id"?: number | null,"material_note"?: string | null,"name": string,"search"?: never,"seo_description"?: string | null,"seo_origin"?: Database["public"]['Enums']["content_origin"],"seo_title"?: string | null,"slug": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["product_status"],"subtitle"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: number,"created_at"?: string,"description"?: string | null,"description_origin"?: Database["public"]['Enums']["content_origin"],"id"?: never,"legacy_product_id"?: number | null,"material_id"?: number | null,"material_note"?: string | null,"name"?: string,"search"?: never,"seo_description"?: string | null,"seo_origin"?: Database["public"]['Enums']["content_origin"],"seo_title"?: string | null,"slug"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["product_status"],"subtitle"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "material"
      referencedColumns: ["id"]
    }
                  ]
                },"product_accessory": {
                  Row: {
                    "article_id": number,"product_id": number,"sort_order": number
                  }
                  Insert: {
                    "article_id": number,"product_id": number,"sort_order"?: number
                  }
                  Update: {
                    "article_id"?: number,"product_id"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_accessory_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "article"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_accessory_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "variant"
      referencedColumns: ["article_id"]
    },{
      foreignKeyName: "product_accessory_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product"
      referencedColumns: ["id"]
    }
                  ]
                },"product_color": {
                  Row: {
                    "color_id": number,"is_default": boolean,"product_id": number,"sort_order": number,"suffix": string | null
                  }
                  Insert: {
                    "color_id": number,"is_default"?: boolean,"product_id": number,"sort_order"?: number,"suffix"?: string | null
                  }
                  Update: {
                    "color_id"?: number,"is_default"?: boolean,"product_id"?: number,"sort_order"?: number,"suffix"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_color_color_id_fkey"
      columns: ["color_id"]
isOneToOne: false
      referencedRelation: "color"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_color_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product"
      referencedColumns: ["id"]
    }
                  ]
                },"product_media": {
                  Row: {
                    "media_id": number,"product_id": number,"role": Database["public"]['Enums']["media_role"],"sort_order": number
                  }
                  Insert: {
                    "media_id": number,"product_id": number,"role": Database["public"]['Enums']["media_role"],"sort_order"?: number
                  }
                  Update: {
                    "media_id"?: number,"product_id"?: number,"role"?: Database["public"]['Enums']["media_role"],"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_media_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_media_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "variant": {
                  Row: {
                    "article_id": number | null,"article_number": string | null,"article_sort_order": number | null,"color_id": number | null,"color_sort_order": number | null,"is_default": boolean | null,"order_number": string | null,"product_id": number | null,"suffix": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "product"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_color_color_id_fkey"
      columns: ["color_id"]
isOneToOne: false
      referencedRelation: "color"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "import_catalog":
{ Args: { "payload": Json }; Returns: Json
                           },
"import_certificates":
{ Args: { "payload": Json }; Returns: Json
                           },
"remove_catalog":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"search_catalog":
{ Args: { "max_results"?: number,"q": string }; Returns: {
              "category_slug": string,"match_kind": string,"matched_numbers": (string)[],"name": string,"product_slug": string,"rank": number,"subtitle": string
            }[]
                           }
          }
          Enums: {
            "attribute_data_type": "decimal"|"text","content_origin": "human"|"ai"|"ai_edited","media_role": "thumbnail"|"gallery","product_status": "draft"|"published"|"archived"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "attribute_data_type": ["decimal", "text"],"content_origin": ["human", "ai", "ai_edited"],"media_role": ["thumbnail", "gallery"],"product_status": ["draft", "published", "archived"]
          }
        }
} as const
