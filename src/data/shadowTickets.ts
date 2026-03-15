export interface ShadowTicket {
  id: string;
  legacy_ticket_id: string;
  customer_id: string;
  classification: string;
  context_retrieved: string[];
  draft_response: string;
  recommended_action: string;
  confidence: number;
  mode: "passive" | "agent_assist" | "action_suggest" | "limited_autonomy";
  match_legacy: boolean;
  processing_time_ms: number;
  created: string;
}

export const shadowTickets: ShadowTicket[] = [
  { id: "SHD-001", legacy_ticket_id: "TKT-5001", customer_id: "C003", classification: "shipping_delay", context_retrieved: ["Order ORD-10044 via FedEx", "Customer tier: Premium", "Previous delay complaints: 1", "KB: Shipping Times policy"], draft_response: "Hi Emily, I see your order ORD-10044 shipped via FedEx is experiencing a delay. The updated tracking shows delivery by March 14. I've applied a 10% credit to your account. Would you like me to upgrade your next order to expedited shipping at no charge?", recommended_action: "Apply discount + send tracking update", confidence: 0.94, mode: "agent_assist", match_legacy: true, processing_time_ms: 230, created: "2025-03-11T09:15:02Z" },
  { id: "SHD-002", legacy_ticket_id: "TKT-5002", customer_id: "C002", classification: "order_tracking", context_retrieved: ["Order ORD-10043 via USPS", "Tracking: in transit", "Customer tier: Standard"], draft_response: "Hi James, your order ORD-10043 is on its way! USPS tracking shows it's currently in transit with an expected delivery date of March 15. Here's your tracking link.", recommended_action: "Auto-resolve with tracking info", confidence: 0.98, mode: "limited_autonomy", match_legacy: true, processing_time_ms: 145, created: "2025-03-12T14:30:01Z" },
  { id: "SHD-003", legacy_ticket_id: "TKT-5003", customer_id: "C007", classification: "return_request", context_retrieved: ["Order ORD-10049 placed March 13", "Product: Merino Wool Beanie ($67)", "Return window: 30 days", "Policy: Standard customer pays $5.95 return shipping"], draft_response: "Hi Amanda, your Merino Wool Beanie is eligible for return within our 30-day window. I've generated a return label — note that a $5.95 return shipping fee applies. Once we receive the item, your refund of $61.05 will be processed within 3-5 business days.", recommended_action: "Generate return label + initiate refund", confidence: 0.96, mode: "action_suggest", match_legacy: true, processing_time_ms: 189, created: "2025-03-14T08:00:02Z" },
  { id: "SHD-004", legacy_ticket_id: "TKT-5006", customer_id: "C006", classification: "damaged_item", context_retrieved: ["Order ORD-10048: 4-Season Tent", "Product price: $299.99", "KB: Damaged Item Policy", "Customer tier: Premium"], draft_response: "Hi David, I'm sorry about the damaged zipper on your 4-Season Tent. Per our policy, we're shipping a replacement immediately at no charge — no need to return the damaged one. A $30 store credit has been added. The replacement should arrive within 3 business days.", recommended_action: "Ship replacement + apply credit + no return needed", confidence: 0.92, mode: "agent_assist", match_legacy: true, processing_time_ms: 278, created: "2025-03-12T10:05:03Z" },
  { id: "SHD-005", legacy_ticket_id: "TKT-5007", customer_id: "C004", classification: "order_status", context_retrieved: ["Order ORD-10045 status: processing", "Expected ship: 1-2 days", "Customer tier: Standard"], draft_response: "Hi Michael, your order ORD-10045 is currently being packed and should ship within 1-2 business days. You'll receive a tracking email as soon as it's on its way!", recommended_action: "Auto-resolve with status update", confidence: 0.97, mode: "limited_autonomy", match_legacy: true, processing_time_ms: 112, created: "2025-03-13T15:10:01Z" },
  { id: "SHD-006", legacy_ticket_id: "TKT-5008", customer_id: "C008", classification: "address_change", context_retrieved: ["Customer: VIP tier", "No unshipped orders", "Last order ORD-10050 delivered", "KB: Address Change policy"], draft_response: "Hi Robert, I've updated your default shipping address on file. Since your most recent order has already been delivered, this change will apply to all future orders.", recommended_action: "Update address + confirm", confidence: 0.99, mode: "limited_autonomy", match_legacy: true, processing_time_ms: 98, created: "2025-03-14T09:30:01Z" },
];
