import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types/database'

export interface CartItem {
  product:  Pick<Product, 'id' | 'name' | 'price_cents' | 'images' | 'seller_id'>
  quantity: number
}

interface CartStore {
  items:        CartItem[]
  addItem:      (product: CartItem['product'], quantity?: number) => void
  removeItem:   (productId: string) => void
  updateQty:    (productId: string, quantity: number) => void
  clearCart:    () => void
  totalItems:   () => number
  totalCents:   () => number
  shippingCents:() => number
  grandTotal:   () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, quantity = 1) => {
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id)
          if (existing) {
            return { items: state.items.map(i =>
              i.product.id === product.id
                ? { ...i, quantity: i.quantity + quantity }
                : i
            )}
          }
          return { items: [...state.items, { product, quantity }] }
        })
      },

      removeItem: (productId) => {
        set(state => ({ items: state.items.filter(i => i.product.id !== productId) }))
      },

      updateQty: (productId, quantity) => {
        if (quantity <= 0) { get().removeItem(productId); return }
        set(state => ({
          items: state.items.map(i =>
            i.product.id === productId ? { ...i, quantity } : i
          )
        }))
      },

      clearCart: () => set({ items: [] }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalCents: () => get().items.reduce(
        (sum, i) => sum + i.product.price_cents * i.quantity, 0
      ),

      shippingCents: () => get().totalCents() >= 50000 ? 0 : 9900,

      grandTotal: () => get().totalCents() + get().shippingCents(),
    }),
    {
      name: 'spaza-cart',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
