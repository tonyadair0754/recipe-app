import { tryParseIngredient, formatIngredient } from "./parseUtils";

// Tries to scale a single structured ingredient by the given ratio.
// Accepts a raw string, parses it, scales the amount, and returns a formatted string.
// Returns null if the ingredient couldn't be parsed (caller should send to Gemini).
export function tryScaleIngredient(ingredient, ratio) {
  const parsed = tryParseIngredient(ingredient);

  // If we couldn't parse it, signal to the caller to use Gemini
  if (parsed === null) return null;

  // If there's no amount (e.g. "salt to taste"), there's nothing to scale
  if (parsed.amount === null) return ingredient;

  return formatIngredient({ ...parsed, amount: parsed.amount * ratio });
}

// Tries to scale all ingredients client-side.
// Returns { scaled: [...], needsGemini: [...indices] }
// where needsGemini contains the indices of ingredients that couldn't be parsed.
export function tryScaleAll(ingredients, ratio) {
  const scaled = [];
  const needsGemini = [];

  for (let i = 0; i < ingredients.length; i++) {
    const result = tryScaleIngredient(ingredients[i], ratio);
    if (result !== null) {
      scaled.push(result);
    } else {
      // Keep the original for now; the caller will splice in Gemini's result
      scaled.push(ingredients[i]);
      needsGemini.push(i);
    }
  }

  return { scaled, needsGemini };
}