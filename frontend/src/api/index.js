import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

// Create a named axios instance instead of using the default
const api = axios.create({ baseURL: API_URL });

const authHeaders = (token) => ({
  headers: { Authorization: `Bearer ${token}` }
});

// Call this once from AuthContext on mount to wire up the interceptor
export function setupInterceptors(logoutFn) {
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && localStorage.getItem("rl_token")) {
        logoutFn();
      }
      return Promise.reject(error);
    }
  );
}

export const loginUser = async (email, password) => {
  const res = await api.post(`/auth/login`, { email, password });
  return res.data;
};

export const signupUser = async (email, password) => {
  const res = await api.post(`/auth/signup`, { email, password });
  return res.data;
};

export const uploadRecipeImage = async (file, token) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post(`/upload`, formData, authHeaders(token));
  return res.data;
};

export const uploadRecipeImage_toStorage = async (file, token) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/upload-image", formData, authHeaders(token));
  return res.data;
};

export const fetchRecipes = async (token) => {
  const res = await api.get(`/recipes`, authHeaders(token));
  return res.data;
};

export const saveRecipe = async (recipe, token) => {
  const res = await api.post(`/recipes`, recipe, authHeaders(token));
  return res.data;
};

export const updateRecipe = async (id, recipe, token) => {
  const res = await api.put(`/recipes/${id}`, recipe, authHeaders(token));
  return res.data;
};

export const deleteRecipe = async (id, token) => {
  await api.delete(`/recipes/${id}`, authHeaders(token));
};

export const translateRecipe = async (id, language = "Korean", token) => {
  const res = await api.post(
    `/recipes/${id}/translate`,
    { language },
    authHeaders(token)
  );
  return res.data;
};

// Scales ingredient objects { amount, unit, name } that couldn't be scaled client-side.
// Sends only the hard cases (e.g. "juice of 1 lemon") rather than the full list.
export const scaleRecipe = (ingredients, originalServings, targetServings) =>
  api.post("/scale-text", {
    ingredients,
    original_servings: originalServings,
    target_servings: targetServings,
  }).then((res) => res.data);

// Sends unparseable ingredient strings to Gemini for structured parsing.
// Only called for ingredients that couldn't be parsed client-side,
// so API usage is minimized.
export const parseIngredients = (ingredients) =>
  api.post("/parse-ingredients", { ingredients })
    .then((res) => res.data);