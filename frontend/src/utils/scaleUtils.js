// Converts a fraction string like "1/2" to a decimal (0.5)
function parseFraction(str) {
  const parts = str.split("/");
  if (parts.length === 2) {
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  return parseFloat(str);
}

// Converts a decimal back to a readable fraction string if it's a common one,
// otherwise rounds to 2 decimal places and strips trailing zeros.
// e.g. 0.5 → "1/2", 0.333 → "1/3", 1.75 → "1 3/4", 2.5 → "2.5"
function formatNumber(num) {
  const commonFractions = [
    [1/8, "1/8"], [1/4, "1/4"], [1/3, "1/3"], [3/8, "3/8"],
    [1/2, "1/2"], [5/8, "5/8"], [2/3, "2/3"], [3/4, "3/4"], [7/8, "7/8"],
  ];

  const whole = Math.floor(num);
  const remainder = num - whole;

  if (remainder < 0.01) return String(whole);

  // Check if the remainder is close to a common fraction
  for (const [decimal, display] of commonFractions) {
    if (Math.abs(remainder - decimal) < 0.05) {
      return whole > 0 ? `${whole} ${display}` : display;
    }
  }

  // Fall back to decimal
  return parseFloat(num.toFixed(2)).toString();
}

// Regex that matches an optional mixed number or fraction at the start of a string.
// Examples it matches: "2", "1/2", "1 1/2", "2.5"
// Captures the number part so we can scale it and preserve the rest of the string.
const QUANTITY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)\s*/;

// Tries to scale a single ingredient string by the given ratio.
// Returns the scaled string if successful, or null if it couldn't parse a quantity.
export function tryScaleIngredient(ingredient, ratio) {
  const match = ingredient.match(QUANTITY_RE);
  if (!match) return null; // No leading number found — give up and let Gemini handle it

  const rawNumber = match[1].trim();
  let quantity;

  // Handle mixed numbers like "1 1/2"
  if (/^\d+\s+\d+\/\d+$/.test(rawNumber)) {
    const [whole, frac] = rawNumber.split(/\s+/);
    quantity = parseFloat(whole) + parseFraction(frac);
  } else {
    quantity = parseFraction(rawNumber);
  }

  const scaled = quantity * ratio;
  const formatted = formatNumber(scaled);

  // Replace just the quantity at the start, keep the rest of the string intact
  return ingredient.replace(match[0], formatted + " ");
}

// Tries to scale all ingredients client-side.
// Returns { scaled: [...], needsGemini: [...indices] }
// where needsGemini contains the indices of any ingredients that couldn't be parsed.
export function tryScaleAll(ingredients, ratio) {
  const scaled = [];
  const needsGemini = [];

  for (let i = 0; i < ingredients.length; i++) {
    const result = tryScaleIngredient(ingredients[i], ratio);
    if (result !== null) {
      scaled.push(result);
    } else {
      // Keep original for now; caller will replace with Gemini result
      scaled.push(ingredients[i]);
      needsGemini.push(i);
    }
  }

  return { scaled, needsGemini };
}