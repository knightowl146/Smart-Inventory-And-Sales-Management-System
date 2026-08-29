require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("./models/Product");

const products = [
  // Beverages (10)
  {
    name: "Milk 1L",
    sku: "BEV-001",
    category: "Beverages",
    purchasePrice: 45,
    sellingPrice: 60,
    quantity: 50,
    description: "Fresh whole milk 1 liter pouch",
  },
  {
    name: "Dark Roast Coffee 200g",
    sku: "BEV-002",
    category: "Beverages",
    purchasePrice: 220,
    sellingPrice: 280,
    quantity: 30,
    description: "Premium instant coffee powder 200g jar",
  },
  {
    name: "Green Tea 100 Bags",
    sku: "BEV-003",
    category: "Beverages",
    purchasePrice: 180,
    sellingPrice: 240,
    quantity: 25,
    description: "Organic green tea bags pack of 100",
  },
  {
    name: "Orange Juice 1L",
    sku: "BEV-004",
    category: "Beverages",
    purchasePrice: 85,
    sellingPrice: 110,
    quantity: 40,
    description: "100% natural orange juice bottle",
  },
  {
    name: "Sparkling Soda 750ml",
    sku: "BEV-005",
    category: "Beverages",
    purchasePrice: 35,
    sellingPrice: 50,
    quantity: 60,
    description: "Carbonated lemon sparkling water 750ml",
  },
  {
    name: "Mango Drink 1L",
    sku: "BEV-006",
    category: "Beverages",
    purchasePrice: 60,
    sellingPrice: 85,
    quantity: 45,
    description: "Refreshing Alphonso mango fruit drink 1L",
  },
  {
    name: "Chocolate Drink Mix 500g",
    sku: "BEV-007",
    category: "Beverages",
    purchasePrice: 190,
    sellingPrice: 240,
    quantity: 35,
    description: "Malt-based chocolate health drink powder",
  },
  {
    name: "Herbal Black Tea 250g",
    sku: "BEV-008",
    category: "Beverages",
    purchasePrice: 120,
    sellingPrice: 160,
    quantity: 20,
    description: "Loose leaf Assam black tea 250g pack",
  },
  {
    name: "Energy Drink 250ml",
    sku: "BEV-009",
    category: "Beverages",
    purchasePrice: 70,
    sellingPrice: 100,
    quantity: 50,
    description: "Revitalizing caffeine energy drink can",
  },
  {
    name: "Coconut Water 200ml",
    sku: "BEV-010",
    category: "Beverages",
    purchasePrice: 30,
    sellingPrice: 45,
    quantity: 40,
    description: "Natural packaged tender coconut water",
  },

  // Snacks & Packaged Foods (10)
  {
    name: "Potato Chips Salted 150g",
    sku: "SNK-001",
    category: "Snacks",
    purchasePrice: 30,
    sellingPrice: 45,
    quantity: 80,
    description: "Crispy salted potato chips family pack",
  },
  {
    name: "Chocolate Chip Cookies 200g",
    sku: "SNK-002",
    category: "Snacks",
    purchasePrice: 50,
    sellingPrice: 75,
    quantity: 60,
    description: "Crunchy butter cookies with dark chocolate chips",
  },
  {
    name: "Instant Noodles 4-Pack",
    sku: "SNK-003",
    category: "Snacks",
    purchasePrice: 40,
    sellingPrice: 60,
    quantity: 100,
    description: "Masala flavor instant wheat noodles 4-pack",
  },
  {
    name: "Dark Chocolate Bar 100g",
    sku: "SNK-004",
    category: "Snacks",
    purchasePrice: 90,
    sellingPrice: 130,
    quantity: 45,
    description: "70% cocoa rich dark chocolate bar",
  },
  {
    name: "Roasted Almonds 200g",
    sku: "SNK-005",
    category: "Snacks",
    purchasePrice: 250,
    sellingPrice: 340,
    quantity: 30,
    description: "Lightly salted roasted premium almonds",
  },
  {
    name: "Nacho Chips Cheese 150g",
    sku: "SNK-006",
    category: "Snacks",
    purchasePrice: 45,
    sellingPrice: 70,
    quantity: 55,
    description: "Tangy cheese flavored corn tortilla chips",
  },
  {
    name: "Salted Peanut Packet 200g",
    sku: "SNK-007",
    category: "Snacks",
    purchasePrice: 35,
    sellingPrice: 50,
    quantity: 70,
    description: "Crunchy roasted salted peanuts",
  },
  {
    name: "Multigrain Crackers 180g",
    sku: "SNK-008",
    category: "Snacks",
    purchasePrice: 55,
    sellingPrice: 80,
    quantity: 40,
    description: "Healthy multigrain baked snack crackers",
  },
  {
    name: "Gummy Bears Pack 150g",
    sku: "SNK-009",
    category: "Snacks",
    purchasePrice: 40,
    sellingPrice: 65,
    quantity: 50,
    description: "Assorted fruit flavored chewy gummy candies",
  },
  {
    name: "Oat Cookies 250g",
    sku: "SNK-010",
    category: "Snacks",
    purchasePrice: 60,
    sellingPrice: 90,
    quantity: 35,
    description: "Whole grain oats and raisin digestive cookies",
  },

  // Groceries & Staples (10)
  {
    name: "Basmati Rice 5kg",
    sku: "GRC-001",
    category: "Groceries",
    purchasePrice: 450,
    sellingPrice: 600,
    quantity: 25,
    description: "Long grain aromatic aged Basmati rice 5kg",
  },
  {
    name: "Whole Wheat Flour 5kg",
    sku: "GRC-002",
    category: "Groceries",
    purchasePrice: 180,
    sellingPrice: 240,
    quantity: 30,
    description: "100% stone ground whole wheat chakki atta 5kg",
  },
  {
    name: "Sunflower Cooking Oil 1L",
    sku: "GRC-003",
    category: "Groceries",
    purchasePrice: 110,
    sellingPrice: 145,
    quantity: 40,
    description: "Refined sunflower oil for healthy daily cooking",
  },
  {
    name: "White Sugar 1kg",
    sku: "GRC-004",
    category: "Groceries",
    purchasePrice: 40,
    sellingPrice: 52,
    quantity: 60,
    description: "Pure refined crystal white sugar 1kg pouch",
  },
  {
    name: "Iodized Salt 1kg",
    sku: "GRC-005",
    category: "Groceries",
    purchasePrice: 18,
    sellingPrice: 25,
    quantity: 90,
    description: "Vacuum evaporated iodized table salt 1kg",
  },
  {
    name: "Yellow Lentils Toor Dal 1kg",
    sku: "GRC-006",
    category: "Groceries",
    purchasePrice: 115,
    sellingPrice: 150,
    quantity: 35,
    description: "Unpolished protein-rich Toor Arhar dal 1kg",
  },
  {
    name: "Red Chili Powder 200g",
    sku: "GRC-007",
    category: "Groceries",
    purchasePrice: 65,
    sellingPrice: 90,
    quantity: 50,
    description: "Spicy aromatic pure red chili powder",
  },
  {
    name: "Turmeric Powder 200g",
    sku: "GRC-008",
    category: "Groceries",
    purchasePrice: 45,
    sellingPrice: 65,
    quantity: 50,
    description: "Pure high-curcumin yellow turmeric powder",
  },
  {
    name: "Raw Honey 500g",
    sku: "GRC-009",
    category: "Groceries",
    purchasePrice: 180,
    sellingPrice: 250,
    quantity: 20,
    description: "Organic pure forest raw honey 500g glass jar",
  },
  {
    name: "Olive Oil Extra Virgin 500ml",
    sku: "GRC-010",
    category: "Groceries",
    purchasePrice: 380,
    sellingPrice: 490,
    quantity: 15,
    description: "Cold-pressed extra virgin olive oil 500ml bottle",
  },

  // Personal Care (10)
  {
    name: "Moisturizing Soap 125g",
    sku: "PER-001",
    category: "Personal Care",
    purchasePrice: 35,
    sellingPrice: 50,
    quantity: 75,
    description: "Gentle moisturizing bathing soap bar with cream",
  },
  {
    name: "Anti-Dandruff Shampoo 350ml",
    sku: "PER-002",
    category: "Personal Care",
    purchasePrice: 190,
    sellingPrice: 260,
    quantity: 30,
    description: "Tea tree oil anti-dandruff hair shampoo 350ml",
  },
  {
    name: "Fluoride Toothpaste 150g",
    sku: "PER-003",
    category: "Personal Care",
    purchasePrice: 60,
    sellingPrice: 85,
    quantity: 65,
    description: "Complete oral care fluoride toothpaste tube",
  },
  {
    name: "Soft Bristle Toothbrush 2-Pack",
    sku: "PER-004",
    category: "Personal Care",
    purchasePrice: 40,
    sellingPrice: 65,
    quantity: 50,
    description: "Ultra soft sensitive care toothbrush set of 2",
  },
  {
    name: "Body Wash Gel 250ml",
    sku: "PER-005",
    category: "Personal Care",
    purchasePrice: 140,
    sellingPrice: 195,
    quantity: 25,
    description: "Refreshing aloe vera shower gel body wash",
  },
  {
    name: "Hand Sanitizer 200ml",
    sku: "PER-006",
    category: "Personal Care",
    purchasePrice: 50,
    sellingPrice: 75,
    quantity: 60,
    description: "70% alcohol rinse-free hand sanitizer bottle",
  },
  {
    name: "Deodorant Spray 150ml",
    sku: "PER-007",
    category: "Personal Care",
    purchasePrice: 150,
    sellingPrice: 210,
    quantity: 35,
    description: "24-hour freshness long lasting body spray",
  },
  {
    name: "Face Wash Cleanser 100ml",
    sku: "PER-008",
    category: "Personal Care",
    purchasePrice: 110,
    sellingPrice: 160,
    quantity: 30,
    description: "Deep purifying neem face wash 100ml tube",
  },
  {
    name: "Body Lotion 200ml",
    sku: "PER-009",
    category: "Personal Care",
    purchasePrice: 130,
    sellingPrice: 180,
    quantity: 25,
    description: "Cocoa butter intensive skin moisturizing lotion",
  },
  {
    name: "Wet Wipes 80 Sheets",
    sku: "PER-010",
    category: "Personal Care",
    purchasePrice: 80,
    sellingPrice: 120,
    quantity: 40,
    description: "Alcohol-free refreshing wet tissue wipes pack",
  },

  // Household & Cleaning (10)
  {
    name: "Laundry Detergent Powder 1kg",
    sku: "HSH-001",
    category: "Household",
    purchasePrice: 110,
    sellingPrice: 150,
    quantity: 40,
    description: "Stain remover active clean laundry detergent powder",
  },
  {
    name: "Dishwash Liquid Gel 500ml",
    sku: "HSH-002",
    category: "Household",
    purchasePrice: 70,
    sellingPrice: 95,
    quantity: 50,
    description: "Lemon concentrate dishwashing liquid gel bottle",
  },
  {
    name: "Disinfectant Floor Cleaner 1L",
    sku: "HSH-003",
    category: "Household",
    purchasePrice: 120,
    sellingPrice: 165,
    quantity: 35,
    description: "Pine fragrance 99.9% germ protection floor cleaner",
  },
  {
    name: "Glass Cleaner Spray 500ml",
    sku: "HSH-004",
    category: "Household",
    purchasePrice: 75,
    sellingPrice: 105,
    quantity: 30,
    description: "Shine formula window and mirror cleaner spray",
  },
  {
    name: "Toilet Cleaner Liquid 750ml",
    sku: "HSH-005",
    category: "Household",
    purchasePrice: 90,
    sellingPrice: 125,
    quantity: 40,
    description: "Power disinfectant toilet cleaning gel 750ml",
  },
  {
    name: "Kitchen Scrub Sponge 3-Pack",
    sku: "HSH-006",
    category: "Household",
    purchasePrice: 25,
    sellingPrice: 40,
    quantity: 70,
    description: "Heavy duty non-scratch kitchen scrub sponge set",
  },
  {
    name: "Garbage Bags 30 Rolls",
    sku: "HSH-007",
    category: "Household",
    purchasePrice: 80,
    sellingPrice: 120,
    quantity: 45,
    description: "Medium size biodegradable black trash bags roll",
  },
  {
    name: "Paper Tissue Box 200 Pulls",
    sku: "HSH-008",
    category: "Household",
    purchasePrice: 60,
    sellingPrice: 90,
    quantity: 50,
    description: "2-ply soft facial tissue box 200 pulls",
  },
  {
    name: "Aluminum Foil Roll 9 Meters",
    sku: "HSH-009",
    category: "Household",
    purchasePrice: 70,
    sellingPrice: 100,
    quantity: 35,
    description: "Food grade fresh wrap aluminum foil paper 9m",
  },
  {
    name: "Air Freshener Spray 220ml",
    sku: "HSH-010",
    category: "Household",
    purchasePrice: 110,
    sellingPrice: 155,
    quantity: 30,
    description: "Lavender fragrance room air freshener spray",
  },
];

async function seed() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is not defined");
    }

    console.log("Connecting to database...");
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully.");

    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of products) {
      if (item.unitPrice === undefined) {
        item.unitPrice = item.sellingPrice;
      }
      if (item.lowStockThreshold === undefined) {
        item.lowStockThreshold = 10;
      }
      const result = await Product.findOneAndUpdate(
        { sku: item.sku },
        item,
        { upsert: true, new: true, runValidators: true, rawResult: true }
      );

      if (result.lastErrorObject && result.lastErrorObject.updatedExisting) {
        updatedCount++;
      } else {
        insertedCount++;
      }
    }

    console.log(`\nSeeding completed successfully!`);
    console.log(`- New products created: ${insertedCount}`);
    console.log(`- Existing products updated: ${updatedCount}`);
    console.log(`- Total general store products: ${products.length}`);
  } catch (error) {
    console.error("Error seeding products:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
}

seed();
