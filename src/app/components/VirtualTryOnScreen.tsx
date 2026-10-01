import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Shirt, Sparkles, Upload, X } from "lucide-react";
import { api } from "../../api/api";

type TryOnCategory = "top" | "bottom";

interface TryOnWardrobeItem {
  id: number;
  imageUrl: string;
  tryOnImageUrl?: string;
  category: TryOnCategory;
  dominantColor: string;
}

interface VirtualTryOnScreenProps {
  wardrobe: TryOnWardrobeItem[];
  onBack: () => void;
  initialTopId?: number | null;
  initialBottomId?: number | null;
}

export default function VirtualTryOnScreen({ wardrobe, onBack, initialTopId = null, initialBottomId = null }: VirtualTryOnScreenProps) {
  const [humanPhoto, setHumanPhoto] = useState<File | null>(null);
  const [selectedTopId, setSelectedTopId] = useState<number | null>(initialTopId);
  const [selectedBottomId, setSelectedBottomId] = useState<number | null>(initialBottomId);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  const [humanPreviewUrl, setHumanPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!humanPhoto) {
      setHumanPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(humanPhoto);
    setHumanPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [humanPhoto]);

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  useEffect(() => {
    if (!isResultOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsResultOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isResultOpen]);

  const tops = wardrobe.filter((item) => item.category === "top");
  const bottoms = wardrobe.filter((item) => item.category === "bottom");
  const selectedTop = tops.find((item) => item.id === selectedTopId) ?? null;
  const selectedBottom = bottoms.find((item) => item.id === selectedBottomId) ?? null;

  useEffect(() => {
    if (selectedTopId !== null && !tops.some((item) => item.id === selectedTopId)) setSelectedTopId(null);
    if (selectedBottomId !== null && !bottoms.some((item) => item.id === selectedBottomId)) setSelectedBottomId(null);
  }, [wardrobe, selectedTopId, selectedBottomId]);

  async function handleGenerate() {
    if (!humanPhoto || !selectedTop || !selectedBottom) return;

    setIsGenerating(true);
    setError("");
    setResultUrl(null);
    setIsResultOpen(false);
    try {
      const created = await api.createTryOnJob(humanPhoto, selectedTop.id, selectedBottom.id);
      setJobId(created.job_id);
      let finished = false;
      while (!finished) {
        const response = await api.getTryOnJob(created.job_id);
        const job = response.data;
        if (job.status === "completed") {
          setResultUrl(await api.getTryOnResult(job.result_id));
          setProgressText("整套試穿完成");
          setIsFavorite(false);
          setIsResultOpen(true);
          finished = true;
        } else if (job.status === "failed") {
          throw new Error(job.error || "試穿生成失敗，可重試下著階段");
        } else {
          const label = job.stage === "top" ? "上衣" : "下著";
          setProgressText(`${job.status === "queued" ? "排隊等待" : `正在生成${label}`}（${job.progress}%）`);
          await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "試穿失敗，請稍後再試");
      setProgressText("");
    } finally {
      setIsGenerating(false);
    }
  }

  async function retryJob() {
    if (!jobId) return;
    setIsGenerating(true); setError("");
    try {
      await api.retryTryOnJob(jobId);
      setProgressText("試衣工作已重新排入，正在等待結果…");
      // 讓既有輪詢流程以已存在的工作重新開始。
      const poll = async () => {
        const next = await api.getTryOnJob(jobId);
        if (next.data.status === "completed") {
          setResultUrl(await api.getTryOnResult(next.data.result_id));
          setProgressText("整套試穿完成"); setIsFavorite(false); setIsResultOpen(true); return;
        }
        if (next.data.status === "failed") throw new Error(next.data.error || "重試失敗，請稍後再試");
        setProgressText(`正在生成${next.data.stage === "bottom" ? "下著" : "上衣"}（${next.data.progress}%）`);
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        return poll();
      };
      await poll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重試失敗");
    } finally { setIsGenerating(false); }
  }

  async function saveFavorite() {
    if (!selectedTop || !selectedBottom) return;
    try {
      await api.addFavoriteOutfit(selectedTop.id, selectedBottom.id);
      setIsFavorite(true); setSavedMessage("已收藏這套穿搭");
    } catch (cause) { setSavedMessage(cause instanceof Error ? cause.message : "收藏失敗"); }
  }

  function renderWardrobeChoices(items: TryOnWardrobeItem[], category: TryOnCategory) {
    const selectedId = category === "top" ? selectedTopId : selectedBottomId;
    const setSelectedId = category === "top" ? setSelectedTopId : setSelectedBottomId;

    if (!items.length) {
      return <p className="rounded-xl bg-[#F7F2EC] px-4 py-5 text-center text-sm text-[#8A6F5E]">衣櫥目前沒有{category === "top" ? "上衣" : "下著"}，請先到我的衣櫥新增。</p>;
    }

    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(selected ? null : item.id)}
              aria-pressed={selected}
              aria-label={`${selected ? "取消選擇" : "選擇"}${category === "top" ? "上衣" : "下著"}，主色 ${item.dominantColor.toUpperCase()}`}
              className="relative flex min-h-[148px] min-w-0 flex-col overflow-hidden rounded-xl border-2 bg-[#F7F2EC] transition"
              style={{ borderColor: selected ? "#8B3A52" : "transparent" }}
            >
              <img src={item.imageUrl} alt={category === "top" ? "衣櫥上衣" : "衣櫥下著"} className="h-28 w-full shrink-0 object-contain p-2" loading="lazy" />
              <span className="flex items-center justify-center gap-2 px-2 pb-2 text-xs text-[#5A3A2E]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: item.dominantColor }} />
                <span className="truncate">主色 {item.dominantColor.toUpperCase()}</span>
              </span>
              {selected && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#8B3A52] text-white"><Check size={14} /></span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#F7F2EC]">
      <header className="mobile-safe-x mobile-safe-top mx-auto flex w-full min-w-0 items-center gap-3 pb-4 pt-8 sm:pt-10 lg:max-w-7xl lg:px-8 lg:pt-8">
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-[#EDE4D8]" aria-label="返回">
          <ArrowLeft size={20} color="#5A3A2E" />
        </button>
        <div>
          <h1 className="text-xl text-[#2C1810]" style={{ fontFamily: "'Playfair Display', serif" }}>虛擬試衣</h1>
          <p className="text-xs text-[#8A6F5E]">上傳全身照，搭配衣櫥中的完整穿搭</p>
        </div>
      </header>

      <main className="mobile-safe-x min-w-0 flex-1 space-y-5 overflow-auto pb-4 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0 lg:px-8 lg:pb-8">
        <section className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm lg:col-start-1 lg:row-span-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#5A3A2E]"><Upload size={17} />上傳全身照</div>
          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#C4A898] bg-[#F7F2EC]">
            {humanPreviewUrl ? (
              <img src={humanPreviewUrl} alt="全身照預覽" className="max-h-72 w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-[#8A6F5E]">
                <Upload size={24} />點擊選擇人物正面全身照
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                setHumanPhoto(event.target.files?.[0] ?? null);
                setResultUrl(null);
                setIsResultOpen(false);
                setError("");
              }}
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-[#9B8274]">建議使用人物正面、頭到腳完整入鏡的清晰照片。</p>
        </section>

        <section className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm lg:col-start-2 lg:row-start-1">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#5A3A2E]"><Shirt size={17} />選擇上衣</div>
          {renderWardrobeChoices(tops, "top")}
        </section>

        <section className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm lg:col-start-2 lg:row-start-2">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#5A3A2E]"><Shirt size={17} />選擇下著</div>
          {renderWardrobeChoices(bottoms, "bottom")}
        </section>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !humanPhoto || !selectedTop || !selectedBottom}
          className="hidden w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-45 lg:col-start-2 lg:row-start-3 lg:flex"
          style={{ background: "linear-gradient(135deg, #8B3A52 0%, #C4856A 100%)" }}
        >
          {isGenerating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
          {isGenerating ? progressText : "生成整套試穿結果"}
        </button>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 lg:col-start-2">{error}</p>}
        {error && jobId && <button type="button" onClick={retryJob} disabled={isGenerating} className="rounded-xl border border-[#C4A898] px-4 py-2 text-sm text-[#8B3A52] disabled:opacity-50 lg:col-start-2">重試失敗階段</button>}

        {resultUrl && !isResultOpen && (
          <section className="rounded-2xl bg-[#FDFAF6] p-4 shadow-sm lg:col-start-2">
            <p className="text-sm font-medium text-[#5A3A2E]">整套試穿已完成</p>
            <button type="button" onClick={() => setIsResultOpen(true)} className="mt-3 w-full rounded-xl bg-[#8B3A52] px-4 py-3 text-sm font-medium text-white">重新查看試穿結果</button>
          </section>
        )}
      </main>
      {resultUrl && isResultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsResultOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="tryon-result-title" className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[#FDFAF6] shadow-2xl sm:rounded-3xl">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#EDE4D8] px-4 py-3 sm:px-6">
              <div>
                <h2 id="tryon-result-title" className="text-base font-semibold text-[#2C1810] sm:text-lg">{progressText === "整套試穿完成" ? "整套試穿結果" : "目前生成結果"}</h2>
                <p className="mt-0.5 text-xs text-[#8A6F5E]">可放大查看，確認整套穿搭效果</p>
              </div>
              <button type="button" aria-label="關閉試穿結果" onClick={() => setIsResultOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#5A3A2E] hover:bg-[#F4E9E2]"><X size={21} /></button>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#F3ECE5] p-2 sm:p-4">
              <img src={resultUrl} alt="虛擬試衣結果" className="max-h-[calc(94dvh-150px)] max-w-full rounded-xl object-contain" />
            </div>
            <footer className="flex shrink-0 flex-col gap-2 border-t border-[#EDE4D8] p-3 sm:flex-row sm:justify-end sm:px-6">
              {savedMessage && <p role="status" className="self-center text-center text-xs text-[#8A6F5E] sm:mr-auto">{savedMessage}</p>}
              <button type="button" onClick={saveFavorite} disabled={isFavorite} className="min-h-11 rounded-xl bg-[#F4E9E2] px-5 py-2.5 text-sm font-medium text-[#8B3A52] disabled:opacity-60">{isFavorite ? "已收藏這套穿搭" : "收藏這套穿搭"}</button>
              <button type="button" onClick={() => setIsResultOpen(false)} className="min-h-11 rounded-xl bg-[#8B3A52] px-5 py-2.5 text-sm font-medium text-white">返回試衣頁</button>
            </footer>
          </section>
        </div>
      )}
      <div className="mobile-safe-x mobile-safe-bottom shrink-0 bg-[#F7F2EC] pt-3 pb-3 shadow-[0_-8px_24px_rgba(44,24,16,0.06)] lg:hidden">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !humanPhoto || !selectedTop || !selectedBottom}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: "linear-gradient(135deg, #8B3A52 0%, #C4856A 100%)" }}
        >
          {isGenerating ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
          {isGenerating ? progressText : "生成整套試穿結果"}
        </button>
      </div>
    </div>
  );
}
