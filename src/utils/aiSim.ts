import { customers } from "../data/customers";
import { orders } from "../data/orders";
import { products } from "../data/products";
import { shipments } from "../data/shipments";
import { knowledgeBase } from "../data/knowledge";

export function lookupCustomer(id: string) {
  return customers.find((c) => c.id === id) || null;
}

export function lookupOrder(id: string) {
  return orders.find((o) => o.id === id) || null;
}

export function lookupOrdersForCustomer(customerId: string) {
  return orders.filter((o) => o.customer_id === customerId);
}

export function lookupProduct(id: string) {
  return products.find((p) => p.id === id) || null;
}

export function lookupShipment(orderId: string) {
  return shipments.find((s) => s.order_id === orderId) || null;
}

export function searchKB(query: string) {
  const q = query.toLowerCase();
  return knowledgeBase.filter(
    (k) => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q) || k.category.toLowerCase().includes(q)
  );
}

export function simulateAIResponse(prompt: string, customerId?: string, orderId?: string): string {
  const p = prompt.toLowerCase();
  const customer = customerId ? lookupCustomer(customerId) : null;
  const order = orderId ? lookupOrder(orderId) : null;
  const shipment = orderId ? lookupShipment(orderId) : null;

  if (p.includes("where") && p.includes("order")) {
    if (order && shipment) {
      return `Order ${order.id} is currently **${shipment.status}**. Last update: ${shipment.location} (${new Date(shipment.last_update).toLocaleDateString()}). Estimated delivery: ${shipment.estimated_delivery}. Carrier: ${shipment.carrier}, tracking: ${shipment.tracking}.`;
    }
    if (order) return `Order ${order.id} is in **${order.status}** status. ${order.tracking ? `Tracking: ${order.tracking}` : "Tracking not yet available."}`;
    return "I'd be happy to look up the order. Could you provide the order number?";
  }

  if (p.includes("history") || p.includes("summarize")) {
    if (customer) {
      const custOrders = lookupOrdersForCustomer(customer.id);
      return `**${customer.name}** — ${customer.tier} customer\n- Lifetime value: $${customer.lifetime_value.toLocaleString()}\n- ${customer.orders_count} orders (${custOrders.length} recent)\n- Member since ${customer.created}\n- Current sentiment: ${customer.sentiment}`;
    }
    return "Please select a customer to view their history.";
  }

  if (p.includes("return") && p.includes("eligible")) {
    if (order) {
      const product = order.items[0] ? lookupProduct(order.items[0].product_id) : null;
      if (product) {
        const orderDate = new Date(order.date);
        const now = new Date("2025-03-14");
        const daysSince = Math.floor((now.getTime() - orderDate.getTime()) / 86400000);
        const eligible = daysSince <= product.return_window_days;
        return eligible
          ? `**Eligible for return.** ${product.name} has a ${product.return_window_days}-day return window. Order placed ${daysSince} days ago.${customer?.tier === "Standard" ? " Note: $5.95 return shipping fee applies." : " Free return shipping for " + customer?.tier + " customers."}`
          : `**Not eligible.** The ${product.return_window_days}-day return window has expired (${daysSince} days since purchase).`;
      }
    }
    return "I'll check return eligibility. Please provide the order number.";
  }

  if (p.includes("draft") && p.includes("delayed")) {
    if (customer && order && shipment) {
      return `Hi ${customer.name.split(" ")[0]},\n\nI apologize for the delay on your order ${order.id}. Your package is currently at: ${shipment.location}. The updated delivery estimate is **${shipment.estimated_delivery}**.\n\nAs a gesture of goodwill, I've applied a 10% discount to your account for your next purchase.\n\nPlease don't hesitate to reach out if you need anything else.\n\nBest regards,\nSupport Team`;
    }
    return "I'll draft a response for the delayed shipment. Let me pull up the order details.";
  }

  return "I can help with that. Try asking:\n- **Where is this order?**\n- **Summarize this customer's history**\n- **Is this return eligible?**\n- **Draft response for delayed shipment**";
}

export function classifyTicket(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes("where") || s.includes("tracking") || s.includes("order status")) return "order_tracking";
  if (s.includes("return") || s.includes("exchange")) return "return_request";
  if (s.includes("delay")) return "shipping_delay";
  if (s.includes("damage") || s.includes("broken") || s.includes("defective")) return "damaged_item";
  if (s.includes("address")) return "address_change";
  if (s.includes("cancel")) return "cancellation";
  if (s.includes("product") || s.includes("size") || s.includes("color")) return "product_question";
  return "general_inquiry";
}

export function generateConfidence(category: string): number {
  const map: Record<string, number> = {
    order_tracking: 0.97,
    return_request: 0.94,
    shipping_delay: 0.91,
    address_change: 0.98,
    product_question: 0.82,
    damaged_item: 0.88,
    cancellation: 0.93,
    general_inquiry: 0.72,
  };
  return map[category] || 0.75;
}
