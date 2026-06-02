import { createServerSupabaseClient } from '@/lib/supabase'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import HeroBanner from '@/components/shop/HeroBanner'
import CategoryGrid from '@/components/shop/CategoryGrid'
import ProductGrid from '@/components/shop/ProductGrid'
import PromoStrip from '@/components/shop/PromoStrip'

export default async function HomePage() {
  const supabase = createServerSupabaseClient()

  // Fetch featured products
  const { data: featuredProducts } = await supabase
    .from('products')
    .select(`
      id, name, slug, price_cents, compare_price_cents,
      images, rating, review_count, is_featured,
      sellers ( store_name, store_slug )
    `)
    .eq('status', 'active')
    .eq('is_featured', true)
    .order('sale_count', { ascending: false })
    .limit(10)

  // Fetch all active products
  const { data: allProducts } = await supabase
    .from('products')
    .select(`
      id, name, slug, price_cents, compare_price_cents,
      images, rating, review_count,
      sellers ( store_name, store_slug )
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <>
      <Header />
      <main>
        <HeroBanner />
        <PromoStrip />
        <section className="max-w-[1320px] mx-auto px-5 mt-10">
          <CategoryGrid categories={categories || []} />
        </section>
        {featuredProducts && featuredProducts.length > 0 && (
          <section className="max-w-[1320px] mx-auto px-5 mt-10">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-display text-3xl text-gray-800 tracking-wide">Featured Products</h2>
              <a href="/products" className="text-spaza-red text-sm font-semibold hover:underline">View All →</a>
            </div>
            <ProductGrid products={featuredProducts as any} />
          </section>
        )}
        {allProducts && (
          <section className="max-w-[1320px] mx-auto px-5 mt-10">
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="font-display text-3xl text-gray-800 tracking-wide">New Arrivals</h2>
              <a href="/products" className="text-spaza-red text-sm font-semibold hover:underline">Shop All →</a>
            </div>
            <ProductGrid products={allProducts as any} />
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}
