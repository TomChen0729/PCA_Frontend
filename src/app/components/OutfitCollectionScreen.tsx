import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, History, ListChecks, Trash2 } from "lucide-react";
import { api, resolveAssetUrl } from "../../api/api";

type Tab = "favorites" | "history" | "wishlist";

export default function OutfitCollectionScreen({ onBack, onTryOn }: { onBack: () => void; onTryOn: (top: number, bottom: number) => void }) {
  const [tab, setTab] = useState<Tab>("favorites");
  const [favorites, setFavorites] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const imageUrls = useRef<string[]>([]);
  const [error, setError] = useState("");

  async function reload() {
    setError("");
    try {
      const [f, h, w] = await Promise.all([api.getOutfitFavorites(), api.getTryOnHistory(), api.getWishlist()]);
      setFavorites(f.data || []); setHistory(h.data || []); setWishlist(w.data || []);
      const fetched = await Promise.all((h.data || []).map(async (item: any) => {
        try { return [item.result_id, await api.getTryOnResult(item.result_id)] as const; }
        catch { return [item.result_id, ""] as const; }
      }));
      imageUrls.current.forEach(URL.revokeObjectURL);
      imageUrls.current = fetched.map((entry) => entry[1]).filter(Boolean);
      setImages(Object.fromEntries(fetched.filter((entry) => entry[1])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "資料載入失敗"); }
  }
  useEffect(() => { void reload(); return () => imageUrls.current.forEach(URL.revokeObjectURL); }, []);

  const tabs: { id: Tab; label: string; icon: typeof Heart }[] = [
    { id: "favorites", label: "收藏穿搭", icon: Heart }, { id: "history", label: "試穿紀錄", icon: History }, { id: "wishlist", label: "缺件清單", icon: ListChecks },
  ];
  const buttonClass = "min-h-11 rounded-xl px-3 py-2 text-xs sm:text-sm";
  return <div className="flex h-full flex-col bg-[#F7F2EC]">
    <header className="mobile-safe-x mobile-safe-top mx-auto flex w-full min-w-0 items-center gap-3 pb-4 pt-8 lg:max-w-7xl lg:px-8">
      <button type="button" onClick={onBack} aria-label="返回" className="rounded-full p-2 hover:bg-[#EDE4D8]"><ArrowLeft size={20} /></button>
      <div><h1 className="text-xl text-[#2C1810]">穿搭收藏與紀錄</h1><p className="text-xs text-[#8A6F5E]">收藏喜歡的組合，或回看試穿結果</p></div>
    </header>
    <main className="mobile-safe-x mobile-safe-bottom mx-auto min-w-0 w-full max-w-7xl flex-1 space-y-4 overflow-auto pb-8 lg:px-8">
      <nav className="flex gap-2">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`${buttonClass} flex items-center gap-2 ${tab === id ? "bg-[#8B3A52] text-white" : "bg-white text-[#8A6F5E]"}`}><Icon size={15} />{label}</button>)}</nav>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {tab === "favorites" && (favorites.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{favorites.map((item) => <article key={item.id} className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm"><div className="grid grid-cols-2 gap-2">{[item.top, item.bottom].map((piece: any) => <div key={piece.id} className="rounded-xl bg-[#F7F2EC] p-2"><img src={resolveAssetUrl(piece.image_url)} alt={piece.category === "top" ? "收藏上衣" : "收藏下著"} className="h-32 w-full object-contain" /><p className="text-center text-xs text-[#8A6F5E]">{piece.category === "top" ? "上衣" : "下著"} · {piece.color || "色彩未記錄"}</p></div>)}</div><div className="mt-3 flex gap-2"><button className={`${buttonClass} flex-1 bg-[#8B3A52] text-white`} onClick={() => onTryOn(item.top.id, item.bottom.id)}>再次試穿</button><button aria-label="取消收藏" className={`${buttonClass} bg-[#F4E9E2] text-[#8B3A52]`} onClick={async () => { await api.deleteFavoriteOutfit(item.id); await reload(); }}><Trash2 size={16} /></button></div></article>)}</div> : <Empty text="還沒有收藏的穿搭。在虛擬試衣完成後可收藏組合。" />)}
      {tab === "history" && (history.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{history.map((item) => <article key={item.id} className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm"><img src={images[item.result_id] || ""} alt="試穿紀錄" className="max-h-80 min-h-40 w-full rounded-xl bg-[#F7F2EC] object-contain" /><p className="mt-2 text-xs text-[#8A6F5E]">{new Date(item.created_at).toLocaleString()}</p><p className="mt-1 text-xs text-[#8A6F5E]">上衣：{item.top ? item.top.color || "色彩未記錄" : "資料不可用"} · 下著：{item.bottom ? item.bottom.color || "色彩未記錄" : "資料不可用"}</p>{(!item.top || !item.bottom) && <p role="status" className="mt-2 rounded-lg bg-[#F4E9E2] px-3 py-2 text-xs leading-relaxed text-[#8A6F5E]">這筆紀錄的衣物資料不完整，目前無法再次使用。</p>}<button disabled={!item.top || !item.bottom} className={`${buttonClass} mt-2 w-full bg-[#8B3A52] text-white disabled:opacity-50`} onClick={() => item.top && item.bottom && onTryOn(item.top.id, item.bottom.id)}>再次使用這組單品</button></article>)}</div> : <Empty text="完成整套 AI 試穿後，結果會保存在這裡。" />)}
      {tab === "wishlist" && (wishlist.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{wishlist.map((item) => <article key={item.id} className={`flex items-center gap-3 rounded-2xl bg-[#FDFAF6] p-4 ${item.is_completed ? "opacity-60" : ""}`}><span className="h-12 w-12 shrink-0 rounded-xl border border-black/10" style={{ backgroundColor: item.color }} /><div className="min-w-0 flex-1"><p className="text-sm text-[#5A3A2E]">{item.category === "top" ? "上衣" : "下著"} · {item.color}</p><p className="text-xs text-[#8A6F5E]">{item.based_on_color ? `搭配色票 ${item.based_on_color}` : "待補單品"}{item.is_completed ? " · 已完成" : ""}</p></div><button title={item.is_completed ? "標記未完成" : "標記已完成"} className={`${buttonClass} bg-[#F4E9E2] text-[#8B3A52]`} onClick={async () => { await api.updateWishlistItem(item.id, !item.is_completed); await reload(); }}>{item.is_completed ? "恢復" : "完成"}</button><button aria-label="刪除缺件項目" className="p-2 text-[#8A6F5E]" onClick={async () => { await api.deleteWishlistItem(item.id); await reload(); }}><Trash2 size={16} /></button></article>)}</div> : <Empty text="推薦色暫時沒有合適衣物時，可將想補的顏色存到這裡。" />)}
    </main>
  </div>;
}

function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-[#C4A898] bg-[#FDFAF6] p-6 text-center text-sm text-[#8A6F5E]">{text}</p>; }
