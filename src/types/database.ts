// Auto-generated types matching supabase/schema.sql
// Regenerate with: npx supabase gen types typescript --local > src/types/database.ts

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id:            string
          email:         string
          full_name:     string | null
          phone:         string | null
          avatar_url:    string | null
          role:          'buyer' | 'seller' | 'admin'
          address_line1: string | null
          address_line2: string | null
          city:          string | null
          province:      string | null
          postal_code:   string | null
          country:       string
          created_at:    string
          updated_at:    string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']>
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
      }
      sellers: {
        Row: {
          id:                string
          user_id:           string
          store_name:        string
          store_slug:        string
          store_description: string | null
          store_logo_url:    string | null
          store_banner_url:  string | null
          business_name:     string | null
          reg_number:        string | null
          vat_number:        string | null
          category:          string | null
          plan:              'basic' | 'pro' | 'elite'
          status:            'pending' | 'active' | 'suspended' | 'terminated'
          total_sales:       number
          total_orders:      number
          rating:            number
          review_count:      number
          approved_at:       string | null
          created_at:        string
          updated_at:        string
        }
        Insert: Partial<Database['public']['Tables']['sellers']['Row']>
        Update: Partial<Database['public']['Tables']['sellers']['Row']>
      }
      products: {
        Row: {
          id:                  string
          seller_id:           string
          category_id:         string | null
          name:                string
          slug:                string
          description:         string | null
          short_desc:          string | null
          sku:                 string | null
          price_cents:         number
          compare_price_cents: number | null
          stock_qty:           number
          status:              'draft' | 'active' | 'out_of_stock' | 'removed'
          is_featured:         boolean
          images:              string[]
          view_count:          number
          sale_count:          number
          rating:              number
          review_count:        number
          published_at:        string | null
          created_at:          string
          updated_at:          string
        }
        Insert: Partial<Database['public']['Tables']['products']['Row']>
        Update: Partial<Database['public']['Tables']['products']['Row']>
      }
      orders: {
        Row: {
          id:                string
          order_number:      string
          buyer_id:          string
          shipping_name:     string
          shipping_phone:    string | null
          shipping_line1:    string
          shipping_line2:    string | null
          shipping_city:     string
          shipping_province: string
          shipping_postal:   string
          shipping_country:  string
          subtotal_cents:    number
          shipping_cents:    number
          discount_cents:    number
          total_cents:       number
          status:            'pending' | 'payment_pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          buyer_note:        string | null
          created_at:        string
          updated_at:        string
        }
        Insert: Partial<Database['public']['Tables']['orders']['Row']>
        Update: Partial<Database['public']['Tables']['orders']['Row']>
      }
      order_items: {
        Row: {
          id:                  string
          order_id:            string
          product_id:          string
          seller_id:           string
          product_name:        string
          product_image:       string | null
          sku:                 string | null
          quantity:            number
          unit_price_cents:    number
          total_cents:         number
          commission_rate:     number
          commission_cents:    number
          seller_payout_cents: number
          tracking_number:     string | null
          shipped_at:          string | null
          delivered_at:        string | null
          created_at:          string
        }
        Insert: Partial<Database['public']['Tables']['order_items']['Row']>
        Update: Partial<Database['public']['Tables']['order_items']['Row']>
      }
      payments: {
        Row: {
          id:                     string
          order_id:               string
          payfast_payment_id:     string | null
          payfast_pf_payment_id:  string | null
          amount_cents:           number
          status:                 'pending' | 'complete' | 'failed' | 'cancelled' | 'refunded'
          payment_method:         string | null
          itn_payload:            Record<string, string> | null
          paid_at:                string | null
          created_at:             string
          updated_at:             string
        }
        Insert: Partial<Database['public']['Tables']['payments']['Row']>
        Update: Partial<Database['public']['Tables']['payments']['Row']>
      }
      reviews: {
        Row: {
          id:          string
          product_id:  string
          buyer_id:    string
          order_id:    string | null
          rating:      number
          title:       string | null
          body:        string | null
          is_verified: boolean
          is_approved: boolean
          created_at:  string
        }
        Insert: Partial<Database['public']['Tables']['reviews']['Row']>
        Update: Partial<Database['public']['Tables']['reviews']['Row']>
      }
      categories: {
        Row: {
          id:          string
          name:        string
          slug:        string
          description: string | null
          icon:        string | null
          parent_id:   string | null
          sort_order:  number
          is_active:   boolean
          created_at:  string
        }
        Insert: Partial<Database['public']['Tables']['categories']['Row']>
        Update: Partial<Database['public']['Tables']['categories']['Row']>
      }
      wishlists: {
        Row: {
          id:         string
          user_id:    string
          product_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['wishlists']['Row']>
        Update: Partial<Database['public']['Tables']['wishlists']['Row']>
      }
      seller_subscriptions: {
        Row: {
          id:                      string
          seller_id:               string
          plan:                    'basic' | 'pro' | 'elite'
          status:                  'active' | 'past_due' | 'cancelled' | 'expired'
          payfast_token:           string | null
          amount_cents:            number
          current_period_start:    string
          current_period_end:      string
          next_billing_date:       string | null
          cancelled_at:            string | null
          created_at:              string
          updated_at:              string
        }
        Insert: Partial<Database['public']['Tables']['seller_subscriptions']['Row']>
        Update: Partial<Database['public']['Tables']['seller_subscriptions']['Row']>
      }
    }
  }
}

// Convenience types
export type Profile             = Database['public']['Tables']['profiles']['Row']
export type Seller              = Database['public']['Tables']['sellers']['Row']
export type Product             = Database['public']['Tables']['products']['Row']
export type Order               = Database['public']['Tables']['orders']['Row']
export type OrderItem           = Database['public']['Tables']['order_items']['Row']
export type Payment             = Database['public']['Tables']['payments']['Row']
export type Review              = Database['public']['Tables']['reviews']['Row']
export type Category            = Database['public']['Tables']['categories']['Row']
export type SellerSubscription  = Database['public']['Tables']['seller_subscriptions']['Row']
