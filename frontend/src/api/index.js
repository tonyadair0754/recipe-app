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

// Asks the backend to scale the ingredient quantities for a different serving count
export const scaleRecipe = (recipeId, servings, originalServings, token) =>
  api.post(
    `/recipes/${recipeId}/scale`,
    { servings, original_servings: originalServings },
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((res) => res.data);