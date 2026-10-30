export interface Img { id: number; base: string; alt: string; src: string; srcSet: string; thumb: string }
export interface Variant { id: number; size: string; color: string; colorHex: string; sku: string | null; stock: number }
export interface ProductSummary {
  id: number; slug: string; name: string; price: number; oldPrice: number | null; isNew: boolean; isFeatured: boolean;
  status: string; category: { slug: string; name: string }; image: Img | null; secondImage: Img | null; inStock: boolean;
  colors: { name: string; hex: string }[]; sizes: string[]; createdAt: string;
}
export interface ProductDetail extends ProductSummary {
  description: string; attributes: { name: string; value: string }[]; images: Img[]; variants: Variant[]; categoryId: number; updatedAt: string;
}
export interface Category { id: number; slug: string; name: string; description: string; image: Img | null; sortOrder: number; isActive: boolean; productCount: number }
export interface DeliveryMethod { id: string; name: string; description: string; price: number; variable: boolean; freeFrom: number | null; kind: 'branch' | 'address' | 'pickup'; enabled: boolean }
export interface PaymentMethod { id: 'cod' | 'card'; name: string; description: string; enabled: boolean }
export interface ShopConfig {
  store: { name: string; tagline: string; logo: string; description: string; currency: string };
  hero: { eyebrow: string; title: string; subtitle: string; image: string; ctaPrimary: string; ctaSecondary: string };
  contacts: { phone: string; email: string; address: string; hours: string; instagram: string; facebook: string; telegram: string };
  advantages: { title: string; text: string }[];
  deliveryMethods: DeliveryMethod[];
  paymentMethods: PaymentMethod[];
  features: { onlinePayment: boolean; novaPoshta: boolean };
  categories: Category[];
}
export interface PricedLine {
  variantId: number; productId: number; name: string; variantLabel: string; sku: string | null; unitPrice: number; oldPrice: number | null;
  qty: number; stock: number; image: string | null; slug: string; available: boolean; problem?: string;
}
export interface PricedCart { lines: PricedLine[]; subtotal: number; discount: number; ok: boolean }
export interface OrderItem { id: number; name: string; variantLabel: string; unitPrice: number; oldPrice: number | null; qty: number; image: string | null }
export interface PublicOrder {
  number: string; status: string; statusLabel: string; paymentMethod: string; paymentStatus: string; deliveryMethodName: string;
  subtotal: number; discount: number; deliveryPrice: number; total: number; createdAt: string; items: OrderItem[]; canPay: boolean;
  contact: { firstName: string; lastName: string; phone: string; email: string; city: string; address: string };
}
export interface PaymentForm { action: string; data: string; signature: string }
