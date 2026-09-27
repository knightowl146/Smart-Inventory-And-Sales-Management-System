/**
 * Turning an unrecognised invoice line into a draft catalogue product.
 *
 * An invoice says what the supplier called the thing and what they charged for
 * it. A product also needs a selling price, a category, a SKU and a low-stock
 * level - and those are the owner's decisions, not the invoice's. So this only
 * pre-fills what the invoice genuinely knows, and suggests the rest in a form
 * the owner can overwrite. The selling price is never guessed: an app that
 * invents a price is an app nobody should trust with prices.
 */

// Kept in capitals when a supplier's all-caps line is tidied.
const ACRONYMS = new Set([
  "AC", "ANC", "AUX", "CCTV", "CPU", "DC", "FHD", "GPS", "GPU", "HD", "HDD", "HDMI",
  "IPS", "IR", "LCD", "LED", "NFC", "OLED", "OTG", "PC", "PD", "QLED", "RAM", "RGB",
  "SD", "SSD", "TKL", "TV", "TWS", "UHD", "UPS", "USB", "VGA",
]);

const SPELLINGS = { WIFI: "Wi-Fi", MICROSD: "MicroSD", MAH: "mAh" };

// Lower case inside a name, as in "USB-C to HDMI Adapter" or "8 in 1".
const SMALL_WORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with"]);

const titleWord = (word, position) => {
  // Sizes and model codes keep the form the unit formatting gave them.
  if (/\d/.test(word)) return word;
  if (position > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();

  return word
    .split("-")
    .map((part) => {
      const upper = part.toUpperCase();
      if (SPELLINGS[upper]) return SPELLINGS[upper];
      if (ACRONYMS.has(upper)) return upper;
      // Model codes and sizes: AX1800, CL10, 4K, 2.4GHZ - leave as printed.
      if (/\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("-");
};

/**
 * "POWER BANK 20000 MAH 45W PD" -> "Power Bank 20000mAh 45W PD".
 *
 * Only rewrites lines printed in capitals, which is how most suppliers print
 * them. Anything already in mixed case was written by a person and is left
 * alone apart from whitespace.
 */
export const tidyProductName = (description = "") => {
  let text = String(description).replace(/\s+/g, " ").trim();

  const letters = text.replace(/[^A-Za-z]/g, "");
  const capitals = letters.replace(/[^A-Z]/g, "");
  const shouting = letters.length > 0 && capitals.length / letters.length > 0.7;

  if (!shouting) return text.slice(0, 100);

  // Join a number to the unit after it, then format the unit.
  text = text
    .replace(/\bMICRO\s+SD\b/gi, "MICROSD")
    .replace(/(\d)\s+(GB|TB|MB|MAH|W|MTRS?|INCH(?:ES)?)\b/gi, "$1$2")
    .replace(/(\d)\s+IN\b(?!\s*\d)/gi, "$1IN");

  const words = text.split(" ").map((word) =>
    word
      .replace(/^(\d+(?:\.\d+)?)(GB|TB|MB)$/i, (_, n, unit) => `${n}${unit.toUpperCase()}`)
      .replace(/^(\d+)MAH$/i, "$1mAh")
      .replace(/^(\d+(?:\.\d+)?)W$/i, "$1W")
      .replace(/^(\d+(?:\.\d+)?)(?:MTRS?|M)$/i, "$1m")
      .replace(/^(\d+(?:\.\d+)?)(?:INCH(?:ES)?|IN)$/i, "$1-inch")
  );

  return words.map(titleWord).join(" ").slice(0, 100);
};

const CODE = /^([A-Z]+)-(\d+)$/;

/**
 * A SKU that follows the shop's own pattern: the prefix most used in that
 * category, and the next free number for it. A category the shop has never
 * used gets a prefix from its name. Always checked against every existing SKU.
 */
export const suggestSku = (category, products = []) => {
  const inCategory = products.filter(
    (product) => (product.category || "").toLowerCase() === (category || "").trim().toLowerCase()
  );

  const prefixCounts = new Map();
  for (const product of inCategory) {
    const match = CODE.exec(product.sku || "");
    if (match) prefixCounts.set(match[1], (prefixCounts.get(match[1]) ?? 0) + 1);
  }

  let prefix = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (!prefix) {
    const letters = (category || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    prefix = (letters.slice(0, 3) || "NEW").padEnd(3, "X");
  }

  const taken = new Set(products.map((product) => (product.sku || "").toUpperCase()));
  let number = Math.max(
    0,
    ...products
      .map((product) => CODE.exec(product.sku || ""))
      .filter((match) => match && match[1] === prefix)
      .map((match) => Number(match[2]))
  );

  let sku;
  do {
    number += 1;
    sku = `${prefix}-${String(number).padStart(3, "0")}`;
  } while (taken.has(sku));

  return sku;
};

/**
 * Low-stock alert level, from price - the same bands the seeded catalogue
 * uses. A shop keeps a carton of cables and two televisions; one fixed number
 * either nags about the televisions or never notices the cables run out.
 */
export const suggestThreshold = (sellingPrice) => {
  const price = Number(sellingPrice) || 0;
  if (price <= 0) return 10;
  if (price <= 500) return 40;
  if (price <= 2000) return 20;
  if (price <= 8000) return 10;
  if (price <= 25000) return 5;
  return 3;
};

/** The form's starting values for one unrecognised line. */
export const draftFromLine = (row, invoice = {}, products = []) => {
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const cost = Math.max(1, Math.round(Number(row.unitPrice) || 0));

  const source = [invoice.supplierName, invoice.invoiceNumber && `invoice ${invoice.invoiceNumber}`]
    .filter(Boolean)
    .join(", ");

  return {
    name: tidyProductName(row.description),
    category: "",
    categories,
    sku: "",
    purchasePrice: String(cost),
    sellingPrice: "",
    lowStockThreshold: "",
    description: `Added from ${source || "a supplier invoice"}. Printed on the invoice as "${row.description}".`.slice(0, 500),
  };
};

/**
 * Check a draft before it is sent. Returns field -> message; empty when valid.
 * The server checks all of this again - this is so the owner hears about a
 * problem next to the field, not as one generic error after pressing Create.
 */
export const validateDraft = (draft, products = []) => {
  const errors = {};
  const name = draft.name.trim();

  if (name.length < 3) errors.name = "At least 3 characters.";
  if (name.length > 100) errors.name = "At most 100 characters.";
  if (!draft.category.trim()) errors.category = "Pick or type a category.";

  const sku = draft.sku.trim();
  if (!sku) errors.sku = "Required.";
  else if (products.some((product) => (product.sku || "").toUpperCase() === sku.toUpperCase())) {
    errors.sku = "Another product already uses this SKU.";
  }

  const cost = Number(draft.purchasePrice);
  const selling = Number(draft.sellingPrice);

  if (!Number.isInteger(cost) || cost <= 0) errors.purchasePrice = "A whole number above 0.";
  if (draft.sellingPrice === "") errors.sellingPrice = "Set your selling price.";
  else if (!Number.isInteger(selling) || selling <= 0) errors.sellingPrice = "A whole number above 0.";

  if (draft.lowStockThreshold !== "" && (!Number.isInteger(Number(draft.lowStockThreshold)) || Number(draft.lowStockThreshold) < 0)) {
    errors.lowStockThreshold = "A whole number, 0 or more.";
  }

  if (!draft.description.trim()) errors.description = "Required.";

  return errors;
};
