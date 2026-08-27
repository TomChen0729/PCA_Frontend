// src/api.ts
const BASE_URL = '/api';

const getAuthHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('pca_jwt_token')}`
});

export const api = {
  // ─── 會員系統 ───
  // 登入
  login: async (account:string, password:string) => {
    const res = await fetch(`${BASE_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password })
    });
    return res.json();
  },

  // 登出
  logout: async () => {
    const res = await fetch(`${BASE_URL}/user/logout`, { // ⚠️ 這裡替換成你實際的後端登出路由
      method: 'POST', // 根據你的後端設定，可能是 POST 或 GET
      headers: getAuthHeaders()
    });
    return res.json();
  },
  // 註冊
  register: async (username:string, mail:string, password:string) => {
    const res = await fetch(`${BASE_URL}/user/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, mail, password })
    });
    return res.json();
  },

  // ─── 衣櫥系統 ───
  getWardrobe: async () => {
    const res = await fetch(`${BASE_URL}/wardrobe/get-items`, { // 或改為你後端實際的讀取路由
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      body: JSON.stringify({})
    });
    return res.json();
  },

  addWardrobeItem: async (file: File, tag: string) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('tag', tag);

    const res = await fetch(`${BASE_URL}/wardrobe/add-item`, {
      method: 'POST',
      headers: getAuthHeaders(), // FormData 不需要設定 Content-Type
      body: formData
    });
    return res.json();
  },

  dropWardrobeItem: async (clothesId: number) => {
    const res = await fetch(`${BASE_URL}/wardrobe/drop-item`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      body: JSON.stringify({ clothes_id: clothesId })
    });
    return res.json();
  },

  // ─── 個人色彩分析系統-分析 ───
  analyzePersonalColor: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    
    const res = await fetch(`${BASE_URL}/personal-color/analyze`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${localStorage.getItem('pca_jwt_token')}` 
      },
      body: formData // FormData 不需要手動設定 Content-Type
    });
    return res.json();
  },
  
  // ─── 個人色彩分析系統-歷史紀錄 ───
  getAnalyses: async () => {
    const res = await fetch(`${BASE_URL}/personal-color/history`, {
      method: 'GET', // 注意這裡是 GET
      headers: getAuthHeaders()
    });
    return res.json();
  },
  // ─── 個人色彩分析系統-刪除紀錄 ───
  deleteAnalysis: async (analysisId: number) => {
    const res = await fetch(`${BASE_URL}/personal-color/delete-record`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...getAuthHeaders() 
      },
      body: JSON.stringify({ analysis_id: analysisId })
    });
    return res.json();
  },

  // ─── 配色建議系統 ───
  getColorMatches: async (
    color: string,
    direction:
      | "main_to_sub"
      | "sub_to_main"
        = "main_to_sub"
  ) => {
    const params = new URLSearchParams({
      color,
      direction,
    });

    const res = await fetch(
      `${BASE_URL}/color-recommendations/matches?${params.toString()}`,
      {
        method: "GET",
        headers: getAuthHeaders(),
      }
    );

    return res.json();
  },
};