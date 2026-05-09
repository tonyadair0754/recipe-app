import axios from "axios";

const BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const authHeaders = (token) => ({
  headers: { Authorization: `Bearer ${token}` }
});

export const loginUser = async (email, password) => {
  const res = await axios.post(`${BASE}/auth/login`, { email, password });
  return res.data;
};

export const signupUser = async (email, password) => {
  const res = await axios.post(`${BASE}/auth/signup`, { email, password });
  return res.data;
};

export const uploadRecipeImage = async (file, token) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await axios.post(`${BASE}/upload`, formData, authHeaders(token));
  return res.data;
};

export const fetchRecipes = async (token) => {
  const res = await axios.get(`${BASE}/recipes`, authHeaders(token));
  return res.data;
};

export const saveRecipe = async (recipe, token) => {
  const res = await axios.post(`${BASE}/recipes`, recipe, authHeaders(token));
  return res.data;
};

export const updateRecipe = async (id, recipe, token) => {
  const res = await axios.put(`${BASE}/recipes/${id}`, recipe, authHeaders(token));
  return res.data;
};

export const deleteRecipe = async (id, token) => {
  await axios.delete(`${BASE}/recipes/${id}`, authHeaders(token));
};

export const translateRecipe = async (id, language = "Korean", token) => {
  const res = await axios.post(
    `${BASE}/recipes/${id}/translate`,
    { language },
    authHeaders(token)
  );
  return res.data;
};