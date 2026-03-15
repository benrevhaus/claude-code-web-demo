export interface Ticket {
  id: string;
  customer_id: string;
  order_id: string | null;
  channel: "email" | "chat" | "phone" | "social";
  category: string;
  subject: string;
  summary: string;
  status: "open" | "pending" | "resolved" | "escalated";
  priority: "low" | "medium" | "high" | "urgent";
  sentiment: "positive" | "neutral" | "frustrated" | "angry";
  created: string;
  resolved: string | null;
  agent: string;
  automation_candidate: boolean;
  gorgias_synced: boolean;
  ai_draft: string;
  resolution: string | null;
  product_id: string | null;
}

export const tickets: Ticket[] = [
  { id: "TKT-5001", customer_id: "C003", order_id: "ORD-10044", channel: "email", category: "shipping_delay", subject: "Order delayed — need update", summary: "Customer frustrated about FedEx delay on order ORD-10044. Expected delivery was March 9.", status: "open", priority: "high", sentiment: "frustrated", created: "2025-03-11T09:15:00Z", resolved: null, agent: "Agent Maya", automation_candidate: true, gorgias_synced: true, ai_draft: "Hi Emily, I'm sorry about the delay on your order. I've checked with FedEx and your package is now in transit from the regional hub. The updated delivery estimate is March 14. I've added a 10% credit to your account for the inconvenience.", resolution: null, product_id: "P005" },
  { id: "TKT-5002", customer_id: "C002", order_id: "ORD-10043", channel: "chat", category: "order_tracking", subject: "Where is my order?", summary: "Customer asking for tracking update on USPS shipment.", status: "open", priority: "medium", sentiment: "neutral", created: "2025-03-12T14:30:00Z", resolved: null, agent: "Agent Leo", automation_candidate: true, gorgias_synced: true, ai_draft: "Hi James, your order ORD-10043 is currently in transit via USPS. Tracking number: 9400111899223100012. It's expected to arrive by March 15.", resolution: null, product_id: "P001" },
  { id: "TKT-5003", customer_id: "C007", order_id: "ORD-10049", channel: "email", category: "return_request", subject: "Want to return beanie", summary: "Customer wants to return Merino Wool Beanie, ordered 1 day ago.", status: "open", priority: "low", sentiment: "neutral", created: "2025-03-14T08:00:00Z", resolved: null, agent: "Agent Maya", automation_candidate: true, gorgias_synced: false, ai_draft: "Hi Amanda, you're within the 30-day return window for your Merino Wool Beanie. I've initiated a return label that will be sent to afoster@gmail.com. Once we receive the item, your refund of $67.00 will be processed within 3-5 business days.", resolution: null, product_id: "P002" },
  { id: "TKT-5004", customer_id: "C005", order_id: null, channel: "phone", category: "product_question", subject: "Sizing question for Trail Running Shoes", summary: "VIP customer called asking about sizing for Trail Running Shoes. Wants to know if they run large.", status: "resolved", priority: "medium", sentiment: "positive", created: "2025-03-13T11:45:00Z", resolved: "2025-03-13T11:52:00Z", agent: "Agent Leo", automation_candidate: false, gorgias_synced: false, ai_draft: "", resolution: "Advised customer that Trail Running Shoes run half-size large. Recommended ordering half size down. Customer will place order.", product_id: "P004" },
  { id: "TKT-5005", customer_id: "C001", order_id: "ORD-10042", channel: "social", category: "positive_feedback", subject: "Love the jacket!", summary: "VIP customer posted positive review on Instagram about Recycled Down Jacket.", status: "resolved", priority: "low", sentiment: "positive", created: "2025-03-10T16:20:00Z", resolved: "2025-03-10T16:35:00Z", agent: "Agent Maya", automation_candidate: false, gorgias_synced: true, ai_draft: "", resolution: "Thanked customer and offered 15% VIP discount on next purchase.", product_id: "P003" },
  { id: "TKT-5006", customer_id: "C006", order_id: "ORD-10048", channel: "email", category: "damaged_item", subject: "Tent arrived damaged", summary: "Customer reports 4-Season Tent has torn zipper on delivery.", status: "escalated", priority: "urgent", sentiment: "frustrated", created: "2025-03-12T10:05:00Z", resolved: null, agent: "Agent Leo", automation_candidate: false, gorgias_synced: true, ai_draft: "Hi David, I'm very sorry about the damage to your 4-Season Tent. We're shipping a replacement immediately at no charge. You don't need to return the damaged tent. The new one should arrive within 3 business days. I've also added a $30 store credit for the trouble.", resolution: null, product_id: "P010" },
  { id: "TKT-5007", customer_id: "C004", order_id: "ORD-10045", channel: "chat", category: "order_status", subject: "When will order ship?", summary: "Customer asking when processing order will ship.", status: "open", priority: "low", sentiment: "neutral", created: "2025-03-13T15:10:00Z", resolved: null, agent: "Agent Maya", automation_candidate: true, gorgias_synced: true, ai_draft: "Hi Michael, your order ORD-10045 is currently being processed and should ship within 1-2 business days. You'll receive a tracking number via email once it's on its way.", resolution: null, product_id: "P008" },
  { id: "TKT-5008", customer_id: "C008", order_id: null, channel: "email", category: "address_change", subject: "Need to update shipping address", summary: "Customer wants to change shipping address for upcoming orders.", status: "open", priority: "medium", sentiment: "positive", created: "2025-03-14T09:30:00Z", resolved: null, agent: "Agent Leo", automation_candidate: true, gorgias_synced: false, ai_draft: "Hi Robert, I've updated your default shipping address. Any future orders will ship to the new address. Note that order ORD-10050 has already been delivered and cannot be changed.", resolution: null, product_id: null },
];
