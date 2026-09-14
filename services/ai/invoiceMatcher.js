/**
 * Matching extracted invoice lines to catalogue products.
 *
 * A supplier writes "COLGATE T/PASTE 100GM" where the catalogue says "Colgate
 * Toothpaste 100g". Exact matching finds nothing, and asking the model to pick
 * the product is the wrong division of labour: the model reads the picture, the
 * server decides what the picture refers to. That way a wrong match is a bug
 * that can be traced and fixed rather than a hallucination that cannot.
 *
 * Pure functions, so the matching can be tested against real-looking supplier
 * abbreviations without a database or an API key anywhere in sight.
 */

/**
 * Normalise for comparison: lowercase, strip punctuation, and expand the unit
 * abbreviations that vary most between an invoice and a catalogue.
 */
const UNIT_ALIASES = [
  // Sizes attached to a number, which is how nearly every supplier prints them:
  // "75GM", "100 GM", "2LTR". These must come first and must NOT use \b before
  // the unit - there is no word boundary between a digit and a letter, so
  // /\bgms?\b/ never fires on "75gm" and the size token stays unmatchable.
  // This was the single biggest cause of near-misses before it was fixed.
  [/(\d)\s*(?:gms?|grams?)\b/g, "$1g"],
  [/(\d)\s*(?:kgs?|kilos?|kilograms?)\b/g, "$1kg"],
  [/(\d)\s*mls?\b/g, "$1ml"],
  [/(\d)\s*(?:ltrs?|litres?|liters?)\b/g, "$1l"],

  // Standalone words.
  [/\bgms?\b/g, "g"],
  [/\bgrams?\b/g, "g"],
  [/\bkgs?\b/g, "kg"],
  [/\bkilos?\b/g, "kg"],
  [/\bmls?\b/g, "ml"],
  [/\b(?:ltrs?|litres?|liters?)\b/g, "l"],
  [/\bpcs?\b/g, "piece"],
  [/\bpkts?\b/g, "packet"],
  [/\bt\/paste\b/g, "toothpaste"],
  [/\bt\/brush\b/g, "toothbrush"],
];

const normalise = (value) => {
  let text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, " ");

  for (const [pattern, replacement] of UNIT_ALIASES) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, " ").trim();
};

/** Split into comparable tokens, dropping noise words that carry no signal. */
const STOP_WORDS = new Set(["the", "and", "of", "for", "with", "pack", "box", "case"]);

const tokenise = (value) =>
  normalise(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

/**
 * Levenshtein distance, iterative with two rows.
 *
 * Used only on short single tokens, so the O(n*m) cost is irrelevant and the
 * simple implementation is the right one.
 */
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];

    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost);
    }

    previous = current;
  }

  return previous[b.length];
};

/** Two tokens count as the same word if they are close enough for their length. */
const tokensMatch = (a, b) => {
  if (a === b) return true;
  if (a.length <= 3 || b.length <= 3) return false;

  // One typo in a short word, two in a long one.
  const tolerance = Math.min(2, Math.floor(Math.max(a.length, b.length) / 4));
  return editDistance(a, b) <= tolerance;
};

/**
 * Similarity between an invoice line and a catalogue product, 0 to 1.
 *
 * Weighted towards the invoice's own tokens: a catalogue entry with a long
 * name should not be penalised for containing words the invoice abbreviated
 * away. An exact SKU match short-circuits to 1 — suppliers who print the SKU
 * have already answered the question.
 */
const similarity = (invoiceText, product) => {
  const invoiceTokens = tokenise(invoiceText);
  if (invoiceTokens.length === 0) return 0;

  const nameTokens = tokenise(product.name);
  if (nameTokens.length === 0) return 0;

  // The category helps recognise a line ("SOAP" against a Bath product) but is
  // excluded from the reverse score below: penalising a product because the
  // invoice did not also print its category would push good matches down.
  const searchTokens = [...nameTokens, ...tokenise(product.category || "")];

  let matched = 0;

  for (const token of invoiceTokens) {
    if (searchTokens.some((candidate) => tokensMatch(token, candidate))) {
      matched += 1;
    }
  }

  const coverage = matched / invoiceTokens.length;

  // A bonus when the product's own name is also well covered, so "Colgate"
  // does not score equally against every Colgate product - it should be
  // ambiguous, and the caller needs to be able to see that it is.
  const reverse =
    nameTokens.filter((token) => invoiceTokens.some((t) => tokensMatch(token, t))).length /
    nameTokens.length;

  return Number((coverage * 0.75 + reverse * 0.25).toFixed(4));
};

const CONFIDENT = 0.7;
const UNCERTAIN = 0.45;

/**
 * Match one extracted line against the catalogue.
 *
 * Returns a status rather than a bare product, because the three outcomes need
 * different treatment in the UI:
 *
 *   matched     confident enough to preselect, still confirmed by a human
 *   uncertain   a suggestion, presented as a choice
 *   unmatched   nothing close; the owner picks or skips
 *
 * Nothing here decides to write stock. Every path ends at a human pressing a
 * button, because an OCR mistake that silently changes inventory is far worse
 * than one that shows up in a form.
 */
const matchLine = (line, products) => {
  const description = line.description || "";
  const invoiceSku = normalise(line.sku || "");

  if (invoiceSku) {
    const exact = products.find((product) => normalise(product.sku) === invoiceSku);

    if (exact) {
      return { status: "matched", confidence: 1, product: exact, alternatives: [] };
    }
  }

  const scored = products
    .map((product) => ({ product, score: similarity(description, product) }))
    .filter((entry) => entry.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (scored.length === 0) {
    return { status: "unmatched", confidence: 0, product: null, alternatives: [] };
  }

  const best = scored[0];
  const runnerUp = scored[1];

  // A clear winner needs to be both good and better than the next candidate.
  // Two products scoring 0.8 apiece means the invoice line is ambiguous, and
  // preselecting either would be a coin flip dressed up as a decision.
  const isClear = !runnerUp || best.score - runnerUp.score > 0.12;

  const status =
    best.score >= CONFIDENT && isClear
      ? "matched"
      : best.score >= UNCERTAIN
        ? "uncertain"
        : "unmatched";

  return {
    status,
    confidence: best.score,
    product: status === "unmatched" ? null : best.product,
    alternatives: scored.slice(status === "unmatched" ? 0 : 1).map((entry) => ({
      product: entry.product,
      confidence: entry.score,
    })),
  };
};

/** Match every line, and summarise how much work is left for the human. */
const matchInvoice = (lines, products) => {
  const matched = lines.map((line) => {
    const result = matchLine(line, products);

    return {
      extracted: line,
      status: result.status,
      confidence: result.confidence,
      product: result.product
        ? {
            id: result.product._id,
            name: result.product.name,
            sku: result.product.sku,
            currentStock: result.product.quantity,
            purchasePrice: result.product.purchasePrice,
          }
        : null,
      alternatives: result.alternatives.map((alternative) => ({
        id: alternative.product._id,
        name: alternative.product.name,
        sku: alternative.product.sku,
        confidence: alternative.confidence,
      })),
    };
  });

  return {
    lines: matched,
    summary: {
      total: matched.length,
      matched: matched.filter((line) => line.status === "matched").length,
      uncertain: matched.filter((line) => line.status === "uncertain").length,
      unmatched: matched.filter((line) => line.status === "unmatched").length,
    },
  };
};

module.exports = {
  normalise,
  tokenise,
  editDistance,
  tokensMatch,
  similarity,
  matchLine,
  matchInvoice,
  CONFIDENT,
  UNCERTAIN,
};
