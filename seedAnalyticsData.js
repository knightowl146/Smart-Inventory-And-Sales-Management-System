/**
 * seedAnalyticsData.js
 * Generates sales and purchases for existing products so you can test
 * GET /api/analytics/products/:productId
 *
 * Usage:  node seedAnalyticsData.js
 */

const BASE_URL = "http://localhost:3000";

// ── helpers ────────────────────────────────────────────────────────────────────

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── main ───────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Fetching products from live server...\n");
  const { data: products } = await get("/api/products?limit=6");

  if (!products || products.length === 0) {
    console.error("No products found. Run npm run seed first.");
    process.exit(1);
  }

  // Pick first 3 products to generate activity on
  const targets = products.slice(0, 3);

  for (const product of targets) {
    const { _id: id, name, sellingPrice, purchasePrice, quantity } = product;
    console.log(`\n── ${name} (${id}) — current stock: ${quantity}`);

    // ── PURCHASES (restock) ───────────────────────────────────────────
    const purchaseBatches = [
      { quantity: 30, unitPrice: purchasePrice },
      { quantity: 20, unitPrice: purchasePrice },
      { quantity: 15, unitPrice: purchasePrice },
    ];

    for (const body of purchaseBatches) {
      const r = await post(`/api/products/${id}/purchase`, body);
      if (r.success) {
        console.log(`  ✅ Purchase  +${body.quantity} units @ ₹${body.unitPrice}`);
      } else {
        console.log(`  ❌ Purchase failed: ${r.message}`);
      }
    }

    // ── SALES ─────────────────────────────────────────────────────────
    const saleBatches = [
      { quantity: 10, unitPrice: sellingPrice },
      { quantity: 8,  unitPrice: sellingPrice },
      { quantity: 5,  unitPrice: sellingPrice },
      { quantity: 12, unitPrice: sellingPrice },
    ];

    for (const body of saleBatches) {
      const r = await post(`/api/products/${id}/sell`, body);
      if (r.success) {
        console.log(`  ✅ Sale      -${body.quantity} units @ ₹${body.unitPrice}`);
      } else {
        console.log(`  ❌ Sale failed: ${r.message}`);
      }
    }

    // ── PREVIEW analytics for this product ────────────────────────────
    const analytics = await get(`/api/analytics/products/${id}`);
    if (analytics.success) {
      const d = analytics.data;
      console.log(`\n  📊 Analytics snapshot for "${d.product.name}":`);
      console.log(`     Total Sold     : ${d.totalSold} units`);
      console.log(`     Sales Revenue  : ₹${d.salesRevenue}`);
      console.log(`     Sales Count    : ${d.salesCount} transactions`);
      console.log(`     Total Purchased: ${d.totalPurchased} units`);
      console.log(`     Purchase Cost  : ₹${d.purchaseCost}`);
      console.log(`     Purchase Count : ${d.purchaseCount} transactions`);
    } else {
      console.log(`  ⚠️  Analytics error: ${analytics.message}`);
    }
  }

  console.log("\n\n✅ Done! You can now test:");
  targets.forEach(p =>
    console.log(`   GET /api/analytics/products/${p._id}   (${p.name})`)
  );
}

seed().catch(console.error);
