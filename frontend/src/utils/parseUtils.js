// A structured ingredient has three fields:
// - amount: a number (or null if there's no quantity, e.g. "salt to taste")
// - unit: a string like "cup", "tsp", "g" (or null if there's no unit, e.g. "2 eggs")
// - name: the ingredient name, e.g. "flour", "eggs", "salt"
//
// Examples:
// "2 cups flour"       → { amount: 2, unit: "cup", name: "flour" }
// "1/2 tsp salt"       → { amount: 0.5, unit: "tsp", name: "salt" }
// "1 1/2 cups milk"    → { amount: 1.5, unit: "cup", name: "milk" }
// "2 eggs"             → { amount: 2, unit: null, name: "eggs" }
// "salt to taste"      → { amount: null, unit: null, name: "salt to taste" }
// "juice of 1 lemon"   → null (can't parse — needs Gemini)

// Canonical unit names — we normalize variations to these
// so "cups", "Cup", "CUPS" all become "cup"
// Maps Unicode vulgar fraction characters to their ASCII equivalents.
// These appear in recipe text copied from websites or typed on mobile keyboards.

const UNIT_MAP = {
  // Volume
  cup: "cup", cups: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp", tb: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
  fluid: null, // "fluid ounce" handled below
  fl: null,
  ounce: "oz", ounces: "oz", oz: "oz",
  pint: "pint", pints: "pint", pt: "pint",
  quart: "quart", quarts: "quart", qt: "quart",
  gallon: "gallon", gallons: "gallon", gal: "gallon",
  liter: "l", litre: "l", liters: "l", litres: "l", l: "l",
  milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml", ml: "ml",

  // Weight
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",

  // Loose
  pinch: "pinch", pinches: "pinch",
  dash: "dash", dashes: "dash",
  handful: "handful", handfuls: "handful",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  package: "package", packages: "package", pkg: "package",
  stick: "stick", sticks: "stick",
};

// These appear in recipe text copied from websites or typed on mobile keyboards.
const UNICODE_FRACTIONS = {
  "½": "1/2", "¼": "1/4", "¾": "3/4",
  "⅓": "1/3", "⅔": "2/3",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Matches a leading quantity: "2", "1/2", "1 1/2", "2.5"
const QUANTITY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)\s*/;

// Converts a fraction string like "1/2" to a decimal
function parseFraction(str) {
  const parts = str.split("/");
  if (parts.length === 2) return parseFloat(parts[0]) / parseFloat(parts[1]);
  return parseFloat(str);
}

// Parses a raw quantity string (possibly a mixed number) into a float
function parseQuantity(raw) {
  const trimmed = raw.trim();
  if (/^\d+\s+\d+\/\d+$/.test(trimmed)) {
    const [whole, frac] = trimmed.split(/\s+/);
    return parseFloat(whole) + parseFraction(frac);
  }
  return parseFraction(trimmed);
}

// Tries to parse an ingredient string into { amount, unit, name }.
// Returns null if the string is too ambiguous for client-side parsing
// (caller should send those to Gemini instead).
export function tryParseIngredient(ingredient) {
  // Normalize Unicode fraction characters to ASCII before parsing
  let str = ingredient.trim();
  for (const [unicode, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    str = str.replaceAll(unicode, ascii);
  }

  // Step 1: try to extract a leading quantity
  const quantityMatch = str.match(QUANTITY_RE);
  let amount = null;
  let rest = str;

  if (quantityMatch) {
    amount = parseQuantity(quantityMatch[1]);
    rest = str.slice(quantityMatch[0].length).trim();
  }

  // Step 2: try to match a unit at the start of what's left
  // We only look at the first word (or two, for "fluid ounce")
  const words = rest.split(/\s+/);
  const firstWord = words[0]?.toLowerCase();
  const firstTwo = words.slice(0, 2).join(" ").toLowerCase();

  let unit = null;
  let nameWords = words;

  // Check two-word units first ("fluid ounce")
  if (firstTwo === "fluid ounce" || firstTwo === "fluid ounces" || firstTwo === "fl oz") {
    unit = "fl oz";
    nameWords = words.slice(2);
  } else if (firstWord && UNIT_MAP[firstWord] !== undefined && UNIT_MAP[firstWord] !== null) {
    unit = UNIT_MAP[firstWord];
    nameWords = words.slice(1);
  }

  const name = nameWords.join(" ").trim();

  // Step 3: decide if the result is trustworthy enough to return
  // If there's no name at all, we couldn't parse it meaningfully
  if (!name) return null;

  // If there was no quantity and no unit, the whole string is the name —
  // that's valid for things like "salt to taste"
  return { amount, unit, name };
}

// Formats a structured ingredient back into a readable string for display.
// { amount: 1.5, unit: "cup", name: "flour" } → "1 1/2 cups flour"
export function formatIngredient({ amount, unit, name }) {
  const parts = [];
  if (amount !== null) parts.push(formatNumber(amount));
  if (unit !== null) parts.push(pluralizeUnit(unit, amount));
  parts.push(name);
  return parts.join(" ");
}

// Pluralizes a unit based on the amount
function pluralizeUnit(unit, amount) {
  if (amount === null || amount <= 1) return unit;
  const plurals = {
    cup: "cups", tbsp: "tbsp", tsp: "tsp", oz: "oz",
    pint: "pints", quart: "quarts", gallon: "gallons",
    l: "l", ml: "ml", g: "g", kg: "kg", lb: "lbs",
    pinch: "pinches", dash: "dashes", handful: "handfuls",
    slice: "slices", piece: "pieces", clove: "cloves",
    can: "cans", package: "packages", stick: "sticks",
    "fl oz": "fl oz",
  };
  return plurals[unit] || unit;
}

// Converts a decimal to a readable number, preferring common fractions
function formatNumber(num) {
  const commonFractions = [
    [1/8, "1/8"], [1/4, "1/4"], [1/3, "1/3"], [3/8, "3/8"],
    [1/2, "1/2"], [5/8, "5/8"], [2/3, "2/3"], [3/4, "3/4"], [7/8, "7/8"],
  ];
  const whole = Math.floor(num);
  const remainder = num - whole;
  if (remainder < 0.01) return String(whole);
  for (const [decimal, display] of commonFractions) {
    if (Math.abs(remainder - decimal) < 0.05) {
      return whole > 0 ? `${whole} ${display}` : display;
    }
  }
  return parseFloat(num.toFixed(2)).toString();
}