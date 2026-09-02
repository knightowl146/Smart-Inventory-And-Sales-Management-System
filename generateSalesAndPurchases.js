require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./models/Product");
const StockMovement = require("./models/StockMovements");

async function generateData() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is not defined");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.\n");

    const products = await Product.find().limit(10);
    if (products.length === 0) {
      console.error("No products found in the database. Please run 'npm run seed' first.");
      process.exit(1);
    }

    console.log(`Found ${products.length} products to generate sales and purchases for.\n`);

    const now = new Date();
    const stockMovementsToInsert = [];
    const summaryReport = [];

    for (const product of products) {
      const { _id: productId, name, category, purchasePrice, sellingPrice } = product;
      let currentStock = product.quantity;

      let totalSold = 0;
      let totalPurchased = 0;
      let salesRevenue = 0;
      let purchaseCost = 0;
      let salesCount = 0;
      let purchaseCount = 0;

      // Purchase Batches (Restocking)
      const purchaseBatches = [
        { qty: 50, daysAgo: 25, unitPrice: purchasePrice },
        { qty: 40, daysAgo: 15, unitPrice: purchasePrice },
        { qty: 30, daysAgo: 5,  unitPrice: purchasePrice },
        { qty: 20, daysAgo: 1,  unitPrice: purchasePrice }
      ];

      for (const batch of purchaseBatches) {
        const createdAt = new Date(now.getTime() - batch.daysAgo * 24 * 60 * 60 * 1000);
        const prevQuantity = currentStock;
        currentStock += batch.qty;
        const newQuantity = currentStock;

        stockMovementsToInsert.push({
          product: productId,
          type: "PURCHASE",
          quantity: batch.qty,
          unitPrice: batch.unitPrice,
          prevQuantity,
          newQuantity,
          createdAt,
          updatedAt: createdAt
        });

        totalPurchased += batch.qty;
        purchaseCost += batch.qty * batch.unitPrice;
        purchaseCount++;
      }

      // Sale Batches
      const saleBatches = [
        { qty: 5,  daysAgo: 22, unitPrice: sellingPrice },
        { qty: 12, daysAgo: 18, unitPrice: sellingPrice },
        { qty: 8,  daysAgo: 14, unitPrice: sellingPrice },
        { qty: 15, daysAgo: 10, unitPrice: sellingPrice },
        { qty: 10, daysAgo: 6,  unitPrice: sellingPrice },
        { qty: 7,  daysAgo: 2,  unitPrice: sellingPrice },
        { qty: 4,  daysAgo: 0,  unitPrice: sellingPrice }
      ];

      for (const batch of saleBatches) {
        if (currentStock < batch.qty) continue;

        const createdAt = new Date(now.getTime() - batch.daysAgo * 24 * 60 * 60 * 1000);
        const prevQuantity = currentStock;
        currentStock -= batch.qty;
        const newQuantity = currentStock;

        stockMovementsToInsert.push({
          product: productId,
          type: "SALE",
          quantity: batch.qty,
          unitPrice: batch.unitPrice,
          prevQuantity,
          newQuantity,
          createdAt,
          updatedAt: createdAt
        });

        totalSold += batch.qty;
        salesRevenue += batch.qty * batch.unitPrice;
        salesCount++;
      }

      // Update product quantity in DB
      await Product.findByIdAndUpdate(productId, { quantity: currentStock });

      summaryReport.push({
        id: productId.toString(),
        name,
        category,
        stock: currentStock,
        totalSold,
        salesRevenue,
        salesCount,
        totalPurchased,
        purchaseCost,
        purchaseCount
      });
    }

    console.log(`Inserting ${stockMovementsToInsert.length} stock movement records...`);
    await StockMovement.insertMany(stockMovementsToInsert);

    console.log("\n==========================================================================");
    console.log(`🎉 SUCCESS: Generated ${stockMovementsToInsert.length} transactions across ${products.length} products!`);
    console.log("==========================================================================");
    console.log("\n📊 Generated Sales & Purchases Summary for Testing getProductAnalytics:\n");

    summaryReport.forEach(item => {
      console.log(`Product: "${item.name}" [Category: ${item.category}]`);
      console.log(`  Product ID        : ${item.id}`);
      console.log(`  Updated Stock     : ${item.stock} units`);
      console.log(`  Sales Summary     : ${item.totalSold} units sold (${item.salesCount} sales) | Total Revenue: ₹${item.salesRevenue}`);
      console.log(`  Purchase Summary  : ${item.totalPurchased} units bought (${item.purchaseCount} orders) | Total Cost: ₹${item.purchaseCost}`);
      console.log(`  Test Endpoint     : GET /api/analytics/products/${item.id}`);
      console.log("--------------------------------------------------------------------------");
    });

  } catch (error) {
    console.error("Error generating sales and purchases:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
    process.exit(0);
  }
}

generateData();
