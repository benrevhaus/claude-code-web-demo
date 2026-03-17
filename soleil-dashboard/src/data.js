// ──────────────────────────────────────────────
// Soleil & Co. — Data Simulation Engine
// Generates realistic DTC beauty/skincare data
// with scenario-based modifiers
// ──────────────────────────────────────────────

// ── Helpers ──
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = arr => arr[randInt(0, arr.length - 1)];
const jitter = (base, pct) => base * (1 + (Math.random() - 0.5) * 2 * pct);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCur = n => '$' + fmt(n, 2);
const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const uid = () => Math.random().toString(36).slice(2, 10);

export { fmt, fmtCur, fmtPct, uid };

// ── Product Catalog (100+ SKUs) ──
const CATEGORIES = ['Serums', 'Moisturizers', 'Cleansers', 'Masks', 'Eye Care', 'Lip Care', 'Sunscreen', 'Body Care', 'Hair Care', 'Supplements', 'Tools', 'Gift Sets'];
const LINES = ['Lumière', 'Velvet Bloom', 'Aqua Veil', 'Rose Absolue', 'Nuit Étoilée', 'Soleil Doré', 'Pétale', 'Jardin Blanc'];
const VARIANTS = {
  size: ['15ml', '30ml', '50ml', '100ml', '200ml'],
  shade: ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Universal'],
  scent: ['Unscented', 'Rose', 'Jasmine', 'Citrus', 'Lavender']
};

function buildCatalog() {
  const products = [];
  let skuNum = 1000;
  const names = [
    'Radiance Serum', 'Hydra Boost Cream', 'Glow Tonic', 'Vitamin C Elixir', 'Retinol Night Serum',
    'Peptide Eye Cream', 'Niacinamide Gel', 'Hyaluronic Mist', 'Collagen Mask', 'AHA Peel Pads',
    'Rose Lip Balm', 'SPF 50 Sunscreen', 'Micellar Water', 'Clay Detox Mask', 'Oil Cleanser',
    'Foam Cleanser', 'Tinted Moisturizer', 'Body Lotion', 'Body Oil', 'Hair Serum',
    'Scalp Treatment', 'Hand Cream', 'Cuticle Oil', 'Overnight Mask', 'Exfoliating Scrub',
    'Brightening Essence', 'Barrier Repair Balm', 'Cica Cream', 'Bakuchiol Serum', 'Squalane Oil',
    'Probiotic Supplement', 'Collagen Powder', 'Jade Roller', 'Gua Sha', 'LED Mask Device',
    'Gift Set — Glow', 'Gift Set — Luxury', 'Gift Set — Essentials', 'Travel Kit', 'Discovery Set'
  ];

  for (const name of names) {
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const line = pick(LINES);
    const basePrice = cat === 'Gift Sets' ? rand(68, 195) : cat === 'Tools' ? rand(28, 198) : cat === 'Supplements' ? rand(32, 58) : rand(18, 95);
    const variantType = cat === 'Tinted Moisturizer' || name.includes('Tinted') ? 'shade' : ['Serums', 'Moisturizers', 'Cleansers', 'Body Care'].includes(cat) ? 'size' : null;
    const variantValues = variantType ? VARIANTS[variantType].slice(0, randInt(2, 4)) : [null];

    for (const v of variantValues) {
      skuNum++;
      const sku = `SOL-${skuNum}`;
      const price = variantType === 'size' ? basePrice * (1 + variantValues.indexOf(v) * 0.4) : basePrice;
      products.push({
        sku,
        name: v ? `${line} ${name} — ${v}` : `${line} ${name}`,
        shortName: name,
        category: cat,
        line,
        variant: v,
        price: Math.round(price * 100) / 100,
        cost: Math.round(price * rand(0.18, 0.35) * 100) / 100,
        weight: rand(0.1, 1.2),
        stock: randInt(0, 800),
        reorderPoint: randInt(30, 120),
        velocity: rand(2, 60),  // units/day
        rating: clamp(rand(3.8, 5.0), 0, 5),
        reviewCount: randInt(12, 1400),
      });
    }
  }
  return products;
}

// ── Scenario Modifiers ──
const SCENARIOS = {
  steady: { label: 'Steady State', revenueMultiplier: 1, trafficMultiplier: 1, ticketMultiplier: 1, returnRate: 0.06, discountRate: 0, convBoost: 0 },
  launch: { label: 'Product Launch', revenueMultiplier: 1.4, trafficMultiplier: 1.8, ticketMultiplier: 1.6, returnRate: 0.08, discountRate: 0.05, convBoost: 0.005 },
  blackfriday: { label: 'Black Friday', revenueMultiplier: 3.2, trafficMultiplier: 4.0, ticketMultiplier: 2.5, returnRate: 0.12, discountRate: 0.30, convBoost: 0.02 },
};

export { SCENARIOS };

// ── Generate Full Dashboard Data ──
export function generateDashboardData(scenario = 'steady', catalog = null) {
  const sc = SCENARIOS[scenario] || SCENARIOS.steady;
  const products = catalog || buildCatalog();

  // ─── Revenue & Sales KPIs ───
  const baseDailyRevenue = 148000; // ~$54M/yr run rate
  const todayRevenue = jitter(baseDailyRevenue * sc.revenueMultiplier, 0.12);
  const yesterdayRevenue = jitter(baseDailyRevenue, 0.10);
  const lastWeekRevenue = jitter(baseDailyRevenue, 0.08);
  const orders = Math.round(todayRevenue / jitter(72, 0.15));
  const aov = todayRevenue / orders;
  const unitsSold = Math.round(orders * jitter(2.4, 0.1));

  // ─── Traffic & Conversion ───
  const baseTraffic = 85000;
  const sessions = Math.round(jitter(baseTraffic * sc.trafficMultiplier, 0.1));
  const convRate = clamp(jitter(0.032 + sc.convBoost, 0.15), 0.018, 0.065);
  const bounceRate = clamp(jitter(0.38, 0.12), 0.25, 0.55);
  const cartAbandonment = clamp(jitter(0.68 - sc.convBoost * 2, 0.08), 0.50, 0.80);

  // ─── Profitability ───
  const avgCOGS = products.reduce((s, p) => s + p.cost, 0) / products.length;
  const grossMargin = clamp(jitter(0.72, 0.05), 0.60, 0.85);
  const shippingCost = todayRevenue * jitter(0.065, 0.15);
  const adSpend = todayRevenue * jitter(0.18, 0.12);
  const netProfit = todayRevenue * grossMargin - shippingCost - adSpend - todayRevenue * 0.08;

  // ─── Reviews & UGC ───
  const newReviews = randInt(Math.round(18 * sc.revenueMultiplier), Math.round(45 * sc.revenueMultiplier));
  const avgRating = clamp(jitter(4.4, 0.05), 3.8, 5.0);
  const ugcSubmissions = randInt(Math.round(5 * sc.trafficMultiplier), Math.round(22 * sc.trafficMultiplier));
  const socialMentions = randInt(Math.round(120 * sc.trafficMultiplier), Math.round(380 * sc.trafficMultiplier));

  // ─── Marketing / LTV ───
  const cohortLTV = [
    { month: 'M1', value: jitter(72, 0.08) },
    { month: 'M3', value: jitter(118, 0.08) },
    { month: 'M6', value: jitter(185, 0.07) },
    { month: 'M12', value: jitter(290, 0.07) },
    { month: 'M18', value: jitter(365, 0.06) },
    { month: 'M24', value: jitter(420, 0.06) },
  ];
  const retentionCurve = [];
  let ret = 100;
  for (let m = 0; m <= 12; m++) {
    retentionCurve.push({ month: m, pct: Math.round(ret * 10) / 10 });
    ret *= clamp(jitter(0.82, 0.06), 0.70, 0.92);
  }
  const repeatRate = clamp(jitter(0.42, 0.08), 0.28, 0.58);
  const cac = jitter(28, 0.12);
  const cacPayback = cac / (aov * grossMargin);
  const ltvCacRatio = cohortLTV[3].value / cac;

  // ─── Customer Service ───
  const openTickets = randInt(Math.round(45 * sc.ticketMultiplier), Math.round(120 * sc.ticketMultiplier));
  const newTicketsToday = randInt(Math.round(30 * sc.ticketMultiplier), Math.round(90 * sc.ticketMultiplier));
  const resolvedToday = randInt(Math.round(25 * sc.ticketMultiplier), Math.round(85 * sc.ticketMultiplier));
  const avgResponseTime = jitter(18, 0.2); // minutes
  const avgResolutionTime = jitter(4.2, 0.15); // hours
  const slaCompliance = clamp(jitter(0.94, 0.04), 0.80, 0.99);
  const csat = clamp(jitter(4.3, 0.06), 3.5, 5.0);
  const nps = Math.round(jitter(62, 0.12));
  const sentimentBreakdown = {
    positive: Math.round(jitter(58, 0.1)),
    neutral: Math.round(jitter(28, 0.15)),
    negative: Math.round(jitter(14 * (sc.ticketMultiplier > 1 ? 1.3 : 1), 0.15)),
  };
  const csAgents = [
    { name: 'Maya Chen', resolved: randInt(12, 28), csat: clamp(jitter(4.7, 0.04), 4, 5) },
    { name: 'James Okafor', resolved: randInt(10, 25), csat: clamp(jitter(4.5, 0.05), 4, 5) },
    { name: 'Priya Sharma', resolved: randInt(11, 24), csat: clamp(jitter(4.6, 0.04), 4, 5) },
    { name: 'Lucas Martin', resolved: randInt(8, 22), csat: clamp(jitter(4.3, 0.06), 3.8, 5) },
    { name: 'Sofia Reyes', resolved: randInt(9, 20), csat: clamp(jitter(4.4, 0.05), 3.9, 5) },
  ].sort((a, b) => b.resolved - a.resolved);

  const ticketCategories = [
    { category: 'Shipping & Delivery', count: randInt(15, 40), pct: 0 },
    { category: 'Product Questions', count: randInt(10, 30), pct: 0 },
    { category: 'Returns & Refunds', count: randInt(8, 25), pct: 0 },
    { category: 'Order Issues', count: randInt(6, 20), pct: 0 },
    { category: 'Account & Billing', count: randInt(4, 15), pct: 0 },
    { category: 'Allergic Reactions', count: randInt(1, 5), pct: 0 },
  ];
  const totalTicketCats = ticketCategories.reduce((s, t) => s + t.count, 0);
  ticketCategories.forEach(t => t.pct = Math.round(t.count / totalTicketCats * 100));

  // ─── Inventory (SKU-level) ───
  const inventoryData = products.map(p => {
    const stock = scenario === 'blackfriday' ? Math.round(p.stock * rand(0.2, 0.7)) : scenario === 'launch' ? Math.round(p.stock * rand(0.4, 0.9)) : p.stock;
    const velocity = jitter(p.velocity * sc.revenueMultiplier, 0.2);
    const daysOfStock = stock / Math.max(velocity, 0.1);
    return {
      ...p,
      stock,
      velocity: Math.round(velocity * 10) / 10,
      daysOfStock: Math.round(daysOfStock),
      status: stock === 0 ? 'out' : stock <= p.reorderPoint * 0.5 ? 'critical' : stock <= p.reorderPoint ? 'low' : 'ok',
    };
  }).sort((a, b) => a.daysOfStock - b.daysOfStock);

  const outOfStock = inventoryData.filter(i => i.status === 'out').length;
  const lowStock = inventoryData.filter(i => i.status === 'critical' || i.status === 'low').length;
  const healthyStock = inventoryData.filter(i => i.status === 'ok').length;

  // ─── Fulfillment ───
  const shippedToday = Math.round(orders * jitter(0.85, 0.08));
  const avgShipTime = jitter(1.8, 0.15); // days
  const returnRate = sc.returnRate;
  const pendingShipments = orders - shippedToday + randInt(20, 80);
  const deliveredToday = Math.round(jitter(orders * 0.9, 0.1));

  // ─── Alerts ───
  const alerts = [];
  if (outOfStock > 0) alerts.push({ type: 'critical', msg: `${outOfStock} SKU${outOfStock > 1 ? 's' : ''} are out of stock — revenue at risk`, time: randInt(5, 45) + 'm ago' });
  if (lowStock > 5) alerts.push({ type: 'warning', msg: `${lowStock} SKUs below reorder point — consider PO`, time: randInt(10, 60) + 'm ago' });
  if (slaCompliance < 0.92) alerts.push({ type: 'critical', msg: `SLA compliance at ${(slaCompliance * 100).toFixed(1)}% — below 92% target`, time: randInt(5, 30) + 'm ago' });
  if (cartAbandonment > 0.72) alerts.push({ type: 'warning', msg: `Cart abandonment at ${(cartAbandonment * 100).toFixed(1)}% — above threshold`, time: randInt(15, 90) + 'm ago' });
  if (scenario === 'blackfriday') {
    alerts.push({ type: 'critical', msg: 'Black Friday surge: traffic 4x normal — monitor server capacity', time: '2m ago' });
    alerts.push({ type: 'warning', msg: 'Warehouse picking queue backlog exceeding 200 orders', time: '12m ago' });
  }
  if (scenario === 'launch') {
    alerts.push({ type: 'info', msg: 'New product "Soleil Doré Radiance Serum" launched — tracking initial metrics', time: '1h ago' });
    alerts.push({ type: 'warning', msg: 'Elevated CS ticket volume (+60%) since launch', time: '28m ago' });
  }
  alerts.push({ type: 'info', msg: `Data refreshed — next update in 30 minutes`, time: 'just now' });
  if (nps < 55) alerts.push({ type: 'warning', msg: `NPS dropped to ${nps} — investigate detractor feedback`, time: randInt(20, 120) + 'm ago' });

  // ─── AI Insights ───
  const insights = [];
  if (scenario === 'blackfriday') {
    insights.push({ title: 'Black Friday Performance', body: `Revenue is ${((todayRevenue / yesterdayRevenue - 1) * 100).toFixed(0)}% above yesterday. Conversion rate spiked to ${(convRate * 100).toFixed(2)}%, likely driven by sitewide 30% discount. Monitor inventory burn rate on top 10 SKUs — at current velocity, 3 hero products may stock out by 6 PM.`, action: 'Review restock priorities →' });
    insights.push({ title: 'CS Load Warning', body: `Customer service tickets are ${((sc.ticketMultiplier - 1) * 100).toFixed(0)}% above normal. Shipping inquiries dominate. Consider proactive shipping delay notification to reduce inbound volume.`, action: 'Draft notification template →' });
  } else if (scenario === 'launch') {
    insights.push({ title: 'Launch Day Metrics', body: `Traffic is ${((sc.trafficMultiplier - 1) * 100).toFixed(0)}% above baseline, suggesting strong PR/influencer impact. Early conversion rate looks healthy. First reviews are trending ${avgRating >= 4.3 ? 'positive' : 'mixed'} — keep monitoring for product quality signals.`, action: 'View launch cohort →' });
    insights.push({ title: 'Acquisition Cost Alert', body: `CAC is $${cac.toFixed(2)} — ${cacPayback < 1 ? 'below' : 'above'} one-order payback. ${ltvCacRatio > 4 ? 'Strong' : ltvCacRatio > 3 ? 'Healthy' : 'Tight'} LTV:CAC ratio of ${ltvCacRatio.toFixed(1)}x suggests ${ltvCacRatio > 3.5 ? 'room to scale spend' : 'need for efficiency improvements'}.`, action: 'Adjust ad budgets →' });
  } else {
    insights.push({ title: 'Daily Briefing', body: `Revenue is ${todayRevenue > yesterdayRevenue ? 'up' : 'down'} ${Math.abs((todayRevenue / yesterdayRevenue - 1) * 100).toFixed(1)}% vs yesterday. Repeat purchase rate at ${(repeatRate * 100).toFixed(1)}% — ${repeatRate > 0.4 ? 'above' : 'near'} target. Top performer today: ${products[randInt(0, 4)].shortName}.`, action: 'View full report →' });
    insights.push({ title: 'Retention Opportunity', body: `Month-3 retention is ${retentionCurve[3].pct.toFixed(1)}%. Customers who repurchase within 45 days have ${(jitter(2.8, 0.1)).toFixed(1)}x higher LTV. Consider targeted win-back for the ${randInt(800, 2200)} customers approaching 45-day dormancy.`, action: 'Create win-back campaign →' });
  }
  insights.push({ title: 'Channel Mix Insight', body: `Website accounts for ~${randInt(62, 72)}% of revenue, Amazon ${randInt(28, 38)}%. Website AOV ($${(aov * jitter(1.1, 0.05)).toFixed(2)}) is ${randInt(12, 22)}% higher than Amazon ($${(aov * jitter(0.88, 0.05)).toFixed(2)}). Recommend shifting ad spend toward DTC to improve margin.`, action: 'Compare channels →' });

  // ─── Leaderboards ───
  const topProducts = [...products]
    .map(p => ({ ...p, revenue: p.price * jitter(p.velocity * sc.revenueMultiplier, 0.3) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const topCampaigns = [
    { name: 'Meta — Retinol Serum Lookalike', spend: jitter(4200, 0.15), roas: jitter(5.8 * sc.revenueMultiplier, 0.12) },
    { name: 'Google — Brand Search', spend: jitter(3800, 0.15), roas: jitter(8.2 * sc.revenueMultiplier, 0.1) },
    { name: 'TikTok — Influencer Collab', spend: jitter(2800, 0.2), roas: jitter(4.1 * sc.revenueMultiplier, 0.15) },
    { name: 'Meta — Gift Set Holiday', spend: jitter(5100, 0.15), roas: jitter(3.9 * sc.revenueMultiplier, 0.12) },
    { name: 'Google — Shopping PMax', spend: jitter(6200, 0.1), roas: jitter(4.5 * sc.revenueMultiplier, 0.1) },
    { name: 'Email — VIP Early Access', spend: jitter(200, 0.2), roas: jitter(18, 0.15) },
    { name: 'SMS — Flash Sale', spend: jitter(150, 0.2), roas: jitter(14, 0.18) },
  ].sort((a, b) => b.roas - a.roas);

  // ─── Channel Comparison ───
  const webShare = jitter(0.67, 0.05);
  const channelComparison = {
    website: {
      revenue: todayRevenue * webShare,
      orders: Math.round(orders * webShare),
      aov: aov * jitter(1.08, 0.04),
      convRate: convRate * jitter(1.05, 0.05),
      sessions: Math.round(sessions * jitter(0.72, 0.05)),
      returnRate: sc.returnRate * jitter(0.85, 0.1),
      margin: grossMargin * jitter(1.02, 0.02),
    },
    amazon: {
      revenue: todayRevenue * (1 - webShare),
      orders: Math.round(orders * (1 - webShare)),
      aov: aov * jitter(0.88, 0.05),
      convRate: convRate * jitter(1.15, 0.08),
      sessions: Math.round(sessions * jitter(0.28, 0.08)),
      returnRate: sc.returnRate * jitter(1.3, 0.1),
      margin: grossMargin * jitter(0.82, 0.03),
    },
  };

  // ─── Sparkline data (last 24 hours) ───
  const sparkline = (base, variance = 0.1) => {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      pts.push(Math.round(jitter(base, variance)));
    }
    return pts;
  };

  return {
    scenario,
    scenarioLabel: sc.label,
    generatedAt: new Date().toISOString(),
    products,
    kpis: {
      todayRevenue, yesterdayRevenue, lastWeekRevenue, orders, aov, unitsSold,
      sessions, convRate, bounceRate, cartAbandonment,
      grossMargin, shippingCost, adSpend, netProfit,
      newReviews, avgRating, ugcSubmissions, socialMentions,
    },
    sparklines: {
      revenue: sparkline(todayRevenue / 24, 0.2),
      orders: sparkline(orders / 24, 0.25),
      sessions: sparkline(sessions / 24, 0.15),
      convRate: sparkline(convRate * 100, 0.12),
    },
    marketing: { cohortLTV, retentionCurve, repeatRate, cac, cacPayback, ltvCacRatio },
    customerService: {
      openTickets, newTicketsToday, resolvedToday,
      avgResponseTime, avgResolutionTime, slaCompliance,
      csat, nps, sentimentBreakdown, csAgents, ticketCategories,
    },
    inventory: { items: inventoryData.slice(0, 120), outOfStock, lowStock, healthyStock, total: inventoryData.length },
    fulfillment: { shippedToday, avgShipTime, returnRate, pendingShipments, deliveredToday },
    alerts,
    insights,
    leaderboards: { topProducts, topCampaigns, csAgents },
    channelComparison,
  };
}
