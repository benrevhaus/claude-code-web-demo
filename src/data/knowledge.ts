export const knowledgeBase = [
  { id: "KB001", title: "Return Policy", category: "policies", content: "All items can be returned within the return window specified on the product page (14-60 days). Items must be in original condition with tags attached. Free return shipping for VIP and Premium customers. Standard customers pay a flat $5.95 return shipping fee. Refunds processed within 3-5 business days of receipt." },
  { id: "KB002", title: "Shipping Times", category: "shipping", content: "Standard shipping: 5-7 business days. Expedited: 2-3 business days. Overnight: Next business day (orders before 2pm EST). Free standard shipping on orders over $100. VIP customers get free expedited shipping." },
  { id: "KB003", title: "Damaged Item Policy", category: "policies", content: "Damaged items are replaced at no charge. Customer does not need to return the damaged item. Replacement ships within 1 business day. A $30 store credit is automatically applied for the inconvenience." },
  { id: "KB004", title: "Price Match Guarantee", category: "policies", content: "We match competitor prices within 14 days of purchase. Applies to identical items from authorized retailers. Submit price match request via email or chat with link to competitor listing." },
  { id: "KB005", title: "Loyalty Tiers", category: "account", content: "Standard: 0-$999 lifetime spend. Premium: $1000-$2999. VIP: $3000+. VIP benefits: free expedited shipping, priority support, early access to sales, extended return windows, dedicated account manager." },
  { id: "KB006", title: "Order Cancellation", category: "orders", content: "Orders can be cancelled within 1 hour of placement. After 1 hour, orders in processing cannot be cancelled. Orders that have shipped must go through the return process." },
  { id: "KB007", title: "Product Care Instructions", category: "products", content: "Outerwear: Machine wash cold, hang dry. Footwear: Spot clean with damp cloth. Gear: Follow product-specific care label. All items: Do not bleach or iron." },
  { id: "KB008", title: "International Shipping", category: "shipping", content: "We ship to 45 countries. International orders: 7-14 business days. Customs duties paid by customer. No returns on international orders except for defective items." },
];

export const supportPolicies = [
  { id: "SP001", name: "Auto-resolve WISMO", description: "Where Is My Order queries with active tracking are auto-resolved with tracking info", threshold: 0.95 },
  { id: "SP002", name: "VIP Escalation", description: "VIP customers with negative sentiment auto-escalated to senior agent", threshold: 0.8 },
  { id: "SP003", name: "Return Auto-approve", description: "Returns within window for items under $100 auto-approved", threshold: 0.9 },
  { id: "SP004", name: "Address Change Self-Serve", description: "Address changes for unshipped orders handled via self-serve", threshold: 0.95 },
  { id: "SP005", name: "Product FAQ Deflection", description: "Common product questions answered via KB before reaching agent", threshold: 0.85 },
];
