# Smart Inventory & Sales Management System

A comprehensive backend system for managing inventory, sales, purchases, and business analytics with AI-powered stock recommendations.

## Features

### Core Functionality
- **Product Management**: CRUD operations for products with SKU tracking
- **Inventory Management**: Real-time stock tracking with automatic updates
- **Sales Processing**: Process sales with customer tracking and automatic stock reduction
- **Purchase Management**: Record purchases from suppliers with automatic stock increase
- **Customer Management**: Track customer information and purchase history
- **Supplier Management**: Manage supplier relationships and purchase history

### Analytics & Reporting
- **Sales Analytics**: Revenue, units sold, sales trends, and top products
- **Purchase Analytics**: Purchase costs, volume tracking, supplier performance
- **Inventory Analytics**: Stock valuation, ABC analysis, turnover rates
- **Profit & Loss**: Revenue vs COGS, gross profit, margin analysis
- **Customer Analytics**: Customer lifetime value, purchase patterns, spending trends
- **Supplier Analytics**: Supplier performance, purchase concentration

### Advanced Features
- **AI-Powered Stock Recommendations**: Intelligent reorder suggestions using Google Gemini
- **Executive Dashboard**: Comprehensive business overview with KPIs
- **Inventory Health Monitoring**: Low stock alerts, out-of-stock tracking
- **Multi-Format Export**: CSV, XLSX, and PDF export for all reports
- **Time-Series Analysis**: Sales and purchase trends over time
- **Date Range Filtering**: Flexible date-based reporting

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **AI Integration**: Google Gemini API (free tier)
- **Export Libraries**: 
  - json2csv (CSV export)
  - ExcelJS (XLSX export)
  - PDFKit (PDF generation)
- **Testing**: Jest + Supertest + MongoDB Memory Server

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- Google Gemini API key (optional, for AI recommendations)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd smart-inventory-management-system
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:

Create a `.env` file in the root directory:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/inventory-db
GEMINI_API_KEY=your_gemini_api_key_here
```

**Note**: The `GEMINI_API_KEY` is optional. Stock recommendations will work with deterministic calculations even without it.

4. Start the server:

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Documentation

### Base URL
```
http://localhost:3000
```

All endpoints support both `/api` prefix and without prefix.

---

## Product Endpoints

### Create Product
```http
POST /api/products
```

**Body:**
```json
{
  "name": "Product Name",
  "sku": "SKU-001",
  "category": "Electronics",
  "purchasePrice": 100,
  "sellingPrice": 150,
  "unitPrice": 150,
  "quantity": 50,
  "lowStockThreshold": 10,
  "description": "Product description"
}
```

### Get All Products
```http
GET /api/products?page=1&limit=10&category=Electronics&search=laptop
```

### Get Product by ID
```http
GET /api/products/:id
```

### Update Product
```http
PUT /api/products/:id
```

### Delete Product
```http
DELETE /api/products/:id
```

### Purchase Product (Add Stock)
```http
POST /api/products/:id/purchase
```

**Body:**
```json
{
  "quantity": 20,
  "unitPrice": 100,
  "supplierId": "supplier_id_here"
}
```

### Sell Product (Reduce Stock)
```http
POST /api/products/:id/sell
```

**Body:**
```json
{
  "quantity": 5,
  "unitPrice": 150,
  "customerId": "customer_id_here"
}
```

---

## Analytics Endpoints

### Sales Analytics
```http
GET /api/analytics/sales?startDate=2024-01-01&endDate=2024-12-31
```

**Response includes:**
- Total revenue and units sold
- Sales count
- Sales over time (daily breakdown)

### Purchase Analytics
```http
GET /api/analytics/purchases?startDate=2024-01-01&endDate=2024-12-31
```

### Top Selling Products
```http
GET /api/analytics/top-selling-products?limit=10&startDate=2024-01-01
```

### Product Analytics
```http
GET /api/analytics/products/:productId?startDate=2024-01-01&endDate=2024-12-31
```

### Sales vs Purchases Comparison
```http
GET /api/analytics/sales-vs-purchases?startDate=2024-01-01&endDate=2024-12-31
```

### Category Analytics
```http
GET /api/analytics/sales-by-category
GET /api/analytics/purchases-by-category
GET /api/analytics/inventory-by-category
```

### Inventory Health
```http
GET /api/analytics/inventory-health
```

**Returns:**
- Total products count
- Low stock count
- Out of stock count
- Healthy stock count
- Total inventory value

### Profit & Loss
```http
GET /api/analytics/profit-loss?startDate=2024-01-01&endDate=2024-12-31
GET /api/analytics/profit-loss-over-time
GET /api/analytics/profit-loss/products
```

### Inventory Analysis
```http
GET /api/analytics/inventory-turnover?limit=10
GET /api/analytics/dead-stock?days=30&limit=10
GET /api/analytics/product-movement?limit=10
GET /api/analytics/inventory-valuation
GET /api/analytics/inventory-valuation/category
GET /api/analytics/inventory/abc-analysis
```

### Alerts
```http
GET /api/analytics/inventory-alerts
```

---

## Stock Recommendation Endpoints

### Get All Stock Recommendations
```http
GET /api/analytics/inventory/stock-recommendations
```

**Response includes for each product:**
- Current stock and low stock threshold
- Sales metrics (last 7 days, last 30 days, previous 30 days)
- Average daily sales
- Sales growth percentage
- Days of stock remaining
- Recommendation status: `REORDER_NOW`, `REORDER_SOON`, `HEALTHY`, `NO_SALES`
- Recommended reorder quantity
- AI-generated explanation (when available)

### Get Single Product Recommendation
```http
GET /api/analytics/inventory/stock-recommendations/:productId
```

**Recommendation Logic:**
- **NO_SALES**: Product has no sales in the last 30 days
- **REORDER_NOW**: Stock ≤ low stock threshold OR stock = 0
- **REORDER_SOON**: Days of stock remaining ≤ 7
- **HEALTHY**: Stock levels are adequate

**Reorder Quantity Calculation:**
- Base quantity = (average daily sales × 30) - current stock
- Adjusted for sales growth:
  - +20% if growth ≥ 25%
  - +10% if growth ≥ 10%
  - -20% if growth ≤ -25%
  - -10% if growth ≤ -10%

---

## Dashboard Endpoint

### Executive Dashboard Summary
```http
GET /api/analytics/dashboard/summary
```

**Returns comprehensive overview:**
- **Overview**: Total products, customers, stock, inventory value, alerts
- **Sales**: Last 30 days sales with growth comparison
- **Purchases**: Last 30 days purchases with growth comparison
- **Financial**: Revenue, COGS, profit, profit margin with growth
- **Sales vs Purchases**: Comparison and ratio
- **Inventory Health**: Stock distribution
- **Trends**: Daily sales and purchase trends
- **Low Stock Products**: Top 5 products needing attention
- **Top Selling Products**: Top 5 best sellers

---

## Report Endpoints

### Sales Report
```http
GET /api/reports/sales?startDate=2024-01-01&endDate=2024-12-31
```

**Returns:**
- Period summary (transactions, units, revenue)
- Sales by product
- Sales by category
- Sales over time
- Top customers

### Purchase Report
```http
GET /api/reports/purchases?startDate=2024-01-01&endDate=2024-12-31
```

**Returns:**
- Period summary (transactions, units, cost)
- Purchases by product
- Purchases by category
- Purchases over time
- Top suppliers

### Inventory Report
```http
GET /api/reports/inventory
```

**Returns:**
- Inventory summary (total products, quantity, value)
- Inventory by category
- Low stock products
- Out of stock products
- Stock movement summary

### Profit & Loss Report
```http
GET /api/reports/profit-loss?startDate=2024-01-01&endDate=2024-12-31
```

**Returns:**
- Period summary (revenue, COGS, gross profit, margin)
- Profit by category
- Profit over time

### Supplier Report
```http
GET /api/reports/suppliers?startDate=2024-01-01&endDate=2024-12-31&supplierId=optional
```

**Returns:**
- Supplier performance metrics
- Products by supplier
- Period summary

### Customer Report
```http
GET /api/reports/customers?startDate=2024-01-01&endDate=2024-12-31&customerId=optional
```

**Returns:**
- Customer performance metrics
- Products by customer
- Period summary

---

## Export Endpoints

All reports can be exported in CSV, XLSX, or PDF format:

```http
GET /api/reports/sales/export?format=csv&startDate=2024-01-01
GET /api/reports/purchases/export?format=xlsx
GET /api/reports/inventory/export?format=pdf
GET /api/reports/profit-loss/export?format=csv
```

**Supported formats:**
- `csv` - Comma-separated values (with UTF-8 BOM)
- `xlsx` - Excel spreadsheet (with styled headers)
- `pdf` - PDF document (landscape layout)

**Export features:**
- Automatic file download with proper headers
- Date period included in PDF metadata
- Formatted columns in XLSX
- UTF-8 BOM in CSV for Excel compatibility

---

## Customer Endpoints

### Create Customer
```http
POST /api/customers
```

**Body:**
```json
{
  "name": "Customer Name",
  "phone": "1234567890",
  "email": "customer@example.com",
  "address": "Customer Address"
}
```

### Get All Customers
```http
GET /api/customers
```

### Get Customer Purchase History
```http
GET /api/customer/:customerId/purchase-history?page=1&limit=10&startDate=2024-01-01
```

### Get Customer Spending Over Time
```http
GET /api/customer/:customerId/spending-over-time?startDate=2024-01-01
```

### Customer Analytics
```http
GET /api/analytics/customer
GET /api/analytics/customer/top?limit=10
```

---

## Supplier Endpoints

### Create Supplier
```http
POST /api/suppliers
```

**Body:**
```json
{
  "name": "Supplier Name",
  "email": "supplier@example.com",
  "phone": "1234567890",
  "address": "Supplier Address"
}
```

### Get All Suppliers
```http
GET /api/suppliers
```

### Supplier Performance
```http
GET /api/analytics/supplier-performance?limit=10&startDate=2024-01-01
```

---

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/reports.test.js

# Run with coverage
npm test -- --coverage
```

**Test Coverage:**
- Stock recommendations: 15 tests
- Reports: 26 tests
- Export functionality: 22 tests
- Customer analytics: 63 tests
- Dashboard summary: 83 tests
- Total: 516+ passing tests

---

## Data Models

### Product Schema
```javascript
{
  name: String,           // Product name
  sku: String,            // Unique SKU
  category: String,       // Product category
  purchasePrice: Number,  // Cost price
  sellingPrice: Number,   // Retail price
  unitPrice: Number,      // Current unit price
  quantity: Number,       // Current stock
  lowStockThreshold: Number,
  description: String,
  createdAt: Date,
  updatedAt: Date
}
```

### StockMovement Schema
```javascript
{
  product: ObjectId,      // Reference to Product
  type: String,           // "SALE" or "PURCHASE"
  quantity: Number,
  unitPrice: Number,
  supplier: ObjectId,     // Required for PURCHASE
  customer: ObjectId,     // Required for SALE
  prevQuantity: Number,
  newQuantity: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Customer Schema
```javascript
{
  name: String,
  phone: String,          // Unique
  email: String,
  address: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Supplier Schema
```javascript
{
  name: String,
  email: String,
  phone: String,
  address: String,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | 3000 |
| `MONGO_URI` | Yes | MongoDB connection string | - |
| `GEMINI_API_KEY` | No | Google Gemini API key for AI recommendations | - |

**Getting Gemini API Key:**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add to `.env` file

**Note**: System works without Gemini API key using deterministic calculations. AI provides enhanced explanations when available.

---

## Architecture

### Request Flow
```
Client Request
    ↓
Express Routes
    ↓
Validation Middleware (if applicable)
    ↓
Controller
    ↓
Business Logic / Analytics Service
    ↓
MongoDB / Mongoose
    ↓
Response
```

### AI Integration Flow
```
MongoDB
    ↓
Deterministic Metrics Calculation (source of truth)
    ↓
Recommendation Service
    ↓
[Optional] Gemini AI (explanations & insights)
    ↓
Fallback to rule-based if AI unavailable
    ↓
Response with metrics + explanation
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `404` - Not Found
- `500` - Internal Server Error

---

## Date Handling

**Format**: `YYYY-MM-DD`

**Examples:**
- `2024-01-01` - January 1, 2024
- `2024-12-31` - December 31, 2024

**Behavior:**
- Start date is inclusive (00:00:00)
- End date is inclusive (23:59:59.999)
- Invalid dates return 400 error
- Omitted dates mean "all time"

---

## Performance Considerations

- MongoDB aggregation pipelines for analytics
- Efficient indexing on frequently queried fields
- Pagination for large datasets
- Lean queries for read-heavy operations
- Connection pooling for database

---

## Security Best Practices

- API keys stored in environment variables
- Input validation on all endpoints
- MongoDB injection prevention
- Error messages don't expose implementation details
- Proper ObjectId validation

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes with clear messages
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

---

## License

ISC

---

## Support

For issues and questions:
- Create an issue in the repository
- Check existing documentation
- Review test files for usage examples

---

## Roadmap

### Completed Features
✅ Product, Customer, Supplier CRUD  
✅ Sales and Purchase processing  
✅ Comprehensive analytics endpoints  
✅ AI-powered stock recommendations  
✅ Executive dashboard  
✅ Comprehensive reporting  
✅ Multi-format export (CSV, XLSX, PDF)  
✅ Stock movement tracking  
✅ Inventory health monitoring  

### Potential Future Enhancements
- User authentication and authorization
- Multi-warehouse support
- Batch import/export
- Real-time notifications
- Mobile API optimization
- Advanced forecasting
- Integration with payment gateways
- Automated purchase orders

---

## Acknowledgments

- Google Gemini API for AI recommendations
- MongoDB for database
- Express.js framework
- Jest testing framework
- Open-source export libraries (json2csv, ExcelJS, PDFKit)
