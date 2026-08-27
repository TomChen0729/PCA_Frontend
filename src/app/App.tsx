import { api } from "../api/api"; // 引入 API 模組
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react"; // 動畫庫
import {
  // Lucide React 圖標庫
  ArrowLeft, Sparkles, ShoppingBag, Palette,
  User, X, Eye, EyeOff, Plus, ChevronRight,
  Camera, Trash2, CheckCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
// TypeScript 類型定義區

/**
 * Screen - 畫面類型
 * 定義應用中所有可能的畫面狀態
 */
type Screen = "auth" | "home" | "color-analysis" | "wardrobe" | "color-suggestion";

/**
 * UserAccount - 使用者帳號
 * 儲存登入使用者的基本資訊
 */
interface UserAccount {
  name: string;   // 使用者姓名
  email: string;  // 電子郵件
}

/**
 * ColorAnalysis - 色彩分析記錄
 * 儲存每次個人色彩分析的結果
 */
interface ColorAnalysis {
  id: number;           // 唯一識別碼
  date: string;         // 分析日期 (YYYY-MM-DD)
  imageUrl: string;     // 上傳的照片 URL (blob URL 或遠端 URL)
  season: string;       // 季節色型 (例如：秋季暖色型)
  type: string;         // 具體類型 (例如：深秋型)
  colors: string[];     // 適合的色彩列表 (HEX 格式)
  description: string;  // 分析結果描述
}

/**
 * WardrobeItem - 衣櫥單品
 * 儲存使用者上傳的衣物資訊
 */
interface WardrobeItem {
  id: number;                 // 唯一識別碼
  date: string;               // 上傳日期 (YYYY-MM-DD)
  imageUrl: string;           // 衣物照片 URL
  category: "top" | "bottom"; // 類別：上衣或下著
  dominantColor: string;      // 主要顏色 (HEX 格式，由系統模擬產生)
}

// ─── Color palette generation ────────────────────────────────────────────────
// 配色方案生成工具函數

/**
 * hexToRgb - 將 HEX 顏色轉換為 RGB
 * @param hex - HEX 顏色字串 (例如：#C4856A)
 * @returns RGB 值的陣列 [r, g, b]
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
}

/**
 * rgbToHex - 將 RGB 顏色轉換為 HEX
 * @param r - 紅色值 (0-255)
 * @param g - 綠色值 (0-255)
 * @param b - 藍色值 (0-255)
 * @returns HEX 顏色字串 (例如：#C4856A)
 */
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

/**
 * colorDistance - 計算兩個顏色之間的距離
 * @param hex1 - 第一個顏色 (HEX)
 * @param hex2 - 第二個顏色 (HEX)
 * @returns 顏色距離值 (0-441，值越小越相似)
 *
 * 使用歐氏距離公式計算 RGB 空間中的距離
 */
function colorDistance(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return Math.sqrt(Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2));
}

/**
 * isColorMatch - 判斷顏色是否匹配配色方案
 * @param itemColor - 要檢查的顏色 (HEX)
 * @param paletteColors - 配色方案的顏色陣列
 * @param threshold - 相似度閾值 (預設 80，值越小要求越嚴格)
 * @returns 是否匹配
 *
 * 用於「配色建議」功能，判斷衣櫥中的單品顏色
 * 是否與個人色彩分析結果匹配
 */
function isColorMatch(itemColor: string, paletteColors: string[], threshold: number = 80): boolean {
  return paletteColors.some(c => colorDistance(itemColor, c) < threshold);
}

// ─── Shared transition ────────────────────────────────────────────────────────
// 共用的畫面轉場動畫設定

/**
 * slide - 畫面切換的滑動動畫
 * 用於所有畫面之間的轉場效果
 *
 * - initial: 從右側進入 (x: 100%)
 * - animate: 移動到中央 (x: 0)
 * - exit: 向左側退出 (x: -28%)
 * - 使用彈簧動畫 (spring) 以獲得自然的緩動效果
 */
const slide = {
  initial: { x: "100%", opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: "-28%", opacity: 0 },
  transition: { type: "spring" as const, stiffness: 300, damping: 30 },
};

// ─── Auth Screen ──────────────────────────────────────────────────────────────
// 登入/註冊畫面

/**
 * AuthScreen - 登入/註冊畫面組件
 *
 * 【功能】
 * - 使用者可以在登入和註冊模式之間切換
 * - 登入模式：只需要姓名和密碼
 * - 註冊模式：需要姓名、電子郵件和密碼
 * - 包含表單驗證和錯誤提示
 *
 * 【Props】
 * @param onLogin - 登入成功時的回調函數，傳遞使用者資料
 *
 * 【畫面流程】
 * AuthScreen → (登入成功) → HomeScreen
 *
 * 【狀態管理】
 * - mode: 當前模式 (login | register)
 * - name, email, password: 表單欄位
 * - showPw: 是否顯示密碼
 * - error: 錯誤訊息
 */
function AuthScreen({ onLogin }: { onLogin: (user: UserAccount) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  
  // 🆕 將狀態細分為登入與註冊不同欄位
  const [loginId, setLoginId] = useState(""); // 登入用：帳號或信箱
  const [account, setAccount] = useState(""); // 註冊用：帳號
  const [email, setEmail] = useState("");     // 註冊用：信箱
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // 🆕 針對不同模式進行表單驗證
    if (mode === "login") {
      if (!loginId.trim()) {
        setError("請輸入帳號或電子郵件");
        return;
      }
    } else {
      if (!account.trim()) {
        setError("請輸入帳號");
        return;
      }
      if (!email.trim()) {
        setError("請輸入電子郵件");
        return;
      }
    }

    if (password.length < 4) {
      setError("密碼至少 4 位");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("兩次密碼輸入不一致");
      return;
    }

    try {
      if (mode === "login") {
        // 呼叫登入 API：傳入 loginId (帳號或信箱皆可)
        const data = await api.login(loginId.trim(), password);
        console.log('Login data:', data); 
        if (data.success) {
          localStorage.setItem('pca_jwt_token', data.token); // 儲存 Token
          // 取得後端回傳的 username，若無則預設為輸入的 loginId
          onLogin({ name: data.user?.username || loginId.trim(), email: data.user?.email || "" });
        } else {
          setError(data.message || "登入失敗，請檢查帳號密碼");
        }
      } else {
        // 呼叫註冊 API：傳入新設定的帳號與信箱
        const data = await api.register(account.trim(), email.trim(), password);
        if (data.success) {
          setMode("login"); // 註冊成功切換到登入
          setLoginId(account.trim()); // 貼心地幫用戶自動填入剛註冊的帳號
          setPassword(""); // 清空密碼讓用戶重填確保安全
          setError("註冊成功，請登入！");
        } else {
          setError(data.message || "註冊失敗，帳號或信箱可能已被使用");
        }
      }
    } catch (err) {
      setError("伺服器連線失敗");
    }
  }

  return (
    <div className="flex flex-col justify-center h-full bg-background px-6">
      {/* Hero section */}
      <div className="flex flex-col items-center pb-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}>
            <Sparkles size={30} color="#FDFAF6" strokeWidth={1.5} />
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-3xl text-center leading-tight text-foreground mb-2"
            style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400 }}>
            Color &amp; Style
          </h1>
          <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground"
            style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>
            你的專屬色彩顧問
          </p>
        </motion.div>
      </div>

      {/* System description */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="pb-5"
      >
        <div className="rounded-xl p-4 text-center"
          style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}
        >
          <p className="text-sm leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
            透過 AI 分析找到最適合你的色彩，輕鬆管理衣櫥單品，並獲得專業的穿搭配色建議。
          </p>
        </div>
      </motion.div>

      {/* Auth form */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
      >
        <div className="rounded-2xl p-5 shadow-lg"
          style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.1)" }}>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: "#EDE4D8" }}>
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className="flex-1 rounded-lg py-2 transition-all"
              style={{
                background: mode === "login" ? "#FDFAF6" : "transparent",
                boxShadow: mode === "login" ? "0 2px 4px rgba(44,24,16,0.1)" : "none",
              }}
            >
              <span className="text-sm" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: mode === "login" ? 500 : 400,
                color: mode === "login" ? "#2C1810" : "#8A6F5E",
              }}>
                登入
              </span>
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className="flex-1 rounded-lg py-2 transition-all"
              style={{
                background: mode === "register" ? "#FDFAF6" : "transparent",
                boxShadow: mode === "register" ? "0 2px 4px rgba(44,24,16,0.1)" : "none",
              }}
            >
              <span className="text-sm" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: mode === "register" ? 500 : 400,
                color: mode === "register" ? "#2C1810" : "#8A6F5E",
              }}>
                註冊
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            
            {/* 🆕 根據模式渲染不同的輸入框 */}
            {mode === "login" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  帳號或電子郵件
                </label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="請輸入帳號或信箱"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: "#EDE4D8", color: "#2C1810", fontFamily: "'DM Sans', sans-serif", border: "1px solid transparent" }}
                  onFocus={(e) => (e.target.style.border = "1px solid #B87355")}
                  onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                    設定帳號
                  </label>
                  <input
                    type="text"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder="請設定登入帳號"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: "#EDE4D8", color: "#2C1810", fontFamily: "'DM Sans', sans-serif", border: "1px solid transparent" }}
                    onFocus={(e) => (e.target.style.border = "1px solid #B87355")}
                    onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                    電子郵件
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="請輸入電子郵件"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: "#EDE4D8", color: "#2C1810", fontFamily: "'DM Sans', sans-serif", border: "1px solid transparent" }}
                    onFocus={(e) => (e.target.style.border = "1px solid #B87355")}
                    onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                  />
                </div>
              </>
            )}

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                密碼
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼（至少 4 位）"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none pr-11"
                  style={{ background: "#EDE4D8", color: "#2C1810", fontFamily: "'DM Sans', sans-serif", border: "1px solid transparent" }}
                  onFocus={(e) => (e.target.style.border = "1px solid #B87355")}
                  onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPw ? <EyeOff size={16} color="#8A6F5E" strokeWidth={1.5} /> : <Eye size={16} color="#8A6F5E" strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {/* Confirm password (register only) */}
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs tracking-wider uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  確認密碼
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次輸入密碼"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none pr-11"
                    style={{ background: "#EDE4D8", color: "#2C1810", fontFamily: "'DM Sans', sans-serif", border: "1px solid transparent" }}
                    onFocus={(e) => (e.target.style.border = "1px solid #B87355")}
                    onBlur={(e) => (e.target.style.border = "1px solid transparent")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showConfirmPw ? <EyeOff size={16} color="#8A6F5E" strokeWidth={1.5} /> : <Eye size={16} color="#8A6F5E" strokeWidth={1.5} />}
                  </button>
                </div>
              </div>
            )}

            {/* 🆕 成功訊息顯示綠色，錯誤訊息顯示紅色 */}
            {error && (
              <p className="text-xs" style={{ color: error.includes("成功") ? "#2e7d32" : "#d4183d", fontFamily: "'DM Sans', sans-serif" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl py-3 mt-1 active:opacity-80 transition-opacity"
              style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}
            >
              <span className="text-sm tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: "#FDFAF6" }}>
                {mode === "login" ? "登入" : "註冊"}
              </span>
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Add Analysis Modal ───────────────────────────────────────────────────────
// 新增色彩分析彈窗

/**
 * AddAnalysisModal - 新增色彩分析的彈窗組件
 *
 * 【功能】
 * 1. 選擇照片 (pick)
 * 2. 模擬 AI 分析過程 (analyzing)
 * 3. 顯示分析完成 (done)
 *
 * 【流程】
 * pick → analyzing (進度條動畫) → done → 自動關閉並回傳結果
 *
 * 【Props】
 * @param open - 是否顯示彈窗
 * @param onClose - 關閉彈窗的回調
 * @param onComplete - 分析完成時的回調，傳遞 ColorAnalysis 物件
 *
 * 【特色】
 * - 使用不規則進度條模擬真實的 AI 分析過程
 * - 顯示分析步驟：膚色偵測 → 色調分類 → 配色生成
 * - 隨機選擇預設的色彩分析結果
 */
type AddStep = "pick" | "analyzing" | "done";

function AddAnalysisModal({ open, onClose, onComplete }: {
  open: boolean;
  onClose: () => void;
  onComplete: (analysis: ColorAnalysis) => void;
}) {
  const [step, setStep] = useState<AddStep>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) { setStep("pick"); setPreview(null); setProgress(0); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  // 於 AddAnalysisModal 組件內部
const startAnalysis = useCallback(async () => {
  if (!fileRef.current?.files?.[0]) return;
  const file = fileRef.current.files[0];

  setStep("analyzing");
  setProgress(0);

  // 視覺進度條：讓進度跑到 90% 營造努力分析中的感覺，並等待後端 API 回應
  let p = 0;
  intervalRef.current = setInterval(() => {
    p = Math.min(p + (Math.random() * 10 + 2), 90);
    setProgress(Math.round(p));
  }, 200);

  try {
    // 呼叫後端 API
    const response = await api.analyzePersonalColor(file);

    clearInterval(intervalRef.current!);
    setProgress(100); // 取得結果後，直接拉滿到 100%

    if (response.success) {
      setStep("done");
      const backendData = response.data;
      
      setTimeout(() => {
        // 將後端的資料結構 Mapping 到前端定義的 ColorAnalysis 介面
        const newAnalysis: ColorAnalysis = {
          id: backendData.analysis_id, // 從資料庫取得的 ID
          date: new Date().toISOString().slice(0, 10),
          imageUrl: `http://127.0.0.1:5001${backendData.image_url}`, // 組合完整圖片網址
          season: backendData.season_zh, // 例如：秋季
          type: backendData.label_12_zh, // 例如：暖秋型
          colors: [
            // 取出後端特徵萃取的代表色作為色票
            backendData.representative_colors.skin || "#FFFFFF",
            backendData.representative_colors.lip || "#FFFFFF",
            backendData.representative_colors.hair || "#FFFFFF",
            backendData.representative_colors.iris || "#FFFFFF",
          ],
          description: "根據您的臉部特徵，系統分析出了最適合您的專屬色彩！",
        };
        onComplete(newAnalysis);
        onClose();
      }, 900);
    } else {
      alert("分析失敗：" + (response.message || "未知錯誤"));
      onClose();
    }
  } catch (error) {
    clearInterval(intervalRef.current!);
    alert("伺服器連線失敗");
    onClose();
  }
}, [preview, onComplete, onClose]);

  const progressColor = "linear-gradient(90deg, #C4856A 0%, #8B3A52 100%)";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="absolute inset-0 z-20"
            style={{ background: "rgba(44,24,16,0.5)", backdropFilter: "blur(3px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={step === "pick" ? onClose : undefined} />

          <motion.div key="sh" className="absolute bottom-0 left-0 right-0 z-30 rounded-t-3xl overflow-hidden"
            style={{ background: "#FDFAF6" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}>

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(44,24,16,0.15)" }} />
            </div>

            <div className="px-6 pb-10 pt-3">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400, color: "#2C1810" }}>
                    {step === "pick" && "新增色彩分析"}
                    {step === "analyzing" && "分析中…"}
                    {step === "done" && "分析完成"}
                  </h2>
                  <p className="text-xs tracking-widest uppercase mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#B87355" }}>
                    {step === "pick" && "New Color Analysis"}
                    {step === "analyzing" && "Analyzing your photo"}
                    {step === "done" && "Analysis Complete"}
                  </p>
                </div>
                {step === "pick" && (
                  <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(44,24,16,0.07)" }}>
                    <X size={15} color="#8A6F5E" strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* ── Step: Pick ── */}
              {step === "pick" && (
                <div className="flex flex-col gap-5">
                  {/* Photo picker area */}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl flex flex-col items-center justify-center transition-opacity active:opacity-70 overflow-hidden"
                    style={{
                      height: 200,
                      background: preview ? "transparent" : "#EDE4D8",
                      border: preview ? "none" : "1.5px dashed rgba(44,24,16,0.2)",
                    }}
                  >
                    {preview ? (
                      <img src={preview} alt="preview" className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(184,115,85,0.12)" }}>
                          <Camera size={26} color="#B87355" strokeWidth={1.4} />
                        </div>
                        <p className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
                          點此選擇照片
                        </p>
                        <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>
                          支援 JPG、PNG、HEIC
                        </p>
                      </div>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                  {preview && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                        className="flex-1 rounded-xl py-3 flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                        style={{ background: "rgba(44,24,16,0.07)" }}
                      >
                        <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>重新選擇</span>
                      </button>
                      <button
                        onClick={startAnalysis}
                        className="flex-1 rounded-xl py-3 flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                        style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}
                      >
                        <Sparkles size={15} color="#FDFAF6" strokeWidth={1.5} />
                        <span className="text-sm tracking-wide" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: "#FDFAF6" }}>開始分析</span>
                      </button>
                    </div>
                  )}

                  {!preview && (
                    <button
                      onClick={onClose}
                      className="w-full rounded-xl py-3 active:opacity-70 transition-opacity"
                      style={{ background: "rgba(44,24,16,0.06)" }}
                    >
                      <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>取消</span>
                    </button>
                  )}
                </div>
              )}

              {/* ── Step: Analyzing ── */}
              {(step === "analyzing" || step === "done") && (
                <div className="flex flex-col items-center gap-6 py-4">
                  {/* Photo thumbnail */}
                  {preview && (
                    <div className="w-24 h-30 rounded-2xl overflow-hidden shadow-md" style={{ height: 112 }}>
                      <img src={preview} alt="analyzing" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {step === "analyzing" ? (
                    <div className="w-full flex flex-col gap-3">
                      {/* Progress bar */}
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "#EDE4D8" }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: progressColor }}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex justify-between">
                        <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
                          正在偵測膚色與色調…
                        </p>
                        <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355" }}>
                          {progress}%
                        </p>
                      </div>

                      {/* Animated steps */}
                      <div className="flex flex-col gap-2 mt-2">
                        {[
                          { label: "膚色偵測", threshold: 30 },
                          { label: "色調分類", threshold: 60 },
                          { label: "配色生成", threshold: 90 },
                        ].map(({ label, threshold }) => (
                          <div key={label} className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-300"
                              style={{ background: progress >= threshold ? "linear-gradient(135deg, #C4856A, #8B3A52)" : "#EDE4D8" }}
                            >
                              {progress >= threshold && <CheckCircle size={10} color="#FDFAF6" strokeWidth={2.5} />}
                            </div>
                            <span className="text-xs" style={{
                              fontFamily: "'DM Sans', sans-serif",
                              color: progress >= threshold ? "#2C1810" : "#C4A898",
                              fontWeight: progress >= threshold ? 400 : 300,
                            }}>
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Done */
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}>
                        <CheckCircle size={26} color="#FDFAF6" strokeWidth={1.8} />
                      </div>
                      <p className="text-base" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#2C1810" }}>分析完成！</p>
                      <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>正在為你顯示結果…</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Add Wardrobe Modal ───────────────────────────────────────────────────────
// 新增衣櫥單品彈窗

/**
 * AddWardrobeModal - 新增衣櫥單品的彈窗組件
 *
 * 【功能】
 * 1. 選擇服裝類型 (category) - 上衣或下著
 * 2. 上傳照片 (pick)
 *
 * 【流程】
 * category → pick → 確認 → 自動關閉並回傳結果
 * 或
 * 直接進入 pick (如果提供了 initialCategory)
 *
 * 【Props】
 * @param open - 是否顯示彈窗
 * @param onClose - 關閉彈窗的回調
 * @param onComplete - 上傳完成時的回調，傳遞 WardrobeItem 物件
 * @param initialCategory - 預設的類別 (可選，如果提供則跳過類別選擇)
 *
 * 【特色】
 * - 支援快速新增特定類別的單品
 * - 自動為衣物分配主色 (從預設色彩中隨機選擇)
 */
type WardrobeStep = "category" | "pick";

function AddWardrobeModal({ open, onClose, onComplete, initialCategory }: {
  open: boolean;
  onClose: () => void;
  onComplete: (item: WardrobeItem) => void;
  initialCategory?: "top" | "bottom";
}) {
  const [step, setStep] = useState<WardrobeStep>("category");
  const [category, setCategory] = useState<"top" | "bottom">("top");
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false); // 🆕 新增上傳中狀態
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (initialCategory) {
        setCategory(initialCategory);
        setStep("pick");
      } else {
        setStep("category");
        setCategory("top");
      }
      setPreview(null);
      setIsUploading(false);
    }
  }, [open, initialCategory]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  // 🆕 修改為非同步函數，並呼叫後端 API
  // 在 AddWardrobeModal 組件中
  async function handleConfirm() {
    if (!preview || !fileRef.current?.files?.[0]) return;
    
    const file = fileRef.current.files[0];
    setIsUploading(true); 
    
    try {
      const result = await api.addWardrobeItem(file, category);
      
      if (result.success) {
        // 將後端傳來的 "42,42,44" 字串轉成 HEX
        let hexColor = '#C4856A'; // 預設色
        if (result.data.colors[0]) {
          const [r, g, b] = result.data.colors[0].split(',').map(Number);
          hexColor = rgbToHex(r, g, b);
        }

        const newItem: WardrobeItem = {
          id: result.data.item_id,
          date: new Date().toISOString().slice(0, 10),
          imageUrl: `http://127.0.0.1:5001${result.data.image_url}`, 
          category: result.data.tag as "top" | "bottom",
          dominantColor: hexColor, // 改為存入 HEX
        };
        
        onComplete(newItem);
        onClose();
      } else {
        alert("上傳失敗：" + (result.message || "未知錯誤"));
      }
    } catch (error) {
      console.error(error);
      alert("上傳發生錯誤，請確認後端是否已啟動");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="absolute inset-0 z-20"
            style={{ background: "rgba(44,24,16,0.5)", backdropFilter: "blur(3px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(step === "category" && !isUploading) ? onClose : undefined} />

          <motion.div key="sh" className="absolute bottom-0 left-0 right-0 z-30 rounded-t-3xl overflow-hidden max-h-[85vh] flex flex-col"
            style={{ background: "#FDFAF6" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}>

            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: "rgba(44,24,16,0.15)" }} />
            </div>

            <div className="px-6 pb-10 pt-3 overflow-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400, color: "#2C1810" }}>
                    {step === "category" ? "選擇服裝類型" : `新增${category === "top" ? "上衣" : "下著"}`}
                  </h2>
                  <p className="text-xs tracking-widest uppercase mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#B87355" }}>
                    {step === "category" ? "Choose Category" : "Upload Photo"}
                  </p>
                </div>
                {step === "category" && !isUploading && (
                  <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(44,24,16,0.07)" }}>
                    <X size={15} color="#8A6F5E" strokeWidth={2} />
                  </button>
                )}
              </div>

              {step === "category" && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>請選擇要新增的服裝類型</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setCategory("top"); setStep("pick"); }}
                      className="flex-1 rounded-2xl py-6 flex flex-col items-center gap-3 active:opacity-70 transition-all"
                      style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)", border: "1px solid rgba(44,24,16,0.1)" }}
                    >
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                        <ShoppingBag size={28} color="#FDFAF6" strokeWidth={1.5} />
                      </div>
                      <span className="text-base" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#FDFAF6" }}>上衣</span>
                      <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "rgba(255,255,255,0.8)" }}>Tops</span>
                    </button>
                    <button
                      onClick={() => { setCategory("bottom"); setStep("pick"); }}
                      className="flex-1 rounded-2xl py-6 flex flex-col items-center gap-3 active:opacity-70 transition-all"
                      style={{ background: "linear-gradient(135deg, #8B3A52 0%, #6B2A40 100%)", border: "1px solid rgba(44,24,16,0.1)" }}
                    >
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.2)" }}>
                        <ShoppingBag size={28} color="#FDFAF6" strokeWidth={1.5} />
                      </div>
                      <span className="text-base" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#FDFAF6" }}>下著</span>
                      <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "rgba(255,255,255,0.8)" }}>Bottoms</span>
                    </button>
                  </div>
                </div>
              )}

              {step === "pick" && (
                <div className="flex flex-col gap-5">
                  <button
                    onClick={() => !isUploading && fileRef.current?.click()}
                    className="w-full rounded-2xl flex flex-col items-center justify-center transition-opacity active:opacity-70 overflow-hidden relative"
                    style={{
                      height: 220,
                      background: preview ? "transparent" : "#EDE4D8",
                      border: preview ? "none" : "1.5px dashed rgba(44,24,16,0.2)",
                    }}
                  >
                    {preview ? (
                      <>
                        <img src={preview} alt="preview" className={`w-full h-full object-cover rounded-2xl ${isUploading ? 'opacity-50' : ''}`} />
                        {isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="px-4 py-2 rounded-xl bg-black/60 text-white text-sm tracking-widest">去背分析中...</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(139,58,82,0.12)" }}>
                          <Camera size={26} color="#8B3A52" strokeWidth={1.4} />
                        </div>
                        <p className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
                          點此上傳{category === "top" ? "上衣" : "下著"}照片
                        </p>
                        <p className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>支援 JPG、PNG、HEIC</p>
                      </div>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (isUploading) return;
                        if (preview) { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }
                        else if (initialCategory) onClose();
                        else setStep("category");
                      }}
                      disabled={isUploading}
                      className="flex-1 rounded-xl py-3 active:opacity-70 transition-opacity disabled:opacity-50"
                      style={{ background: "rgba(44,24,16,0.07)" }}
                    >
                      <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                        {preview ? "重新選擇" : initialCategory ? "取消" : "返回"}
                      </span>
                    </button>
                    {preview && (
                      <button
                        onClick={handleConfirm}
                        disabled={isUploading}
                        className="flex-1 rounded-xl py-3 flex items-center justify-center gap-2 active:opacity-70 transition-opacity disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #8B3A52 0%, #6B2A40 100%)" }}
                      >
                        {!isUploading && <CheckCircle size={15} color="#FDFAF6" strokeWidth={1.8} />}
                        <span className="text-sm tracking-wide" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: "#FDFAF6" }}>
                          {isUploading ? "處理中..." : `新增${category === "top" ? "上衣" : "下著"}`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────
// 首頁畫面

/**
 * HomeScreen - 首頁導航畫面組件
 *
 * 【功能】
 * - 顯示三個主要功能入口：個人色彩分析、我的衣櫥、配色建議
 * - 顯示使用者資訊和登出選單
 * - 作為主要的導航中心
 *
 * 【Props】
 * @param onNavigate - 導航到其他畫面的函數
 * @param onNavigateColorSuggestion - 導航到配色建議畫面的特殊函數
 * @param user - 當前登入的使用者資訊
 * @param onUserClick - 點擊使用者頭像時的回調 (用於登出)
 *
 * 【畫面流程】
 * HomeScreen → ColorAnalysisScreen (個人色彩分析)
 * HomeScreen → WardrobeScreen (我的衣櫥)
 * HomeScreen → ColorSuggestionScreen (配色建議)
 *
 * 【狀態管理】
 * - showLogoutMenu: 控制登出選單的顯示/隱藏
 *
 * 【特色】
 * - 登入使用者可看到頭像和登出選單
 * - 使用漸變色彩區分不同功能按鈕
 * - 按鈕有 hover 和點擊動畫效果
 */
function HomeScreen({ onNavigate, onNavigateColorSuggestion, user, onUserClick }: {
  onNavigate: (s: Screen) => void;
  onNavigateColorSuggestion: () => void;
  user: UserAccount | null;
  onUserClick: () => void;
}) {
  const [showLogoutMenu, setShowLogoutMenu] = useState(false);

  const buttons = [
    { id: "color-analysis", label: "個人色彩分析", sublabel: "Personal Color Analysis", icon: Sparkles, gradient: "from-[#C4856A] to-[#8B3A52]", onClick: () => onNavigate("color-analysis") },
    { id: "wardrobe", label: "我的衣櫥", sublabel: "My Wardrobe", icon: ShoppingBag, gradient: "from-[#8B3A52] to-[#6B2A40]", onClick: () => onNavigate("wardrobe") },
    { id: "color-suggestion", label: "配色建議", sublabel: "Color Coordination", icon: Palette, gradient: "from-[#B87355] to-[#C4856A]", onClick: onNavigateColorSuggestion },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex justify-end px-5 pt-14 relative">
        <motion.button
          onClick={() => user ? setShowLogoutMenu(!showLogoutMenu) : onUserClick()}
          whileTap={{ scale: 0.92 }}
          className="flex items-center gap-2 rounded-full px-3 py-2"
          style={{ background: user ? "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" : "rgba(44,24,16,0.08)" }}>
          {user ? (
            <>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ background: "rgba(255,255,255,0.25)", color: "#FDFAF6", fontFamily: "'DM Sans', sans-serif" }}>
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm pr-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#FDFAF6" }}>{user.name}</span>
            </>
          ) : (
            <>
              <User size={16} color="#8A6F5E" strokeWidth={1.8} />
              <span className="text-xs pr-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>登入</span>
            </>
          )}
        </motion.button>

        {/* Logout menu */}
        <AnimatePresence>
          {showLogoutMenu && user && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-full right-5 mt-2 rounded-xl shadow-lg overflow-hidden z-10"
              style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.1)" }}
            >
              <button
                onClick={() => {
                  setShowLogoutMenu(false);
                  onUserClick();
                }}
                className="w-full px-5 py-3 text-left hover:bg-[#EDE4D8] transition-colors"
              >
                <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#2C1810" }}>登出</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center pt-8 pb-10 px-8">
        <div className="w-14 h-px bg-accent mb-6 opacity-50" />
        <h1 className="text-4xl text-center leading-tight text-foreground"
          style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400 }}>
          Color &amp; Style
        </h1>
        <p className="mt-3 text-sm tracking-[0.2em] uppercase text-muted-foreground"
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>
          你的專屬色彩顧問
        </p>
        <div className="w-14 h-px bg-accent mt-6 opacity-50" />
      </div>

      <div className="flex flex-col gap-4 px-6 pb-10 flex-1 justify-center">
        {buttons.map((btn, i) => {
          const Icon = btn.icon;
          return (
            <motion.button key={btn.id}
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.5, ease: "easeOut" }}
              onClick={btn.onClick}
              whileTap={{ scale: 0.97 }} whileHover={{ y: -2 }}
              className="relative overflow-hidden rounded-2xl h-24 flex items-center px-6 gap-5 group shadow-sm"
              style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.1)" }}>
              <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${btn.gradient} rounded-l-2xl`} />
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${btn.gradient} flex items-center justify-center shrink-0 ml-2`}>
                <Icon size={20} color="#FDFAF6" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xl text-foreground" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}>{btn.label}</span>
                <span className="text-xs text-muted-foreground tracking-wider mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300 }}>{btn.sublabel}</span>
              </div>
              <div className="ml-auto text-muted-foreground group-hover:text-primary transition-colors">
                <ChevronRight size={20} strokeWidth={1.5} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="pb-10 flex justify-center">
        <p className="text-xs text-muted-foreground tracking-widest uppercase opacity-60" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Designed for you
        </p>
      </div>
    </div>
  );
}

// ─── Sub-screen shell ─────────────────────────────────────────────────────────
// 子畫面共用外殼組件

/**
 * SubScreen - 子畫面的共用外殼組件
 *
 * 【功能】
 * - 提供統一的標題列 (包含返回按鈕、標題、副標題)
 * - 提供可選的右側按鈕區域 (例如新增按鈕)
 * - 統一的樣式和佈局
 *
 * 【Props】
 * @param title - 主標題 (中文)
 * @param subtitle - 副標題 (英文)
 * @param accentColor - 強調色 (用於副標題)
 * @param onBack - 返回上一頁的回調函數
 * @param headerRight - 右側按鈕區域 (可選)
 * @param children - 畫面內容
 *
 * 【使用範例】
 * - ColorAnalysisScreen 使用此外殼
 * - WardrobeScreen 使用此外殼
 * - ColorSuggestionScreen 使用此外殼
 */
function SubScreen({ title, subtitle, accentColor, onBack, headerRight, children }: {
  title: string;
  subtitle: string;
  accentColor: string;
  onBack: () => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-5 pt-14 pb-5 shrink-0" style={{ borderBottom: "1px solid rgba(44,24,16,0.08)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(44,24,16,0.06)" }}>
          <ArrowLeft size={18} color="#2C1810" strokeWidth={1.8} />
        </button>
        <div className="flex flex-col flex-1 min-w-0">
          <h2 className="text-xl leading-tight truncate" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#2C1810" }}>{title}</h2>
          <p className="text-xs tracking-widest uppercase mt-0.5" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: accentColor }}>{subtitle}</p>
        </div>
        {headerRight}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

// ─── Analysis Row ─────────────────────────────────────────────────────────────
// 色彩分析記錄列表項

/**
 * AnalysisRow - 色彩分析記錄的列表項組件
 *
 * 【功能】
 * - 顯示分析結果的縮圖、季節色型、日期
 * - 顯示適合的色彩色票 (可點擊查看配色)
 * - 顯示分析描述
 * - 提供刪除功能
 * - 點擊照片可進入配色建議畫面
 *
 * 【Props】
 * @param item - 色彩分析記錄物件
 * @param onDelete - 刪除記錄的回調函數
 * @param onColorClick - 點擊色票時的回調 (導航到配色建議並選中該顏色)
 * @param onImageClick - 點擊照片時的回調 (導航到配色建議的個人色彩 tab)
 * @param isNew - 是否為新增的記錄 (用於動畫效果)
 *
 * 【動畫】
 * - 新增時：從上方滑入
 * - 刪除時：向右側滑出並縮小
 *
 * 【互動關係】
 * AnalysisRow (點擊色票) → ColorSuggestionScreen (個人色彩 tab，選中該顏色)
 * AnalysisRow (點擊照片) → ColorSuggestionScreen (個人色彩 tab)
 */
function AnalysisRow({ item, onDelete, onColorClick, onImageClick, isNew }: {
  item: ColorAnalysis;
  onDelete: (id: number) => void;
  onColorClick?: (color: string) => void;
  onImageClick?: () => void;
  isNew?: boolean;
}) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    setDeleting(true);
    setTimeout(() => onDelete(item.id), 300);
  }

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -16, scale: 0.97 } : { opacity: 0 }}
      animate={deleting ? { opacity: 0, x: 30, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex items-stretch gap-3 rounded-2xl overflow-hidden"
      style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}
    >
      {/* Photo */}
      <button
        onClick={onImageClick}
        className="shrink-0 active:opacity-70 transition-opacity"
        style={{ width: 72, minHeight: 96, background: "#EDE4D8" }}
      >
        <img src={item.imageUrl} alt={item.season} className="w-full h-full object-cover" style={{ display: "block" }} loading="lazy" />
      </button>

      {/* Content */}
      <div className="flex flex-col justify-between flex-1 min-w-0 py-3 pr-0">
        {/* Season + date */}
        <div className="flex items-start justify-between gap-1 pr-3">
          <p className="text-sm leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#2C1810" }}>{item.type}</p>
          <span className="text-xs shrink-0" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>{item.date.replace(/-/g, ".")}</span>
        </div>

        {/* Color swatches */}
        <div className="flex gap-1 mt-2">
          {item.colors.map((c) => (
            <button
              key={c}
              onClick={() => onColorClick?.(c)}
              className="rounded-full active:scale-90 transition-transform"
              style={{ width: 18, height: 18, backgroundColor: c, border: "1.5px solid rgba(255,255,255,0.7)", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
            />
          ))}
        </div>

        {/* Description */}
        <p className="text-xs leading-relaxed mt-2 pr-3 line-clamp-2" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
          {item.description}
        </p>
      </div>

      {/* Delete button */}
      <div className="flex items-center pr-3 pl-1 shrink-0">
        <button
          onClick={handleDelete}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors active:scale-90"
          style={{ background: "rgba(212,24,61,0.07)" }}
        >
          <Trash2 size={15} color="#d4183d" strokeWidth={1.8} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Wardrobe Row ─────────────────────────────────────────────────────────────
// 衣櫥單品列表項

/**
 * WardrobeRow - 衣櫥單品的列表項組件
 *
 * 【功能】
 * - 顯示衣物的縮圖、類別 (上衣/下著)、日期
 * - 顯示主要顏色標籤
 * - 提供刪除功能
 * - 點擊照片可進入對應的配色建議畫面
 *
 * 【Props】
 * @param item - 衣櫥單品物件
 * @param onDelete - 刪除單品的回調函數
 * @param onImageClick - 點擊照片時的回調
 *   - 上衣 → 導航到配色建議的「上衣配色」tab
 *   - 下著 → 導航到配色建議的「下著配色」tab
 * @param isNew - 是否為新增的記錄 (用於動畫效果)
 *
 * 【動畫】
 * - 新增時：從上方滑入
 * - 刪除時：向右側滑出並縮小
 *
 * 【互動關係】
 * WardrobeRow (上衣照片) → ColorSuggestionScreen (上衣配色 tab)
 * WardrobeRow (下著照片) → ColorSuggestionScreen (下著配色 tab)
 */
function WardrobeRow({ item, onDelete, onImageClick, isNew }: {
  item: WardrobeItem;
  onDelete: (id: number) => void;
  onImageClick?: () => void;
  isNew?: boolean;
}) {
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    setDeleting(true);
    setTimeout(() => onDelete(item.id), 300);
  }

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -16, scale: 0.97 } : { opacity: 0 }}
      animate={deleting ? { opacity: 0, x: 30, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex items-stretch gap-3 rounded-2xl overflow-hidden"
      style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}
    >
      {/* Photo */}
      <button
        onClick={onImageClick}
        className="shrink-0 active:opacity-70 transition-opacity"
        style={{ width: 72, minHeight: 96, background: "#EDE4D8" }}
      >
        <img src={item.imageUrl} alt={item.category} className="w-full h-full object-cover" style={{ display: "block" }} loading="lazy" />
      </button>

      {/* Content */}
      <div className="flex flex-col justify-center flex-1 min-w-0 py-3 pr-0 gap-2">
        <div className="flex items-center justify-between gap-1 pr-3">
          {/* Category label + color dot */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: item.category === "top" ? "rgba(196,133,106,0.15)" : "rgba(139,58,82,0.15)" }}>
              <ShoppingBag size={15} color={item.category === "top" ? "#C4856A" : "#8B3A52"} strokeWidth={1.6} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#2C1810" }}>
                  {item.category === "top" ? "上衣" : "下著"}
                </span>
                {/* Dominant color swatch */}
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(44,24,16,0.05)" }}>
                  <div className="w-3 h-3 rounded-full border border-white/60 shadow-sm" style={{ backgroundColor: item.dominantColor }} />
                  <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E", fontSize: "10px" }}>
                    {item.dominantColor.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <span className="text-xs shrink-0" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>{item.date.replace(/-/g, ".")}</span>
        </div>
      </div>

      {/* Delete button */}
      <div className="flex items-center pr-3 pl-1 shrink-0">
        <button
          onClick={handleDelete}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors active:scale-90"
          style={{ background: "rgba(212,24,61,0.07)" }}
        >
          <Trash2 size={15} color="#d4183d" strokeWidth={1.8} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Color Analysis Screen ────────────────────────────────────────────────────
// 個人色彩分析畫面

/**
 * ColorAnalysisScreen - 個人色彩分析畫面組件
 *
 * 【功能】
 * - 顯示所有色彩分析記錄
 * - 新增色彩分析 (打開 AddAnalysisModal)
 * - 刪除分析記錄
 * - 點擊色票查看配色建議
 * - 點擊照片進入配色建議畫面
 *
 * 【Props】
 * @param onBack - 返回上一頁的回調
 * @param user - 當前使用者
 * @param analyses - 所有分析記錄陣列
 * @param onAdd - 新增分析記錄的回調
 * @param onDelete - 刪除分析記錄的回調
 * @param onColorClick - 點擊色票的回調 (導航並選中顏色)
 * @param onImageClick - 點擊照片的回調 (導航到個人色彩 tab)
 *
 * 【狀態管理】
 * - addOpen: 控制新增彈窗的開關
 * - newestId: 最新新增的記錄 ID (用於動畫效果)
 *
 * 【畫面流程】
 * ColorAnalysisScreen → AddAnalysisModal (新增分析)
 * ColorAnalysisScreen (點擊色票) → ColorSuggestionScreen (選中顏色)
 * ColorAnalysisScreen (點擊照片) → ColorSuggestionScreen (個人色彩 tab)
 *
 * 【空狀態】
 * 當沒有分析記錄時，顯示引導訊息和新增按鈕
 */
function ColorAnalysisScreen({ onBack, user, analyses, onAdd, onDelete, onColorClick, onImageClick }: {
  onBack: () => void;
  user: UserAccount | null;
  analyses: ColorAnalysis[];
  onAdd: (a: ColorAnalysis) => void;
  onDelete: (id: number) => void;
  onColorClick: (color: string) => void;
  onImageClick: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newestId, setNewestId] = useState<number | null>(null);

  function handleComplete(analysis: ColorAnalysis) {
    onAdd(analysis);
    setNewestId(analysis.id);
  }

  const addBtn = (
    <button
      onClick={() => setAddOpen(true)}
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:opacity-70 transition-opacity"
      style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}
    >
      <Plus size={18} color="#FDFAF6" strokeWidth={2} />
    </button>
  );

  return (
    <>
      <SubScreen title="個人色彩分析" subtitle="Personal Color Analysis" accentColor="#C4856A" onBack={onBack} headerRight={addBtn}>
        {analyses.length > 0 ? (
          <div className="px-5 py-5 flex flex-col gap-3">
            <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
              {analyses.length} 筆分析紀錄 • 點擊色票查看配色
            </p>
            {analyses.map((item) => (
              <AnalysisRow key={item.id} item={item} onDelete={onDelete} onColorClick={onColorClick} onImageClick={onImageClick} isNew={item.id === newestId} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full px-8 gap-6">
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: "#EDE4D8" }}>
              <Sparkles size={36} color="#C4856A" strokeWidth={1.2} />
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-xl text-center" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400, color: "#2C1810" }}>
                尚無分析紀錄
              </p>
              <p className="text-sm text-center leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
                {user ? "點右上角 + 開始你的第一次色彩分析" : "請先登入，再進行個人色彩分析"}
              </p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="rounded-2xl px-8 py-3.5 active:opacity-75 transition-opacity"
              style={{ background: "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" }}
            >
              <span className="text-sm tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: "#FDFAF6" }}>
                + 新增分析
              </span>
            </button>
          </div>
        )}
      </SubScreen>

      <AddAnalysisModal open={addOpen} onClose={() => setAddOpen(false)} onComplete={handleComplete} />
    </>
  );
}

// ─── Wardrobe Screen ──────────────────────────────────────────────────────────
// 我的衣櫥畫面

/**
 * WardrobeScreen - 我的衣櫥畫面組件
 *
 * 【功能】
 * - 顯示所有衣櫥單品
 * - 篩選：全部 / 上衣 / 下著
 * - 新增衣物 (打開 AddWardrobeModal)
 * - 刪除衣物
 * - 點擊照片進入對應的配色建議畫面
 *
 * 【Props】
 * @param onBack - 返回上一頁的回調
 * @param wardrobe - 所有衣櫥單品陣列
 * @param onAdd - 新增單品的回調
 * @param onDelete - 刪除單品的回調
 * @param onTopImageClick - 點擊上衣照片的回調 (導航到上衣配色 tab)
 * @param onBottomImageClick - 點擊下著照片的回調 (導航到下著配色 tab)
 *
 * 【狀態管理】
 * - filter: 當前篩選條件 (all | top | bottom)
 * - addOpen: 控制新增彈窗的開關
 * - initialCategory: 預設類別 (快速新增特定類別)
 * - newestId: 最新新增的單品 ID (用於動畫效果)
 *
 * 【畫面流程】
 * WardrobeScreen → AddWardrobeModal (新增衣物)
 * WardrobeScreen (點擊上衣) → ColorSuggestionScreen (上衣配色 tab)
 * WardrobeScreen (點擊下著) → ColorSuggestionScreen (下著配色 tab)
 *
 * 【空狀態】
 * 根據當前篩選條件顯示對應的空狀態訊息
 */
function WardrobeScreen({ onBack, wardrobe, onAdd, onDelete, onTopImageClick, onBottomImageClick }: {
  onBack: () => void;
  wardrobe: WardrobeItem[];
  onAdd: (item: WardrobeItem) => void;
  onDelete: (id: number) => void;
  onTopImageClick: () => void;
  onBottomImageClick: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "top" | "bottom">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [initialCategory, setInitialCategory] = useState<"top" | "bottom" | undefined>(undefined);
  const [newestId, setNewestId] = useState<number | null>(null);

  function handleComplete(item: WardrobeItem) {
    onAdd(item);
    setNewestId(item.id);
  }

  function openAddModal(category?: "top" | "bottom") {
    setInitialCategory(category);
    setAddOpen(true);
  }

  const filteredItems = filter === "all" ? wardrobe : wardrobe.filter((item) => item.category === filter);
  const topCount = wardrobe.filter((item) => item.category === "top").length;
  const bottomCount = wardrobe.filter((item) => item.category === "bottom").length;

  return (
    <>
      <SubScreen title="我的衣櫥" subtitle="My Wardrobe" accentColor="#8B3A52" onBack={onBack}>
        <div className="flex flex-col h-full">
          {/* Filter buttons */}
          <div className="flex gap-2 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid rgba(44,24,16,0.06)" }}>
            <button
              onClick={() => setFilter("all")}
              className={`flex-1 rounded-xl py-2.5 transition-all ${filter === "all" ? "shadow-sm" : ""}`}
              style={{
                background: filter === "all" ? "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" : "rgba(44,24,16,0.05)",
              }}
            >
              <span className="text-sm" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: filter === "all" ? 500 : 400,
                color: filter === "all" ? "#FDFAF6" : "#8A6F5E",
              }}>
                全部 {wardrobe.length > 0 && `(${wardrobe.length})`}
              </span>
            </button>
            <button
              onClick={() => setFilter("top")}
              className={`flex-1 rounded-xl py-2.5 transition-all ${filter === "top" ? "shadow-sm" : ""}`}
              style={{
                background: filter === "top" ? "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" : "rgba(44,24,16,0.05)",
              }}
            >
              <span className="text-sm" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: filter === "top" ? 500 : 400,
                color: filter === "top" ? "#FDFAF6" : "#8A6F5E",
              }}>
                上衣 {topCount > 0 && `(${topCount})`}
              </span>
            </button>
            <button
              onClick={() => setFilter("bottom")}
              className={`flex-1 rounded-xl py-2.5 transition-all ${filter === "bottom" ? "shadow-sm" : ""}`}
              style={{
                background: filter === "bottom" ? "linear-gradient(135deg, #C4856A 0%, #8B3A52 100%)" : "rgba(44,24,16,0.05)",
              }}
            >
              <span className="text-sm" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: filter === "bottom" ? 500 : 400,
                color: filter === "bottom" ? "#FDFAF6" : "#8A6F5E",
              }}>
                下著 {bottomCount > 0 && `(${bottomCount})`}
              </span>
            </button>
            <button
              onClick={() => openAddModal()}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 active:opacity-70 transition-opacity"
              style={{ background: "linear-gradient(135deg, #8B3A52 0%, #6B2A40 100%)" }}
            >
              <Plus size={18} color="#FDFAF6" strokeWidth={2} />
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto">
            {filteredItems.length > 0 ? (
              <div className="px-5 py-5 flex flex-col gap-3">
                <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  {filteredItems.length} 件{filter === "top" ? "上衣" : filter === "bottom" ? "下著" : "單品"}
                </p>
                {filteredItems.map((item) => (
                  <WardrobeRow
                    key={item.id}
                    item={item}
                    onDelete={onDelete}
                    onImageClick={item.category === "top" ? onTopImageClick : onBottomImageClick}
                    isNew={item.id === newestId}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-8 gap-6">
                <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: "#EDE4D8" }}>
                  <ShoppingBag size={36} color="#8B3A52" strokeWidth={1.2} />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xl text-center" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 400, color: "#2C1810" }}>
                    {wardrobe.length === 0 ? "衣櫥是空的" : `尚無${filter === "top" ? "上衣" : "下著"}`}
                  </p>
                  <p className="text-sm text-center leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8A6F5E" }}>
                    {filter === "all" ? "點右上角 + 開始新增服裝" : `點下方按鈕新增${filter === "top" ? "上衣" : "下著"}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (filter === "top") {
                      openAddModal("top");
                    } else if (filter === "bottom") {
                      openAddModal("bottom");
                    } else {
                      openAddModal();
                    }
                  }}
                  className="rounded-2xl px-8 py-3.5 active:opacity-75 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #8B3A52 0%, #6B2A40 100%)" }}
                >
                  <span className="text-sm tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: "#FDFAF6" }}>
                    + 新增{filter === "top" ? "上衣" : filter === "bottom" ? "下著" : "服裝"}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </SubScreen>

      <AddWardrobeModal open={addOpen} onClose={() => setAddOpen(false)} onComplete={handleComplete} initialCategory={initialCategory} />
    </>
  );
}

// ─── Color Suggestion Screen ──────────────────────────────────────────────────
// 配色建議畫面

/**
 * SuggestionMode - 配色建議模式
 * 定義配色建議畫面的三種模式
 */
type SuggestionMode = "personal" | "top" | "bottom";

/**
 * ColorPaletteStrip - 配色色帶組件
 *
 * 【功能】
 * - 以橫向色帶方式顯示一組配色方案
 * - 每個色塊顯示對應的 HEX 顏色代碼
 *
 * 【Props】
 * @param palette - 色彩陣列 (HEX 格式)
 *
 * 【使用場景】
 * - 個人色彩配色方案展示
 * - 衣物配色方案展示
 */
function ColorPaletteStrip({ palette }: { palette: string[] }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className="flex h-16">
        {palette.map((c, i) => (
          <div key={i} className="flex-1 flex items-end justify-center pb-2" style={{ backgroundColor: c }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: "rgba(255,255,255,0.75)", letterSpacing: "0.04em" }}>
              {c.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * WardrobeThumb - 衣櫥單品縮圖組件
 *
 * 【功能】
 * - 顯示衣物的縮圖圖片
 * - 顯示主要顏色小圓點 (右下角)
 * - 可選狀態 (外框高亮顯示)
 *
 * 【Props】
 * @param item - 衣櫥單品物件
 * @param onClick - 點擊時的回調函數 (可選)
 * @param selected - 是否為選中狀態 (可選)
 *
 * 【使用場景】
 * - 配色建議畫面中展示符合的衣物
 * - 選擇上衣/下著以生成配色建議
 *
 * 【特色】
 * - 點擊時有縮放動畫效果
 * - 選中時有外框標示
 */
function WardrobeThumb({ item, onClick, selected }: { item: WardrobeItem; onClick?: () => void; selected?: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className="rounded-2xl overflow-hidden aspect-square relative"
      style={{
        background: "#EDE4D8",
        outline: selected ? "2.5px solid #8B3A52" : "none",
        outlineOffset: 2,
      }}
    >
      <img src={item.imageUrl} alt={item.category} className="w-full h-full object-cover" />
      <div className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: item.dominantColor }} />
    </motion.button>
  );
}

/**
 * ColorSuggestionScreen - 配色建議畫面組件
 *
 * 【功能】
 * 提供三種配色建議模式：
 * 1. 個人色彩模式 - 從色彩分析結果選擇主色，生成配色並找出符合的衣物
 * 2. 上衣配色模式 - 選擇上衣作為主色，推薦搭配的下著
 * 3. 下著配色模式 - 選擇下著作為配色，推薦搭配的主色上衣
 *
 * 【Props】
 * @param onBack - 返回上一頁的回調
 * @param analyses - 所有色彩分析記錄
 * @param initialColor - 初始選中的顏色 (從色彩分析點擊色票進入時使用)
 * @param initialMode - 初始模式 (從其他畫面導航進入時指定模式)
 * @param wardrobe - 所有衣櫥單品
 *
 * 【狀態管理】
 * - mode: 當前模式 (personal | top | bottom)
 * - selectedColor: 選中的顏色 (個人色彩模式使用)
 * - selectedItem: 選中的衣物 (上衣/下著配色模式使用)
 *
 * 【核心邏輯】
 * 個人色彩模式：
 *   1. 使用者從分析結果選擇一個顏色
 *   2. 生成配色方案 (generatePalette)
 *   3. 在衣櫥中找出符合配色的上衣和下著 (isColorMatch)
 *
 * 上衣配色模式：
 *   1. 使用者選擇一件上衣
 *   2. 以上衣的主要顏色生成配色方案
 *   3. 在衣櫥中找出符合配色的下著
 *
 * 下著配色模式：
 *   1. 使用者選擇一件下著
 *   2. 以下著的主要顏色生成配色方案
 *   3. 在衣櫥中找出符合配色的上衣
 *
 * 【畫面流程】
 * ColorAnalysisScreen (點擊色票) → ColorSuggestionScreen (個人色彩模式，選中顏色)
 * ColorAnalysisScreen (點擊照片) → ColorSuggestionScreen (個人色彩模式)
 * WardrobeScreen (點擊上衣) → ColorSuggestionScreen (上衣配色模式)
 * WardrobeScreen (點擊下著) → ColorSuggestionScreen (下著配色模式)
 * HomeScreen (點擊配色建議) → ColorSuggestionScreen (個人色彩模式)
 *
 * 【特色】
 * - 三種模式之間可以自由切換
 * - 使用顏色距離演算法判斷顏色是否匹配
 * - 空狀態提示使用者新增對應資料
 */
function ColorSuggestionScreen({ onBack, analyses, initialColor, initialMode, wardrobe }: {
  onBack: () => void;
  analyses: ColorAnalysis[];
  initialColor?: string;
  initialMode?: SuggestionMode;
  wardrobe: WardrobeItem[];
}) {
  const [mode, setMode] = useState<SuggestionMode>(initialMode || (initialColor ? "personal" : "personal"));
  const [selectedColor, setSelectedColor] = useState<string | null>(initialColor || null);
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);

  // 新增狀態來儲存從 API 拿回來的配色建議
  const [recommendedPalettes, setRecommendedPalettes] = useState<string[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  const tops = wardrobe.filter(w => w.category === "top");
  const bottoms = wardrobe.filter(w => w.category === "bottom");

  function switchMode(m: SuggestionMode) {
    setMode(m);
    setSelectedItem(null);
    if (m !== "personal") setSelectedColor(null);
  }

  function handleBack() {
    if (mode === "personal" && selectedColor) {
      setSelectedColor(null);
    } else if ((mode === "top" || mode === "bottom") && selectedItem) {
      setSelectedItem(null);
    } else {
      onBack();
    }
  }

  // 當選擇衣物時，呼叫後端 API 取得配色建議
  useEffect(() => {
    async function fetchMatches() {
      // 決定要交給大師分析的目標顏色
      let targetColor = "";
      if (mode === "personal" && selectedColor) {
        targetColor = selectedColor;
      } else if ((mode === "top" || mode === "bottom") && selectedItem) {
        targetColor = selectedItem.dominantColor;
      }

      // 如果沒有選顏色，就清空推薦
      if (!targetColor) {
        setRecommendedPalettes([]);
        return;
      }

      // 個人色彩、上衣：把輸入色當「主色」→ 找配色
      // 下著：把輸入色當「配色」→ 反向找主色
      const direction =
        mode === "bottom"
          ? "sub_to_main"
          : "main_to_sub";

      setIsLoadingMatches(true);
      try {
        const response = await api.getColorMatches(
          targetColor,
          direction
        );
        if (response.success && response.recommendations.length > 0) {
          // 將 API 回傳的推薦顏色陣列存起來
          const colors = response.recommendations.map((r: any) => r.color);
          setRecommendedPalettes(colors);
        } else {
          setRecommendedPalettes([]);
        }
      } catch (error) {
        console.error("取得配色建議失敗", error);
        setRecommendedPalettes([]);
      } finally {
        setIsLoadingMatches(false);
      }
    }

    fetchMatches();
  }, [selectedItem, selectedColor, mode]); // 監聽這三個狀態的變化

  // Personal mode palette + matches
  const personalMatchingTops = selectedColor ? tops.filter(t => isColorMatch(t.dominantColor, recommendedPalettes)) : [];
  const personalMatchingBottoms = selectedColor ? bottoms.filter(b => isColorMatch(b.dominantColor, recommendedPalettes)) : [];

  // Wardrobe mode — palette from selected item, find complement
  // Wardrobe mode 邏輯更新：改用從 API 拿回來的 recommendedPalettes 去衣櫥裡尋找
  // 如果 API 還在載入，或是 API 回傳空陣列（但有選定衣服），可以給一個空陣列，或是 fallback 到你原本的假資料
  const suggestedBottoms = (selectedItem && mode === "top")
    ? bottoms.filter(b => isColorMatch(b.dominantColor, recommendedPalettes))
    : [];
    
  const suggestedTops = (selectedItem && mode === "bottom")
    ? tops.filter(t => isColorMatch(t.dominantColor, recommendedPalettes))
    : [];

  const tabs: { id: SuggestionMode; label: string; sub: string }[] = [
    { id: "personal", label: "個人色彩", sub: "Personal" },
    { id: "top", label: "上衣配色", sub: "Top → Bottom" },
    { id: "bottom", label: "下著配色", sub: "Bottom → Top" },
  ];

  return (
    <SubScreen title="配色建議" subtitle="Color Coordination" accentColor="#B87355" onBack={handleBack}>
      <div className="flex flex-col h-full">

        {/* ── Tab bar ── */}
        <div className="flex gap-1.5 px-5 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(44,24,16,0.07)" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchMode(tab.id)}
              className="flex-1 rounded-xl py-2.5 flex flex-col items-center transition-all"
              style={{
                background: mode === tab.id
                  ? "linear-gradient(135deg, #B87355 0%, #C4856A 100%)"
                  : "rgba(44,24,16,0.05)",
              }}
            >
              <span className="text-xs leading-tight" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: mode === tab.id ? 500 : 400,
                color: mode === tab.id ? "#FDFAF6" : "#8A6F5E",
              }}>{tab.label}</span>
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 9,
                color: mode === tab.id ? "rgba(255,255,255,0.65)" : "#C4A898",
                letterSpacing: "0.04em",
              }}>{tab.sub}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto px-5 py-5 flex flex-col gap-5">

          {/* ════ PERSONAL COLOR MODE ════ */}
          {mode === "personal" && !selectedColor && (
            <>
              <p className="text-xs tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                選擇分析記錄中的色票作為主色
              </p>
              {analyses.length > 0 ? analyses.map((analysis) => (
                <div key={analysis.id} className="flex flex-col gap-3">
                  <div className="rounded-2xl p-3 flex items-center gap-3"
                    style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                    <div className="w-14 h-18 rounded-xl overflow-hidden shrink-0" style={{ background: "#EDE4D8", height: 68 }}>
                      <img src={analysis.imageUrl} alt={analysis.type} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-base" style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500, color: "#2C1810" }}>
                      {analysis.type}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {analysis.colors.map((color) => (
                      <motion.button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        whileTap={{ scale: 0.88 }}
                        className="aspect-square rounded-xl shadow-sm"
                        style={{ backgroundColor: color, border: "2px solid rgba(255,255,255,0.6)" }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl p-6 text-center" style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                  <Sparkles size={28} color="#C4A898" strokeWidth={1} />
                  <p className="text-sm mt-3" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>尚無個人色彩分析紀錄</p>
                  <p className="text-xs mt-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>請先進行個人色彩分析</p>
                </div>
              )}
            </>
          )}

          {mode === "personal" && selectedColor && (
            <>
              {/* Main color hero */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>主色</p>
                  <button onClick={() => setSelectedColor(null)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355", background: "rgba(184,115,85,0.1)" }}>
                    重新選擇
                  </button>
                </div>
                <div className="rounded-2xl h-20 shadow-md flex items-center justify-center" style={{ backgroundColor: selectedColor }}>
                  <div className="px-4 py-1.5 rounded-xl" style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(4px)" }}>
                    <span className="text-sm tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: "#FDFAF6" }}>
                      {selectedColor.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Palette */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>單色配色方案</p>
                <ColorPaletteStrip palette={recommendedPalettes} />
              </div>

              {/* Wardrobe matches */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-3" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  我的衣櫥 · 符合此配色
                </p>
                {personalMatchingTops.length === 0 && personalMatchingBottoms.length === 0 ? (
                  <div className="rounded-2xl p-5 text-center" style={{ background: "#FDFAF6", border: "1.5px dashed rgba(44,24,16,0.15)" }}>
                    <ShoppingBag size={28} color="#C4A898" strokeWidth={1} />
                    <p className="text-sm mt-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>衣櫥中暫無符合此配色的服裝</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {personalMatchingTops.length > 0 && (
                      <div>
                        <p className="text-xs mb-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355" }}>上衣 ({personalMatchingTops.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                          {personalMatchingTops.map(item => <WardrobeThumb key={item.id} item={item} />)}
                        </div>
                      </div>
                    )}
                    {personalMatchingBottoms.length > 0 && (
                      <div>
                        <p className="text-xs mb-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355" }}>下著 ({personalMatchingBottoms.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                          {personalMatchingBottoms.map(item => <WardrobeThumb key={item.id} item={item} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════ TOP → BOTTOM MODE ════ */}
          {mode === "top" && !selectedItem && (
            <>
              <div>
                <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  選擇一件上衣作為主色
                </p>
                <p className="text-xs mb-4" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#C4A898" }}>
                  系統將以上衣顏色為主色，推薦搭配的下著
                </p>
              </div>
              {tops.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {tops.map(item => (
                    <WardrobeThumb key={item.id} item={item} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl p-6 text-center" style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                  <ShoppingBag size={28} color="#C4A898" strokeWidth={1} />
                  <p className="text-sm mt-3" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>衣櫥中尚無上衣</p>
                  <p className="text-xs mt-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>請先在我的衣櫥中新增上衣</p>
                </div>
              )}
            </>
          )}

          {mode === "top" && selectedItem && (
            <>
              {/* Selected top */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>主色上衣</p>
                  <button onClick={() => setSelectedItem(null)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355", background: "rgba(184,115,85,0.1)" }}>
                    重新選擇
                  </button>
                </div>
                <div className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                  <div className="w-16 rounded-xl overflow-hidden shrink-0" style={{ height: 72, background: "#EDE4D8" }}>
                    <img src={selectedItem.imageUrl} alt="上衣" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: selectedItem.dominantColor }} />
                      <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#2C1810" }}>主色</span>
                      <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>{selectedItem.dominantColor.toUpperCase()}</span>
                    </div>
                    <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#B87355" }}>
                      以此上衣顏色為基礎，建議搭配下著
                    </span>
                  </div>
                </div>
              </div>

              {/* Palette */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>配色方案</p>
                <ColorPaletteStrip palette={recommendedPalettes} />
              </div>

              {/* Suggested bottoms */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  建議搭配下著
                </p>
                <p className="text-xs mb-3" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#C4A898" }}>
                  下著作為配色，以下為衣櫥中符合的單品
                </p>
                {suggestedBottoms.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {suggestedBottoms.map(item => <WardrobeThumb key={item.id} item={item} />)}
                  </div>
                ) : (
                  <div className="rounded-2xl p-5 text-center" style={{ background: "#FDFAF6", border: "1.5px dashed rgba(44,24,16,0.15)" }}>
                    <ShoppingBag size={28} color="#C4A898" strokeWidth={1} />
                    <p className="text-sm mt-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                      衣櫥中暫無符合此主色的下著
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════ BOTTOM → TOP MODE ════ */}
          {mode === "bottom" && !selectedItem && (
            <>
              <div>
                <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  選擇一件下著作為配色
                </p>
                <p className="text-xs mb-4" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#C4A898" }}>
                  系統將以下著顏色為配色，推薦搭配的主色上衣
                </p>
              </div>
              {bottoms.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {bottoms.map(item => (
                    <WardrobeThumb key={item.id} item={item} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl p-6 text-center" style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                  <ShoppingBag size={28} color="#C4A898" strokeWidth={1} />
                  <p className="text-sm mt-3" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>衣櫥中尚無下著</p>
                  <p className="text-xs mt-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#C4A898" }}>請先在我的衣櫥中新增下著</p>
                </div>
              )}
            </>
          )}

          {mode === "bottom" && selectedItem && (
            <>
              {/* Selected bottom */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs tracking-widest uppercase" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>配色下著</p>
                  <button onClick={() => setSelectedItem(null)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ fontFamily: "'DM Sans', sans-serif", color: "#B87355", background: "rgba(184,115,85,0.1)" }}>
                    重新選擇
                  </button>
                </div>
                <div className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ background: "#FDFAF6", border: "1px solid rgba(44,24,16,0.08)" }}>
                  <div className="w-16 rounded-xl overflow-hidden shrink-0" style={{ height: 72, background: "#EDE4D8" }}>
                    <img src={selectedItem.imageUrl} alt="下著" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: selectedItem.dominantColor }} />
                      <span className="text-sm" style={{ fontFamily: "'DM Sans', sans-serif", color: "#2C1810" }}>配色</span>
                      <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>{selectedItem.dominantColor.toUpperCase()}</span>
                    </div>
                    <span className="text-xs" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#8B3A52" }}>
                      以此下著顏色為配色，建議搭配上衣主色
                    </span>
                  </div>
                </div>
              </div>

              {/* Palette */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>配色方案</p>
                <ColorPaletteStrip palette={recommendedPalettes} />
              </div>

              {/* Suggested tops */}
              <div>
                <p className="text-xs tracking-widest uppercase mb-1" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                  建議搭配上衣
                </p>
                <p className="text-xs mb-3" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#C4A898" }}>
                  上衣作為主色，以下為衣櫥中符合的單品
                </p>
                {suggestedTops.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {suggestedTops.map(item => <WardrobeThumb key={item.id} item={item} />)}
                  </div>
                ) : (
                  <div className="rounded-2xl p-5 text-center" style={{ background: "#FDFAF6", border: "1.5px dashed rgba(44,24,16,0.15)" }}>
                    <ShoppingBag size={28} color="#C4A898" strokeWidth={1} />
                    <p className="text-sm mt-2" style={{ fontFamily: "'DM Sans', sans-serif", color: "#8A6F5E" }}>
                      衣櫥中暫無符合此配色的上衣
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </SubScreen>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
// 根組件

/**
 * App - 根組件 (主要應用程式組件)
 *
 * 【功能】
 * - 管理整個應用的全局狀態
 * - 控制畫面導航和歷史記錄
 * - 協調各個子畫面之間的數據流動
 *
 * 【全局狀態】
 * - screen: 當前顯示的畫面 (Screen 類型)
 * - history: 畫面歷史記錄堆疊 (用於返回功能)
 * - user: 當前登入的使用者資料 (UserAccount | null)
 * - analyses: 所有色彩分析記錄陣列
 * - wardrobe: 所有衣櫥單品陣列
 * - selectedColor: 從色彩分析選中的顏色 (用於配色建議)
 * - selectedMode: 配色建議的初始模式 (用於從其他畫面導航進入)
 *
 * 【導航系統】
 * navigate(to: Screen):
 *   - 將當前畫面推入歷史堆疊
 *   - 切換到新畫面
 *
 * goBack():
 *   - 從歷史堆疊取出上一個畫面
 *   - 返回到該畫面
 *
 * 【畫面轉場】
 * - 使用 AnimatePresence 和 motion 實現滑動轉場效果
 * - mode="wait" 確保畫面切換時不重疊
 * - 所有畫面使用統一的 slide 動畫配置
 *
 * 【數據管理函數】
 * addAnalysis(a: ColorAnalysis):
 *   - 新增色彩分析記錄到陣列開頭 (最新的在最上方)
 *
 * deleteAnalysis(id: number):
 *   - 根據 ID 刪除色彩分析記錄
 *
 * addWardrobeItem(item: WardrobeItem):
 *   - 新增衣櫥單品到陣列開頭
 *
 * deleteWardrobeItem(id: number):
 *   - 根據 ID 刪除衣櫥單品
 *
 * 【導航處理函數】
 * handleLogin(user: UserAccount):
 *   - 儲存使用者資料
 *   - 導航到首頁
 *
 * handleUserClick():
 *   - 登出使用者 (清除使用者資料)
 *   - 返回登入頁面
 *
 * handleColorClick(color: string):
 *   - 儲存選中的顏色
 *   - 導航到配色建議畫面 (個人色彩模式，帶選中顏色)
 *
 * navigateToColorSuggestion():
 *   - 清除選中的顏色和模式
 *   - 導航到配色建議畫面 (從首頁進入，默認個人色彩模式)
 *
 * handleAnalysisImageClick():
 *   - 清除選中的顏色
 *   - 設定為個人色彩模式
 *   - 導航到配色建議畫面
 *
 * handleTopImageClick():
 *   - 清除選中的顏色
 *   - 設定為上衣配色模式
 *   - 導航到配色建議畫面
 *
 * handleBottomImageClick():
 *   - 清除選中的顏色
 *   - 設定為下著配色模式
 *   - 導航到配色建議畫面
 *
 * 【畫面架構圖】
 * AuthScreen (登入/註冊)
 *     ↓
 * HomeScreen (首頁)
 *     ├─→ ColorAnalysisScreen (個人色彩分析)
 *     │       └─→ ColorSuggestionScreen (配色建議 - 個人色彩模式)
 *     ├─→ WardrobeScreen (我的衣櫥)
 *     │       └─→ ColorSuggestionScreen (配色建議 - 上衣/下著模式)
 *     └─→ ColorSuggestionScreen (配色建議 - 默認個人色彩模式)
 *
 * 【RWD 響應式設計】
 * 桌面版 (md 斷點以上):
 *   - 寬度固定為 420px
 *   - 高度為 92vh，最大 920px
 *   - 圓角 32px
 *   - 陰影效果模擬手機外框
 *
 * 手機版:
 *   - 寬度和高度填滿整個視窗
 *   - 無圓角和陰影
 *
 * 【檔案關係】
 * - 主檔案：src/app/App.tsx (本檔案)
 * - 樣式檔案：src/styles/theme.css (設計 tokens 和全局樣式)
 * - 字型檔案：src/styles/fonts.css (字型載入設定)
 * - 依賴套件：package.json (React, Motion, Lucide 等)
 *
 * 【特別注意】
 * - 本專案採用單一檔案架構，所有組件都在此檔案中
 * - 沒有使用 React Router，畫面切換由狀態管理
 * - 數據儲存在記憶體中，重新整理會遺失 (未來可串接後端)
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [history, setHistory] = useState<Screen[]>([]);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [analyses, setAnalyses] = useState<ColorAnalysis[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [selectedMode, setSelectedMode] = useState<SuggestionMode | undefined>(undefined);

  useEffect(() => {
    const token = localStorage.getItem('pca_jwt_token');
    const savedUser = localStorage.getItem('pca_user');

    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setScreen("home");
      } catch (e) {
        console.error("解析本地使用者資料失敗", e);
      }
    }
  }, []);

  // 🆕 當使用者登入成功，從後端取得「衣櫥」與「分析紀錄」資料
  useEffect(() => {
    if (user) {
      loadWardrobeData();
      loadAnalysesData(); // 呼叫載入分析紀錄
    } else {
      setWardrobe([]); 
      setAnalyses([]); // 若登出則一併清空分析紀錄
    }
  }, [user]);

  // 從後端獲取分析紀錄清單
  async function loadAnalysesData() {
    try {
      const result = await api.getAnalyses();
      if (result.success) {
        const mappedAnalyses: ColorAnalysis[] = result.data.map((item: any) => ({
          id: item.id,
          date: item.date,
          imageUrl: `http://127.0.0.1:5001${item.image_url}`,
          season: item.season, // 接收後端的 "春(Spring)"
          type: item.type,     // 接收後端的 "亮春型"
          colors: item.colors, // 完全接收後端查出的色票陣列
          description: item.description 
        }));
        setAnalyses(mappedAnalyses);
      }
    } catch (e) {
      console.error("無法載入分析紀錄", e);
    }
  }

  // 從後端獲取衣櫥清單
  async function loadWardrobeData() {
    try {
      const result = await api.getWardrobe();
      if (result.success) {
        const mappedItems: WardrobeItem[] = result.data.map((item: any) => {
          // 將後端傳來的 "42,42,44" 字串轉成 HEX
          let hexColor = '#C4856A'; // 預設色
          if (item.colors[0]) {
            const [r, g, b] = item.colors[0].split(',').map(Number);
            hexColor = rgbToHex(r, g, b);
          }

          return {
            id: item.item_id,
            date: new Date().toISOString().slice(0, 10),
            imageUrl: `http://127.0.0.1:5001${item.image_url}`,
            category: item.tag,
            dominantColor: hexColor // 改為存入 HEX
          };
        });
        setWardrobe(mappedItems);
      }
    } catch (e) {
      console.error("無法載入衣櫥資料", e);
    }
  }

  function navigate(to: Screen) {
    setHistory((h) => [...h, screen]);
    setScreen(to);
  }

  function goBack() {
    const prev = history[history.length - 1];
    if (prev !== undefined) { setHistory((h) => h.slice(0, -1)); setScreen(prev); }
  }

  function handleLogin(user: UserAccount) {
    localStorage.setItem('pca_user', JSON.stringify(user));
    setUser(user);
    setScreen("home");
  }

  async function handleUserClick() {
    if (user) {
      try {
        await api.logout();
      } catch (error) {
        console.error("後端登出 API 呼叫失敗", error);
      } finally {
        localStorage.removeItem('pca_jwt_token');
        localStorage.removeItem('pca_user');
        setUser(null); 
        setScreen("auth"); 
      }
    }
  }

  function addAnalysis(a: ColorAnalysis) {
    setAnalyses((prev) => [a, ...prev]); 
  }

  // 🆕 刪除個人色彩分析紀錄時，同步刪除資料庫與本機圖片
  async function deleteAnalysis(id: number) {
    try {
      const response = await api.deleteAnalysis(id);
      
      if (response.success) {
        // 後端刪除成功後，才將該筆資料從 React 畫面上移除
        setAnalyses((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert("刪除失敗：" + (response.message || "未知錯誤"));
      }
    } catch (e) {
      console.error("刪除分析紀錄失敗", e);
      alert("刪除失敗，請檢查網路連線");
    }
  }

  // 前端狀態更新（圖片上傳完成後呼叫）
  function addWardrobeItem(item: WardrobeItem) {
    setWardrobe((prev) => [item, ...prev]); 
  }

  // 🆕 刪除衣物時同步刪除資料庫與本機圖片
  async function deleteWardrobeItem(id: number) {
    try {
      await api.dropWardrobeItem(id);
      setWardrobe((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      console.error("刪除衣物失敗", e);
      alert("刪除失敗，請檢查網路連線");
    }
  }

  function handleColorClick(color: string) {
    setSelectedColor(color);
    navigate("color-suggestion");
  }

  function navigateToColorSuggestion() {
    setSelectedColor(undefined);
    setSelectedMode(undefined);
    navigate("color-suggestion");
  }

  function handleAnalysisImageClick() {
    setSelectedColor(undefined);
    setSelectedMode("personal");
    navigate("color-suggestion");
  }

  function handleTopImageClick() {
    setSelectedColor(undefined);
    setSelectedMode("top");
    navigate("color-suggestion");
  }

  function handleBottomImageClick() {
    setSelectedColor(undefined);
    setSelectedMode("bottom");
    navigate("color-suggestion");
  }

  return (
    <div className="size-full flex items-center justify-center bg-[#E8DDD3]">
      <div className="relative overflow-hidden w-full h-full md:w-[420px] md:h-[92vh] md:max-h-[920px] md:rounded-[32px] md:shadow-[0_20px_60px_rgba(44,24,16,0.18),0_8px_24px_rgba(44,24,16,0.1)]"
        style={{
          background: "#F7F2EC",
        }}>
        <AnimatePresence mode="wait" initial={false}>
          {screen === "auth" && (
            <motion.div key="auth" className="absolute inset-0" {...slide}>
              <AuthScreen onLogin={handleLogin} />
            </motion.div>
          )}
          {screen === "home" && (
            <motion.div key="home" className="absolute inset-0" {...slide}>
              <HomeScreen onNavigate={navigate} onNavigateColorSuggestion={navigateToColorSuggestion} user={user} onUserClick={handleUserClick} />
            </motion.div>
          )}
          {screen === "color-analysis" && (
            <motion.div key="color-analysis" className="absolute inset-0" {...slide}>
              <ColorAnalysisScreen onBack={goBack} user={user} analyses={analyses} onAdd={addAnalysis} onDelete={deleteAnalysis} onColorClick={handleColorClick} onImageClick={handleAnalysisImageClick} />
            </motion.div>
          )}
          {screen === "wardrobe" && (
            <motion.div key="wardrobe" className="absolute inset-0" {...slide}>
              <WardrobeScreen onBack={goBack} wardrobe={wardrobe} onAdd={addWardrobeItem} onDelete={deleteWardrobeItem} onTopImageClick={handleTopImageClick} onBottomImageClick={handleBottomImageClick} />
            </motion.div>
          )}
          {screen === "color-suggestion" && (
            <motion.div key="color-suggestion" className="absolute inset-0" {...slide}>
              <ColorSuggestionScreen onBack={goBack} analyses={analyses} initialColor={selectedColor} initialMode={selectedMode} wardrobe={wardrobe} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
