export interface PhoneCall {
  id: string;
  customer_id: string;
  caller_name: string;
  phone: string;
  started: string;
  duration_sec: number;
  status: "incoming" | "active" | "completed";
  notes: string;
  ai_summary: string;
  ticket_created: boolean;
  ticket_id: string | null;
  order_id: string | null;
  category: string;
}

export const phoneCalls: PhoneCall[] = [
  { id: "CALL-001", customer_id: "C005", caller_name: "Lisa Park", phone: "+1-555-0411", started: "2025-03-14T10:00:00Z", duration_sec: 420, status: "completed", notes: "Customer wants to exchange Trail Running Shoes for different size. Already placed order but shoes haven't shipped yet.", ai_summary: "VIP customer Lisa Park called regarding order ORD-10046. Wants size exchange for Trail Running Shoes (half size down). Order delivered — initiated return + new order at expedited shipping, no charge.", ticket_created: true, ticket_id: "TKT-P001", order_id: "ORD-10046", category: "exchange_request" },
  { id: "CALL-002", customer_id: "C003", caller_name: "Emily Chen", phone: "+1-555-0267", started: "2025-03-14T11:30:00Z", duration_sec: 180, status: "completed", notes: "Customer calling about delayed order ORD-10044. Very frustrated. Wants refund if not delivered by Friday.", ai_summary: "Premium customer Emily Chen called about delayed FedEx shipment ORD-10044. Updated delivery: March 14. Customer wants refund if not delivered by March 15. Applied 10% discount. Will follow up Monday.", ticket_created: true, ticket_id: "TKT-P002", order_id: "ORD-10044", category: "shipping_delay" },
  { id: "CALL-003", customer_id: "C008", caller_name: "Robert Wilson", phone: "+1-555-0629", started: "2025-03-14T14:15:00Z", duration_sec: 0, status: "incoming", notes: "", ai_summary: "", ticket_created: false, ticket_id: null, order_id: null, category: "unknown" },
];
