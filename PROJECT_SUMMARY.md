# 📦 Smart Inventory & Sales Management System — Project Summary

> **Version:** 1.0.0
> **Runtime:** Node.js (>=14.0.0) | **Framework:** Express 5 | **Database:** MongoDB (Mongoose 9)
> **Entry Point:** `server.js` → `app.js`
> **Base URL:** `http://localhost:<PORT>/api`

---

## 🏗️ Project Overview

A comprehensive **RESTful backend system** for managing product inventory, purchases, sales, suppliers, customers, and business intelligence analytics. It features AI-powered stock recommendations via **Google Gemini 2.5 Flash**, multi-format report exports (CSV, XLSX, PDF), and a robust analytics engine built on MongoDB aggregation pipelines.

---

## 🗂️ Project Structure

```
Smart-Inventory-And-Sales-Management-System/
├── server.js                    # Entry point — DB connect + server start
├── app.js                       # Express app setup, middleware, route mounting
├── config/
│   ├── db.js                    # MongoDB connection via Mongoose
│   └── env.js                   # Environment variable validation (envalid)
├── models/
│   ├── Product.js               # Product schema
│   ├── StockMovements.js        # Stock movement schema (PURCHASE / SALE)
│   ├── Customer.js              # Customer schema
│   └── Supplier.js              # Supplier schema
├── controllers/
│   ├── productController.js     # Product CRUD + purchase/sell logic
│   ├── dashboardController.js   # Aggregated dashboard stats
│   ├── analyticsController.js   # Full analytics engine (30+ endpoints)
│   ├── reportController.js      # Report generation + export
│   ├── stockMovementController.js
│   ├── lowStockController.js    # Low-stock alert query
│   ├── supplierController.js    # Supplier CRUD
│   └── customerController.js   # Customer CRUD
├── routes/
│   ├── productRoutes.js         # /api/products
│   ├── dashboardRoute.js        # /api/dashboard
│   ├── analyticsRoutes.js       # /api/analytics
│   ├── reportRoutes.js          # /api/reports
│   ├── stockMovementRoutes.js   # /api/movements
│   ├── supplierRoutes.js        # /api/suppliers
│   └── customerRoutes.js       # /api/customers
├── services/
│   ├── stockRecommendation.js   # Gemini AI + deterministic recommendation engine
│   └── exportService.js         # CSV / XLSX / PDF export helpers
├── middlewares/
│   └── errorHandler.js          # Global error handler
├── utils/
│   └── logger.js                # Winston logger
└── tests/                       # Jest + Supertest integration tests
```

---

## 🔒 Security & Middleware Stack

| Middleware | Purpose |
|---|---|
| `helmet` | Sets secure HTTP headers |
| `cors` | Cross-Origin Resource Sharing |
| `compression` | GZIP response compression |
| `express-rate-limit` | 1000 requests / 15 min per IP on `/api` |
| `morgan` + `winston` | HTTP request logging (disabled in test env) |
| `express.json()` | JSON body parsing |
| `express.urlencoded()` | URL-encoded body parsing |
| `mongoSanitize` / `xss-clean` | NoSQL injection & XSS protection (ready to enable) |

---

## 🗄️ Data Models

### Product
| Field | Type | Notes |
|---|---|---|
| `name` | String | Required, 3–100 chars |
| `sku` | String | Required, unique |
| `category` | String | Required |
| `purchasePrice` | Number | Required, >= 0 |
| `sellingPrice` | Number | Required, >= 0 |
| `unitPrice` | Number | Required, >= 0 |
| `quantity` | Number | Default 0, >= 0 |
| `lowStockThreshold` | Number | Default 10, >= 0 |
| `description` | String | Required |
| `createdAt / updatedAt` | Date | Auto timestamps |

### StockMovement
| Field | Type | Notes |
|---|---|---|
| `product` | ObjectId → Product | Required |
| `type` | Enum: PURCHASE, SALE | Required |
| `quantity` | Number | >= 1 |
| `unitPrice` | Number | >= 0 |
| `supplier` | ObjectId → Supplier | Required for PURCHASE |
| `customer` | ObjectId → Customer | Required for SALE |
| `prevQuantity` | Number | Snapshot before movement |
| `newQuantity` | Number | Snapshot after movement |
| `createdAt / updatedAt` | Date | Auto timestamps |

### Customer
| Field | Type | Notes |
|---|---|---|
| `name` | String | Required |
| `phone` | String | Required, unique |
| `email` | String | Optional, lowercase |
| `address` | String | Optional |

### Supplier
| Field | Type | Notes |
|---|---|---|
| `name` | String | Required |
| `email` | String | Optional, lowercase |
| `phone` | String | Optional |
| `address` | String | Optional |

---

## 🛣️ All API Routes & Functionalities

---

### 1. 📦 Products — /api/products

| Method | Endpoint | Functionality |
|---|---|---|
| POST | /api/products/ | Create a new product. Validates all fields, checks duplicate SKU, enforces positive integers. |
| GET | /api/products/ | Get all products with pagination (page, limit), category filter and search (by name/SKU). |
| GET | /api/products/:id | Get a single product by MongoDB ObjectId. |
| PATCH | /api/products/:id | Partial update. Allowed: name, price, purchasePrice, sellingPrice, quantity, category, lowStockThreshold, description. |
| DELETE | /api/products/:id | Permanently delete a product. |
| POST/PUT | /api/products/:id/purchase | Purchase stock. Requires quantity, unitPrice, supplierId. Increments quantity + creates PURCHASE movement. |
| POST/PUT | /api/products/:id/sell | Sell a product. Requires quantity, unitPrice, customerId. Uses MongoDB transaction to atomically decrement quantity + create SALE movement. Rejects on insufficient stock. |

---

### 2. 📊 Dashboard — /api/dashboard

| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/dashboard/stats | Dashboard summary via MongoDB aggregation: totalProducts, totalQuantity, lowStockProducts, outOfStockProducts, inventoryValue, totalPurchases, totalSales. |

---

### 3. 📈 Analytics — /api/analytics

#### Sales Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/sales | Overall sales metrics: total revenue and total units sold (across all sales transactions). |
| GET | /api/analytics/sales-over-time | Sales aggregated over time (daily/weekly/monthly). |
| GET | /api/analytics/sales-vs-purchases | Comparative sales vs purchase volumes. |
| GET | /api/analytics/sales-by-category | Revenue and units by category. |
| GET | /api/analytics/sales-growth | Sales growth rate (current vs previous period). |
| GET | /api/analytics/sales-trend | Sales trend data for charting. |
| GET | /api/analytics/top-selling-products | Best-selling products by quantity/revenue. |

#### Purchase Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/purchases | Overall purchase metrics: total spend, units purchased. |
| GET | /api/analytics/purchases-over-time | Purchase activity over time. |
| GET | /api/analytics/purchases-by-category | Purchase spend by category. |

#### Inventory Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/inventory-by-category | Stock levels grouped by category. |
| GET | /api/analytics/inventory-health | Health classification (healthy / low / out-of-stock). |
| GET | /api/analytics/inventory-alerts | Products at or below lowStockThreshold. |
| GET | /api/analytics/inventory-turnover | Inventory turnover ratio. |
| GET | /api/analytics/inventory-valuation | Total inventory value at purchase/selling price. |
| GET | /api/analytics/inventory-valuation/category | Inventory valuation by category. |
| GET | /api/analytics/inventory/abc-analysis | ABC Analysis: classifies products into A (high-value), B (mid), C (low) by revenue. |
| GET | /api/analytics/dead-stock | Products with zero sales over a defined period. |
| GET | /api/analytics/product-movement | Stock movement summary for all products. |

#### Profit & Loss
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/profit-loss | Overall P&L: total revenue − COGS. |
| GET | /api/analytics/profit-loss-over-time | P&L trend over time. |
| GET | /api/analytics/profit-loss/products | Per-product P&L breakdown. |

#### Product-Level Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/products/:productId | Detailed analytics for one product: sales history, purchases, stock, profitability. |

#### Supplier Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/supplier-performance | Supplier performance: total purchased, spend, last purchase date. |

#### Customer Analytics
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/customer | Overall customer analytics: total customers, total revenue. |
| GET | /api/analytics/customer/top | Top customers ranked by total spend. |
| GET | /api/analytics/customer/:customerId/purchase-history | Sales history for a specific customer. |
| GET | /api/analytics/customer/:customerId/spending-over-time | Customer spend over time. |

#### AI Stock Recommendations
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/inventory/stock-recommendations | AI-powered recommendations for ALL products via Gemini 2.5 Flash. Returns REORDER_NOW, REORDER_SOON, HEALTHY, or NO_SALES with calculated recommendedQuantity. |
| GET | /api/analytics/inventory/stock-recommendations/:productId | AI recommendation for a single product. |

#### Dashboard Summary
| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/analytics/dashboard/summary | Aggregated business KPIs for dashboard widgets. |

---

### 4. 📋 Reports — /api/reports

| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/reports/sales | Sales report with date range filter, summary totals, product breakdown. |
| GET | /api/reports/sales/export | Export sales report as CSV, XLSX, or PDF (?format=csv/xlsx/pdf). |
| GET | /api/reports/purchases | Purchase report with date range filter and supplier breakdown. |
| GET | /api/reports/purchases/export | Export purchase report as CSV, XLSX, or PDF. |
| GET | /api/reports/inventory | Inventory snapshot: current stock, value, status for all products. |
| GET | /api/reports/inventory/export | Export inventory report as CSV, XLSX, or PDF. |
| GET | /api/reports/profit-loss | P&L report: revenue, COGS, net profit. |
| GET | /api/reports/profit-loss/export | Export P&L report as CSV, XLSX, or PDF. |
| GET | /api/reports/suppliers | Supplier report: purchase history, spend, activity. |
| GET | /api/reports/customers | Customer report: sales history, revenue, activity. |

---

### 5. 🔄 Stock Movements — /api/movements

| Method | Endpoint | Functionality |
|---|---|---|
| GET | /api/movements/ | All stock movements (PURCHASE + SALE), sorted by date. |
| GET | /api/movements/product/:id | Full movement history for a specific product. |
| GET | /api/movements/low-stock | Products whose quantity is <= lowStockThreshold. |

---

### 6. 🏭 Suppliers — /api/suppliers

| Method | Endpoint | Functionality |
|---|---|---|
| POST | /api/suppliers/ | Create a new supplier (name required). |
| GET | /api/suppliers/ | Get all suppliers. |
| GET | /api/suppliers/:supplierId | Get a single supplier by ID. |
| PUT | /api/suppliers/:supplierId | Update supplier details. |
| DELETE | /api/suppliers/:supplierId | Delete a supplier. |

---

### 7. 👥 Customers — /api/customers

| Method | Endpoint | Functionality |
|---|---|---|
| POST | /api/customers/ | Create a new customer (name + phone required). |
| GET | /api/customers/ | Get all customers. |
| GET | /api/customers/:id | Get a single customer by ID. |
| PATCH | /api/customers/:id | Partially update a customer. |
| DELETE | /api/customers/:id | Delete a customer. |

---

## 🤖 AI Stock Recommendation Engine

Hybrid approach — Gemini provides qualitative reasoning; backend enforces deterministic rules:

1. **Backend calculates** per product: averageDailySales, salesGrowth, daysOfStockRemaining, baseReorderQuantity
2. **Gemini 2.5 Flash** returns: recommendation status + human-readable reason
3. **Backend validates** Gemini output:
   - Backend rules always override Gemini's recommendation status
   - recommendedQuantity is calculated deterministically (never trusted from AI)
   - Growth adjustments: +20% (>=25% growth), +10% (>=10%), -10% (<=-10%), -20% (<=-25%)

---

## 📤 Export Service

| Format | MIME Type | Library |
|---|---|---|
| csv | text/csv | json2csv |
| xlsx | application/vnd.openxmlformats-... | exceljs |
| pdf | application/pdf | pdfkit |

Features: styled green headers, auto-fit columns (XLSX), paginated tables (PDF), UTF-8 BOM (CSV).

---

## 🧪 Testing

| Tool | Purpose |
|---|---|
| jest | Test runner (30s timeout) |
| supertest | HTTP integration testing |
| mongodb-memory-server | In-memory MongoDB for isolation |

```bash
npm test               # Run all tests
npm run test:coverage  # With coverage report
npm run test:watch     # Watch mode
```

---

## 🔧 NPM Scripts

| Script | Command | Description |
|---|---|---|
| start | node server.js | Production start |
| dev | nodemon server.js | Development with auto-restart |
| seed | node seedProducts.js | Seed product data |
| test | jest --runInBand --forceExit | Run all tests |

---

## 📦 Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| express | ^5.2.1 | Web framework |
| mongoose | ^9.7.4 | MongoDB ODM |
| @google/genai | ^2.20.0 | Google Gemini AI SDK |
| exceljs | ^4.4.0 | XLSX generation |
| pdfkit | ^0.20.2 | PDF generation |
| json2csv | ^6.0.0-alpha.2 | CSV export |
| helmet | ^8.3.0 | HTTP security headers |
| winston | ^3.19.0 | Structured logging |
| express-rate-limit | ^8.7.0 | API rate limiting |
| dotenv | ^17.4.2 | Environment variables |
| envalid | ^8.2.0 | Env validation |
| compression | ^1.8.1 | GZIP compression |

---

## 🌍 Environment Variables

| Variable | Description |
|---|---|
| PORT | Server port |
| MONGODB_URI | MongoDB connection string |
| GEMINI_API_KEY | Google Gemini API key |
| NODE_ENV | development / production / test |

---

*Summary generated on: 2026-09-12*

