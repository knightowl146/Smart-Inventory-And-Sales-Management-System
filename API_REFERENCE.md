# API Reference - Smart Inventory Management System

Complete API documentation for all endpoints.

## Table of Contents
1. [Products](#products)
2. [Stock Movements](#stock-movements)
3. [Customers](#customers)
4. [Suppliers](#suppliers)
5. [Analytics](#analytics)
6. [Stock Recommendations](#stock-recommendations)
7. [Dashboard](#dashboard)
8. [Reports](#reports)
9. [Exports](#exports)

---

## Authentication

**Every endpoint except `GET /health` requires a valid access token.**

Send it as a bearer token:

```
Authorization: Bearer <accessToken>
```

Tokens come from `POST /api/auth/login`. The access token is short-lived (15
minutes) and is returned in the response body; the refresh token is set as an
httpOnly cookie scoped to `/api/auth` and is never readable by JavaScript.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/auth/login` | none | `{ email, password }` -> `{ accessToken, user }` + refresh cookie |
| `POST /api/auth/refresh` | refresh cookie | Rotates the refresh token, returns a new access token |
| `POST /api/auth/logout` | refresh cookie | Revokes that one session |
| `POST /api/auth/logout-all` | bearer | Revokes every session for the caller |
| `GET /api/auth/me` | bearer | The signed-in user |
| `POST /api/auth/change-password` | bearer | `{ currentPassword, newPassword }`; signs out other devices |

Refresh tokens rotate on every use and carry reuse detection: presenting a
token that has already been rotated revokes every session for that user.

### Roles

Two roles. `owner` holds every permission; `employee` holds an explicit
allowlist and is denied anything not on it.

| Area | Owner | Employee |
|---|---|---|
| Products | full | read only, with `purchasePrice` removed from the response |
| Sell (`POST /api/products/:id/sell`) | yes | yes |
| Purchase (`POST /api/products/:id/purchase`) | yes | 403 |
| Customers | full | read and create |
| Suppliers | full | 403 |
| `/api/movements` | whole ledger | only movements they created |
| `/api/analytics/*` | full | 403 - use `GET /api/me/summary` |
| `/api/reports/*` (incl. exports) | full | 403 |
| `/api/dashboard/stats` | yes | 403 - use `GET /api/me/summary` |
| `/api/users/*` | full | 403 |
| `/api/audit` | full | 403 |

Failures are distinguishable: **401** means the token is missing, malformed,
expired or revoked; **403** means the token is valid but the role does not hold
the permission.

Cost and margin fields (`purchasePrice`, `profit`, `totalCost`, `margin`,
`inventoryValue`, and similar) are stripped from every JSON response for any
role without `finance:read`, at any nesting depth.

### Endpoints that no longer exist

The bare-path duplicates (`/products`, `/movements`, `/analytics/*`,
`/reports/*`, `/customers`, `/dashboard/*`) have been removed. Every router is
mounted once, under `/api`.

---

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Optional success message",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Products

### Create Product
Creates a new product in the inventory.

**Endpoint:** `POST /api/products`

**Request Body:**
```json
{
  "name": "Laptop Dell XPS 15",
  "sku": "DELL-XPS-15",
  "category": "Electronics",
  "purchasePrice": 1000,
  "sellingPrice": 1500,
  "unitPrice": 1500,
  "quantity": 25,
  "lowStockThreshold": 5,
  "description": "High-performance laptop"
}
```

**Validations:**
- All fields are required
- `quantity` must be a positive integer
- `purchasePrice`, `sellingPrice`, `unitPrice` must be positive numbers
- `lowStockThreshold` must be >= 0
- `sku` must be unique

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "name": "Laptop Dell XPS 15",
    "sku": "DELL-XPS-15",
    ...
  }
}
```

---

### Get All Products
Retrieves a paginated list of products with optional filtering.

**Endpoint:** `GET /api/products`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Items per page (max 100) |
| `category` | string | No | - | Filter by category |
| `search` | string | No | - | Search in name or SKU |

**Example:**
```
GET /api/products?page=1&limit=20&category=Electronics&search=laptop
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalProducts": 100,
    "limit": 20
  }
}
```

---

### Get Product by ID
Retrieves a single product by its ID.

**Endpoint:** `GET /api/products/:id`

**Response:** `200 OK` | `404 Not Found`

---

### Update Product
Updates product information (does not affect quantity - use purchase/sell for that).

**Endpoint:** `PUT /api/products/:id`

**Allowed Fields:**
- `name`, `price`, `purchasePrice`, `sellingPrice`, `quantity`, `category`, `lowStockThreshold`, `description`

**Response:** `200 OK` | `400 Bad Request` | `404 Not Found`

---

### Delete Product
Deletes a product from the system.

**Endpoint:** `DELETE /api/products/:id`

**Response:** `200 OK` | `404 Not Found`

---

### Purchase Product (Add Stock)
Records a purchase and increases product quantity.

**Endpoint:** `POST /api/products/:id/purchase`

**Request Body:**
```json
{
  "quantity": 50,
  "unitPrice": 1000,
  "supplierId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

**Validations:**
- `quantity` must be a positive integer
- `unitPrice` must be >= 0
- `supplierId` must be a valid ObjectId
- Supplier must exist

**Side Effects:**
- Increases product quantity
- Creates `PURCHASE` stock movement record

**Response:** `200 OK`

---

### Sell Product (Reduce Stock)
Records a sale and decreases product quantity.

**Endpoint:** `POST /api/products/:id/sell`

**Request Body:**
```json
{
  "quantity": 5,
  "unitPrice": 1500,
  "customerId": "60f7b3b3b3b3b3b3b3b3b3b3"
}
```

**Validations:**
- `quantity` must be a positive integer
- `unitPrice` must be >= 0
- `customerId` must be a valid ObjectId
- Customer must exist
- **Sufficient stock must be available**

**Side Effects:**
- Decreases product quantity
- Creates `SALE` stock movement record

**Transaction:** Uses MongoDB transaction to ensure atomicity

**Response:** `200 OK` | `400 Insufficient Stock`

---

## Stock Movements

Stock movements are automatically created through purchase/sell operations.

### Get Stock Movements
**Endpoint:** `GET /api/movements`

**Query Parameters:**
- `type`: Filter by "SALE" or "PURCHASE"
- `startDate`, `endDate`: Date range filter

---

## Customers

### Create Customer
**Endpoint:** `POST /api/customers`

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "1234567890",
  "email": "john@example.com",
  "address": "123 Main St"
}
```

**Validations:**
- `name` and `phone` are required
- `phone` must be unique

---

### Get Purchase History
**Endpoint:** `GET /api/customer/:customerId/purchase-history`

**Query Parameters:**
- `page`, `limit`: Pagination
- `startDate`, `endDate`: Date filter

**Response:**
```json
{
  "success": true,
  "customer": {
    "_id": "...",
    "name": "John Doe",
    ...
  },
  "pagination": { ... },
  "data": [
    {
      "_id": "...",
      "product": {
        "_id": "...",
        "name": "Product Name"
      },
      "quantity": 5,
      "unitPrice": 150,
      "totalAmount": 750,
      "createdAt": "2024-01-15T..."
    }
  ]
}
```

---

### Get Customer Spending Over Time
**Endpoint:** `GET /api/customer/:customerId/spending-over-time`

**Query Parameters:**
- `startDate`, `endDate`: Date filter

**Response:**
```json
{
  "success": true,
  "customer": { ... },
  "data": [
    {
      "date": "2024-01-15",
      "totalSpent": 1500,
      "quantityPurchased": 10,
      "salesCount": 3
    }
  ]
}
```

---

## Suppliers

### Create Supplier
**Endpoint:** `POST /api/suppliers`

**Request Body:**
```json
{
  "name": "Acme Corp",
  "email": "contact@acme.com",
  "phone": "9876543210",
  "address": "456 Business Ave"
}
```

### Get Supplier Performance
**Endpoint:** `GET /api/analytics/supplier-performance`

**Query Parameters:**
- `startDate`, `endDate`: Date filter
- `limit`: Max results (default 10)

---

## Analytics

### Sales Analytics
**Endpoint:** `GET /api/analytics/sales`

**Query Parameters:**
- `startDate`, `endDate`: Optional date range

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUnitsSold": 1000,
    "totalRevenue": 150000,
    "salesOverTime": [
      {
        "date": "2024-01-15",
        "unitsSold": 50,
        "revenue": 7500
      }
    ]
  }
}
```

---

### Purchase Analytics
**Endpoint:** `GET /api/analytics/purchases`

Similar structure to sales analytics, returns:
- `totalUnitsPurchased`
- `totalPurchaseCost`
- `purchaseOverTime`

---

### Top Selling Products
**Endpoint:** `GET /api/analytics/top-selling-products`

**Query Parameters:**
- `limit`: Number of products (default 5, max 100)
- `startDate`, `endDate`: Date filter

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "product": {
        "_id": "...",
        "name": "Product Name"
      },
      "quantitySold": 100,
      "revenue": 15000,
      "salesCount": 25
    }
  ]
}
```

---

### Product Analytics
**Endpoint:** `GET /api/analytics/products/:productId`

Returns sales and purchase analytics for a specific product.

---

### Sales vs Purchases
**Endpoint:** `GET /api/analytics/sales-vs-purchases`

Compares sales and purchases over time.

---

### Category Analytics
**Endpoints:**
- `GET /api/analytics/sales-by-category`
- `GET /api/analytics/purchases-by-category`
- `GET /api/analytics/inventory-by-category`

---

### Inventory Health
**Endpoint:** `GET /api/analytics/inventory-health`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 150,
    "totalQuantity": 5000,
    "lowStockProducts": 12,
    "outOfStockProducts": 3,
    "healthyStockProducts": 135,
    "inventoryValue": 500000
  }
}
```

---

### Profit & Loss
**Endpoints:**
- `GET /api/analytics/profit-loss` - Overall P&L
- `GET /api/analytics/profit-loss-over-time` - Daily breakdown
- `GET /api/analytics/profit-loss/products` - Per product

**Response:**
```json
{
  "success": true,
  "data": {
    "revenue": 150000,
    "purchaseCost": 100000,
    "grossProfit": 50000,
    "profitMargin": 33.33
  }
}
```

---

### Inventory Analysis

#### Inventory Turnover
**Endpoint:** `GET /api/analytics/inventory-turnover`

**Query Parameters:**
- `startDate`, `endDate`
- `limit`: Max products (default 10)

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalCOGS": 100000,
    "totalInventoryValue": 50000,
    "inventoryTurnoverRatio": 2.0
  },
  "products": [...]
}
```

#### Dead Stock
**Endpoint:** `GET /api/analytics/dead-stock`

**Query Parameters:**
- `days`: Days without sales (default 30)
- `limit`: Max products (default 10)

#### Product Movement
**Endpoint:** `GET /api/analytics/product-movement`

Returns fast-moving and slow-moving products.

#### Inventory Valuation
**Endpoints:**
- `GET /api/analytics/inventory-valuation` - Total
- `GET /api/analytics/inventory-valuation/category` - By category

#### ABC Analysis
**Endpoint:** `GET /api/analytics/inventory/abc-analysis`

Classifies products by inventory value:
- **A items**: Top 70% of value
- **B items**: Next 20% of value
- **C items**: Bottom 10% of value

---

### Inventory Alerts
**Endpoint:** `GET /api/analytics/inventory-alerts`

Returns products that need attention (low stock or out of stock).

---

## Stock Recommendations

### Get All Recommendations
**Endpoint:** `GET /api/analytics/inventory/stock-recommendations`

Returns AI-powered stock recommendations for all products.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productId": "...",
      "name": "Product Name",
      "category": "Electronics",
      "currentStock": 5,
      "lowStockThreshold": 10,
      "purchasePrice": 100,
      "salesLast7Days": 15,
      "salesLast30Days": 45,
      "salesPrevious30Days": 30,
      "averageDailySales": 1.5,
      "salesGrowth": 50.0,
      "daysOfStockRemaining": 3.33,
      "baseReorderQuantity": 40,
      "recommendation": "REORDER_NOW",
      "recommendedQuantity": 48,
      "reason": "Stock critically low with increasing demand. Current inventory will last only 3 days..."
    }
  ]
}
```

**Recommendation Types:**
- `NO_SALES` - No sales in last 30 days
- `REORDER_NOW` - Stock at or below threshold
- `REORDER_SOON` - Less than 7 days of stock
- `HEALTHY` - Adequate stock levels

---

### Get Single Product Recommendation
**Endpoint:** `GET /api/analytics/inventory/stock-recommendations/:productId`

Returns detailed recommendation for one product.

**Validation:**
- `productId` must be valid ObjectId
- Product must exist

**Response:** Same structure as above, but for single product

---

## Dashboard

### Executive Dashboard Summary
**Endpoint:** `GET /api/analytics/dashboard/summary`

Returns comprehensive business overview.

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalProducts": 150,
      "totalCustomers": 45,
      "totalStock": 5000,
      "inventoryValue": 500000,
      "lowStockCount": 12,
      "outOfStockCount": 3
    },
    "sales": {
      "period": "LAST_30_DAYS",
      "totalUnitsSold": 500,
      "totalSales": 75000,
      "salesCount": 120,
      "previousPeriod": { ... },
      "growth": 15.5
    },
    "purchases": { ... },
    "financial": {
      "period": "LAST_30_DAYS",
      "revenue": 75000,
      "costOfGoodsSold": 50000,
      "profit": 25000,
      "profitMargin": 33.33,
      "growth": 20.0,
      "previousPeriod": { ... }
    },
    "salesVsPurchases": {
      "sales": 75000,
      "purchases": 40000,
      "difference": 35000,
      "salesToPurchaseRatio": 1.875
    },
    "inventoryHealth": { ... },
    "trends": {
      "sales": [ /* daily data */ ],
      "purchases": [ /* daily data */ ]
    },
    "lowStockProducts": [ /* top 5 */ ],
    "topSellingProducts": [ /* top 5 */ ]
  }
}
```

---

## Reports

All report endpoints support date filtering via `startDate` and `endDate` query parameters.

### Sales Report
**Endpoint:** `GET /api/reports/sales`

**Query Parameters:**
- `startDate`, `endDate`: Optional date range (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2024-01-01",
      "endDate": "2024-12-31"
    },
    "summary": {
      "totalTransactions": 150,
      "totalUnitsSold": 1000,
      "totalRevenue": 150000
    },
    "salesByProduct": [ ... ],
    "salesByCategory": [ ... ],
    "salesOverTime": [ ... ],
    "topCustomers": [ ... ]
  }
}
```

---

### Purchase Report
**Endpoint:** `GET /api/reports/purchases`

Similar structure to sales report, includes:
- `purchasesByProduct`
- `purchasesByCategory`
- `purchasesOverTime`
- `topSuppliers`

---

### Inventory Report
**Endpoint:** `GET /api/reports/inventory`

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalProducts": 150,
      "totalQuantity": 5000,
      "totalInventoryValue": 500000,
      "healthyStockCount": 135,
      "lowStockCount": 12,
      "outOfStockCount": 3
    },
    "inventoryByCategory": [ ... ],
    "lowStockProducts": [
      {
        "productId": "...",
        "name": "Product Name",
        "sku": "SKU-001",
        "category": "Electronics",
        "currentStock": 5,
        "lowStockThreshold": 10,
        "inventoryValue": 500
      }
    ],
    "outOfStockProducts": [ ... ],
    "stockMovementSummary": {
      "totalPurchased": 2000,
      "totalSold": 1500,
      "purchaseTransactions": 50,
      "saleTransactions": 120
    }
  }
}
```

---

### Profit & Loss Report
**Endpoint:** `GET /api/reports/profit-loss`

**Response:**
```json
{
  "success": true,
  "data": {
    "period": { ... },
    "summary": {
      "revenue": 150000,
      "costOfGoodsSold": 100000,
      "grossProfit": 50000,
      "grossMargin": 33.33,
      "totalUnitsSold": 1000,
      "salesCount": 150
    },
    "profitByCategory": [
      {
        "category": "Electronics",
        "revenue": 80000,
        "costOfGoodsSold": 50000,
        "grossProfit": 30000,
        "grossMargin": 37.5,
        "unitsSold": 500
      }
    ],
    "profitOverTime": [ ... ]
  }
}
```

---

### Supplier Report
**Endpoint:** `GET /api/reports/suppliers`

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `supplierId`: Optional - filter by specific supplier

**Response:**
```json
{
  "success": true,
  "data": {
    "period": { ... },
    "summary": {
      "totalSuppliers": 15,
      "totalTransactions": 75,
      "totalQuantityPurchased": 2000,
      "totalPurchaseValue": 100000
    },
    "supplierPerformance": [
      {
        "supplierId": "...",
        "supplierName": "Acme Corp",
        "supplierEmail": "contact@acme.com",
        "supplierPhone": "1234567890",
        "totalPurchases": 25,
        "totalQuantityPurchased": 500,
        "totalPurchaseValue": 25000,
        "averagePurchaseValue": 1000,
        "lastPurchaseDate": "2024-01-15T...",
        "firstPurchaseDate": "2023-06-01T..."
      }
    ],
    "productsBySupplier": [ ... ]
  }
}
```

---

### Customer Report
**Endpoint:** `GET /api/reports/customers`

**Query Parameters:**
- `startDate`, `endDate`: Date range
- `customerId`: Optional - filter by specific customer

Similar structure to supplier report, returns:
- `customerPerformance`
- `productsByCustomer`
- Summary metrics

---

## Exports

All reports can be exported in multiple formats.

### Export Sales Report
**Endpoint:** `GET /api/reports/sales/export`

**Query Parameters:**
- `format`: Required - `csv`, `xlsx`, or `pdf`
- `startDate`, `endDate`: Optional date filter

**Example:**
```
GET /api/reports/sales/export?format=xlsx&startDate=2024-01-01&endDate=2024-12-31
```

**Response:**
- **Content-Type**: Varies by format
  - CSV: `text/csv`
  - XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - PDF: `application/pdf`
- **Content-Disposition**: `attachment; filename="sales-report-{timestamp}.{ext}"`

**CSV Features:**
- UTF-8 BOM for Excel compatibility
- Standard comma-separated format
- Header row included

**XLSX Features:**
- Styled header row (bold, colored background)
- Auto-fitted columns
- Proper Excel formatting

**PDF Features:**
- Landscape A4 layout
- Formatted table with alternating row colors
- Header includes report title and period
- Footer shows record count

---

### Export Purchase Report
**Endpoint:** `GET /api/reports/purchases/export`

Same parameters and format options as sales export.

---

### Export Inventory Report
**Endpoint:** `GET /api/reports/inventory/export`

Same format options. Date filter not applicable (current snapshot).

---

### Export Profit & Loss Report
**Endpoint:** `GET /api/reports/profit-loss/export`

Same parameters and format options.

---

## Error Codes

### 400 Bad Request
Returned when:
- Invalid date format
- Invalid ObjectId format
- Missing required fields
- Validation failures
- Invalid export format

### 404 Not Found
Returned when:
- Product not found
- Customer not found
- Supplier not found

### 500 Internal Server Error
Returned when:
- Database connection issues
- Unexpected server errors
- Gemini API failures (recommendation still works with fallback)

---

## Rate Limiting

Currently no rate limiting is implemented. Consider implementing rate limiting for production use.

---

## Pagination

Endpoints supporting pagination use these query parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | - | Page number (1-indexed) |
| `limit` | number | 10 | 100 | Items per page |

Response includes:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalProducts": 100,
    "limit": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Date Formats

**Input Format:** `YYYY-MM-DD`

**Examples:**
- `2024-01-01` - January 1, 2024
- `2024-12-31` - December 31, 2024

**Time Handling:**
- `startDate` includes entire day from 00:00:00
- `endDate` includes entire day until 23:59:59.999
- All dates stored as UTC in database
- All returned dates in ISO 8601 format

**Invalid Date Handling:**
```json
{
  "success": false,
  "message": "Invalid startDate"
}
```

---

## Best Practices

1. **Always validate ObjectIds** before making requests
2. **Use date ranges** for better performance on analytics
3. **Implement pagination** for large datasets
4. **Cache dashboard data** on client side (refresh every 5-10 minutes)
5. **Use appropriate export formats**:
   - CSV for data import/analysis
   - XLSX for formatted spreadsheets
   - PDF for presentation/reports
6. **Handle AI fallback** - Stock recommendations always return deterministic data
7. **Check inventory before sales** - System validates stock availability
8. **Use transactions** - Sale operations are atomic

---

## Webhooks

Currently not implemented. Future enhancement.

---

## Versioning

API versioning not currently implemented. Breaking changes will be documented.

---

## Support

For API issues or questions:
1. Check this documentation
2. Review test files for usage examples
3. Create an issue in the repository


---

## Forecasting and reorder (Phase 3)

All owner-only.

### Product forecast
**Endpoint:** `GET /api/analytics/forecast/:productId?horizon=30&lookback=180`

Returns a daily demand forecast with an 80% prediction interval, a backtest
score, a reorder policy, and the recent history the forecast was fitted from.

The method is chosen by how much history the SKU has: under 14 days it is an
honest average, 14-41 days a damped trend, 42 days or more Holt-Winters with
weekly seasonality. `forecast.warning` says so when the data is thin.

`accuracy` is `null` when there is not enough history to score a forecast
honestly, rather than reporting an invented number.

### Reorder plan
**Endpoint:** `GET /api/analytics/reorder-plan?serviceLevel=0.95&lookback=180`

Every product ranked by urgency, with suggested order quantities and estimated
cost. Reorder point is `mean daily demand x lead time + z x sigma x sqrt(lead
time)` - the safety stock scales with demand *variability*, so a volatile
product gets a bigger buffer than a steady one selling the same volume.

`serviceLevel` accepts 0.9, 0.95, 0.98 or 0.99.

### Forecast accuracy
**Endpoint:** `GET /api/analytics/forecast-accuracy`

Out-of-sample error across the catalogue: the last 30 days are held out, the
model forecasts them from the rest, and the result is scored against a naive
and a seasonal-naive baseline. `beatsBaselinePercent` is the honest headline.

---

## Anomaly watch (Phase 5)

**Endpoint:** `GET /api/analytics/anomalies?days=60&explain=true` — owner only

Three families of finding: unusual daily volume per product, sales recorded
below the list price, and staff accounts out of line with their peers. Outliers
are found with median/MAD rather than mean/standard deviation, because the
outlier being looked for distorts a mean-based yardstick into missing it.

`explain=false` skips the AI commentary. Findings always carry their numbers;
`narrative` is `null` when the model is unavailable.

---

## Assistant (Phase 4)

### Ask
**Endpoint:** `POST /api/ai/ask` — both roles

```json
{ "question": "Which products made the most profit last month?" }
```

The model selects from a fixed registry of read-only tools and fills in typed
parameters; the server executes them. It never writes a query.

Each tool carries a permission, checked against the **caller's** role before the
handler runs, using the same table as the HTTP routes. An employee asking about
margin is refused by the authorisation layer, not by a prompt instruction - and
the finance tools are never offered to them in the first place. The response
lists `toolCalls` so the answer can be checked against the lookups behind it.

Rate limited to 10 per minute per user. Returns `assistantAvailable: false`
rather than an error when no API key is configured.

### Status and usage
- `GET /api/ai/status` — whether AI is configured, the monthly cap, spend so far
- `GET /api/ai/usage` — 30-day breakdown by feature: calls, cache hits, failures, tokens, estimated cost, latency

### Briefings
- `GET /api/ai/briefings?limit=10` — stored weekly briefings, newest first
- `POST /api/ai/briefings` — generate one now (`{ "days": 7 }`)

Each briefing stores the figures it was written from, so the prose can be
checked against the arithmetic. `source` is `ai` or `deterministic`.

Also runnable headlessly for a cron schedule: `npm run briefing`.

---

## Receipts

**Endpoint:** `GET /api/movements/:id/receipt` — both roles

Returns `application/pdf`, sized for an 80mm thermal roll.

An employee may only print receipts for sales they recorded; another person's
sale returns **404**, not 403, so the ledger cannot be enumerated by id.

The receipt never renders a cost price or a margin. The response filter that
strips those elsewhere only wraps `res.json`, and a PDF stream bypasses it - so
the guarantee is built into what the renderer is given rather than relied on
downstream.


---

## Invoice scanning (Phase 6)

**Endpoint:** `POST /api/ai/invoice/extract` — owner only, `multipart/form-data`

Field `invoice`: a JPEG, PNG or WebP image, 8MB maximum. Held in memory and
passed straight to the model; never written to disk.

Gemini 2.5 Flash reads the page against a fixed schema and returns line items
exactly as printed — descriptions are *not* tidied, because the supplier's own
abbreviation is what makes matching work. The server then fuzzy-matches each
line to the catalogue (`services/ai/invoiceMatcher.js`), which is deliberately
not the model's job: a wrong match should be a bug with a stack trace, not a
hallucination nobody can debug.

Each line returns a status:

| Status | Meaning |
|---|---|
| `matched` | Confident and unambiguous — preselected, still confirmed by a human |
| `uncertain` | A suggestion, with alternatives |
| `unmatched` | Nothing close; the owner picks or skips |

A high score is not enough for `matched` — the runner-up must also be clearly
behind. Two products scoring alike means the line is genuinely ambiguous, and
preselecting either would be a coin flip presented as a decision.

**This endpoint never writes stock.** `committed` is always `false`. The client
posts confirmed lines to the existing `POST /api/products/:id/purchase`.

Responses: **422** when the image cannot be read (blurry, cropped, not an
invoice), **503** when no API key is configured, **415** for a non-image,
**413** over 8MB, rate limited to 20 per hour per user.
