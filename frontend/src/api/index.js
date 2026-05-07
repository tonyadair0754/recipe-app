// This file centralizes every backend call

import axios from "axios";

const BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

export const uploadRecipeImage = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await axios.post(`${BASE}/upload`, formData);
  return res.data;
};

export const fetchRecipes = async () => {
  const res = await axios.get(`${BASE}/recipes`);
  return res.data;
};

export const saveRecipe = async (recipe) => {
  const res = await axios.post(`${BASE}/recipes`, recipe);
  return res.data;
};

export const updateRecipe = async (id, recipe) => {
  const res = await axios.put(`${BASE}/recipes/${id}`, recipe);
  return res.data;
};

export const deleteRecipe = async (id) => {
  await axios.delete(`${BASE}/recipes/${id}`);
};

export const translateRecipe = async (id, language = "Korean") => {
  const res = await axios.post(`${BASE}/recipes/${id}/translate`, { language });
  return res.data;
};