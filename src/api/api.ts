// src/api.ts
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const ASSET_BASE_URL = import.meta.env.VITE_ASSET_BASE_URL || '';

export function resolveAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return ASSET_BASE_URL ? new URL(normalizedPath, ASSET_BASE_URL).toString() : normalizedPath;
}

class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
    if (['token_expired', 'invalid_token', 'missing_token'].includes(code || '') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('pca:session-expired'));
    }
  }
}

export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof ApiError && ['token_expired', 'invalid_token', 'missing_token'].includes(error.code || '');
}

async function readResponse(res: Response) {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    throw new ApiError(payload.message || `API 請求失敗 (${res.status})`, res.status, payload.code);
  }
  return payload;
}

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
    const res = await fetch(`${BASE_URL}/user/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return readResponse(res);
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
    return readResponse(res);
  },

  previewWardrobeItem: async (file: File, tag: string) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('tag', tag);
    const res = await fetch(`${BASE_URL}/wardrobe/preview-item`, {
      method: 'POST', headers: getAuthHeaders(), body: formData,
    });
    return readResponse(res);
  },

  addWardrobeItem: async (file: File, tag: string, segmented = false) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('tag', tag);
    if (segmented) formData.append('segmented', 'true');

    const res = await fetch(`${BASE_URL}/wardrobe/add-item`, {
      method: 'POST',
      headers: getAuthHeaders(), // FormData 不需要設定 Content-Type
      body: formData
    });
    return readResponse(res);
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
    return readResponse(res);
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
    return readResponse(res);
  },
  
  // ─── 個人色彩分析系統-歷史紀錄 ───
  getAnalyses: async () => {
    const res = await fetch(`${BASE_URL}/personal-color/history`, {
      method: 'GET', // 注意這裡是 GET
      headers: getAuthHeaders()
    });
    return readResponse(res);
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
    return readResponse(res);
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

    return readResponse(res);
  },

  // ─── AI 虛擬試穿系統 ───
  generateTryOn: async (
    humanImage: string | File | null,
    garmentImgPath: string,
    category: string,
    humanResultId?: string,
  ) => {
    const formData = new FormData();
    formData.append('category', category);
    formData.append('garment_img_path', garmentImgPath);
    if (humanResultId) {
      formData.append('human_result_id', humanResultId);
    } else if (humanImage instanceof File) {
      formData.append('human_image', humanImage);
    } else if (humanImage) {
      formData.append('human_img_path', humanImage);
    } else {
      throw new Error('請提供人物照片或前一階段的試穿結果');
    }

    const res = await fetch(`${BASE_URL}/vton/tryon`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
    return readResponse(res);
  },

  getTryOnResult: async (resultId: string) => {
    const res = await fetch(`${BASE_URL}/vton/results/${encodeURIComponent(resultId)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new ApiError(payload.message || `讀取試穿結果失敗 (${res.status})`, res.status, payload.code);
    }
    return URL.createObjectURL(await res.blob());
  },

  createTryOnJob: async (humanImage: File, topItemId: number, bottomItemId: number) => {
    const form = new FormData();
    form.append('human_image', humanImage);
    form.append('top_item_id', String(topItemId));
    form.append('bottom_item_id', String(bottomItemId));
    const res = await fetch(`${BASE_URL}/outfits/tryon-jobs`, { method: 'POST', headers: getAuthHeaders(), body: form });
    return readResponse(res);
  },
  getTryOnJob: async (jobId: string) => {
    const res = await fetch(`${BASE_URL}/outfits/tryon-jobs/${encodeURIComponent(jobId)}`, { headers: getAuthHeaders() });
    return readResponse(res);
  },
  retryTryOnJob: async (jobId: string) => {
    const res = await fetch(`${BASE_URL}/outfits/tryon-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST', headers: getAuthHeaders() });
    return readResponse(res);
  },
  addFavoriteOutfit: async (topItemId: number, bottomItemId: number) => {
    const res = await fetch(`${BASE_URL}/outfits/favorites`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ top_item_id: topItemId, bottom_item_id: bottomItemId }) });
    return readResponse(res);
  },
  getOutfitFavorites: async () => readResponse(await fetch(`${BASE_URL}/outfits/favorites`, { headers: getAuthHeaders() })),
  deleteFavoriteOutfit: async (id: number) => readResponse(await fetch(`${BASE_URL}/outfits/favorites/${id}`, { method: 'DELETE', headers: getAuthHeaders() })),
  getTryOnHistory: async () => readResponse(await fetch(`${BASE_URL}/outfits/history`, { headers: getAuthHeaders() })),
  getWishlist: async () => readResponse(await fetch(`${BASE_URL}/outfits/wishlist`, { headers: getAuthHeaders() })),
  addWishlistItem: async (category: 'top' | 'bottom', color: string, basedOnColor?: string) => readResponse(await fetch(`${BASE_URL}/outfits/wishlist`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ category, color, based_on_color: basedOnColor }) })),
  updateWishlistItem: async (id: number, isCompleted: boolean) => readResponse(await fetch(`${BASE_URL}/outfits/wishlist/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify({ is_completed: isCompleted }) })),
  deleteWishlistItem: async (id: number) => readResponse(await fetch(`${BASE_URL}/outfits/wishlist/${id}`, { method: 'DELETE', headers: getAuthHeaders() })),
};
