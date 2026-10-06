import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ChevronDown, LocateFixed, MapPin, Navigation, Recycle, Phone } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { api, resolveAssetUrl } from "../../api/api";

type WardrobeItem = { id: number; date: string; imageUrl: string; category: "top" | "bottom"; dominantColor: string; recyclingStatus?: "active" | "planned" | "recycled"; recycleSite?: Site | null; recyclingPlannedAt?: string | null; recycledAt?: string | null };
type Site = { id: string; district: string; neighborhood: string; address: string; organization: string; phone: string; latitude: number; longitude: number; distance_km?: number };
type Props = { wardrobe: WardrobeItem[]; onBack: () => void; onChanged: () => void };
type Tab = "review" | "planned" | "recycled";
type RoutePreview = { coordinates: [number, number][]; distance: number; duration: number; destination: Site; steps: string[] };
type OsrmStep = { name?: string; distance: number; maneuver?: { type?: string; modifier?: string } };

const colors = { ink: "#2C1810", muted: "#715849", rose: "#8B3A52", paper: "#FDFAF6", line: "rgba(44,24,16,.11)", pale: "#F3EAE3" };

function DistrictSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useMemo(() => [{ value: "", label: "選擇行政區" }, ...options.map(option => ({ value: option, label: option }))], [options]);
  const selectedIndex = Math.max(0, items.findIndex(item => item.value === value));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("focusin", closeOutside); };
  }, [open]);

  function selectItem(index: number) {
    const item = items[index];
    if (item) onChange(item.value);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setActiveIndex(selectedIndex); setOpen(true); }
      else setActiveIndex(current => (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault(); selectItem(activeIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); setOpen(false);
    }
  }

  return <div ref={root} className="relative w-full sm:w-auto sm:min-w-56">
    <button ref={trigger} type="button" role="combobox" aria-label="選擇行政區" aria-haspopup="listbox" aria-expanded={open} aria-controls="recycling-district-listbox" aria-activedescendant={open ? `recycling-district-option-${activeIndex}` : undefined} onClick={() => { setOpen(current => !current); setActiveIndex(selectedIndex); }} onKeyDown={handleKeyDown} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] font-medium shadow-sm transition hover:bg-white focus-visible:border-[#8B3A52] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8B3A52]/10" style={{ borderColor: colors.line, color: value ? colors.ink : colors.muted, background: "#FFFEFC" }}><span className="truncate">{items[selectedIndex]?.label || "選擇行政區"}</span><ChevronDown size={18} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} color={colors.rose}/></button>
    {open && <div id="recycling-district-listbox" role="listbox" aria-label="行政區選項" className="absolute left-0 top-full z-[1100] mt-2 max-h-[min(60vh,360px)] w-full min-w-56 overflow-y-auto rounded-2xl border p-1.5 shadow-xl" style={{ borderColor: "#E7D8CF", background: "#FFFEFC" }}>{items.map((item, index) => <button key={item.value || "all"} id={`recycling-district-option-${index}`} type="button" role="option" aria-selected={value === item.value} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectItem(index)} className="flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left text-sm transition" style={{ color: value === item.value ? colors.rose : colors.muted, background: index === activeIndex ? "#F7ECE9" : value === item.value ? colors.pale : "transparent", fontWeight: value === item.value ? 600 : 400 }}>{item.label}{value === item.value && <span aria-hidden="true" className="ml-auto">✓</span>}</button>)}</div>}
  </div>;
}

function describeRouteStep(step: OsrmStep) {
  const maneuver = step.maneuver || {};
  const direction: Record<string, string> = { left: "左轉", right: "右轉", straight: "直行", "slight left": "稍向左轉", "slight right": "稍向右轉", "sharp left": "大幅左轉", "sharp right": "大幅右轉", uturn: "迴轉" };
  const action: Record<string, string> = { depart: "出發", arrive: "抵達目的地", turn: direction[maneuver.modifier || ""] || "轉彎", continue: "繼續前進", merge: "匯入道路", fork: "依路線行駛", roundabout: "進入圓環", "on ramp": "進入匝道", "off ramp": "離開匝道", "end of road": direction[maneuver.modifier || ""] || "依道路方向前進", notification: "依路線行駛", "new name": "繼續前進" };
  const name = step.name?.trim();
  const distance = step.distance >= 1000 ? `${(step.distance / 1000).toFixed(1)} 公里` : `${Math.max(1, Math.round(step.distance))} 公尺`;
  return `${action[maneuver.type || ""] || "繼續前進"}${name ? `，沿 ${name}` : ""}（${distance}）`;
}

function RecyclingMap({ location, sites, routePreview, onNavigate }: { location: { latitude: number; longitude: number } | null; sites: Site[]; routePreview: RoutePreview | null; onNavigate: (site: Site) => void }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let resizeTimer: number | undefined;
    let disposed = false;

    async function mountMap() {
      const leafletModule = await import("leaflet");
      if (disposed || !element.current) return;
      const L = leafletModule.default;
      const points = sites.filter(site => Number.isFinite(site.latitude) && Number.isFinite(site.longitude));
      const center: import("leaflet").LatLngExpression = location
        ? [location.latitude, location.longitude]
        : points.length ? [points[0].latitude, points[0].longitude] : [25.033, 121.5654];
      map = L.map(element.current, { center, zoom: 13, scrollWheelZoom: false, zoomControl: true, attributionControl: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.control.attribution({ prefix: false }).addAttribution("回收據點：臺北市政府公開資料").addTo(map);
      const bounds: import("leaflet").LatLngExpression[] = [];
      if (routePreview?.coordinates.length) {
        L.polyline(routePreview.coordinates, { color: "#3478F6", weight: 6, opacity: 0.88, lineCap: "round", lineJoin: "round" }).addTo(map);
        bounds.push(...routePreview.coordinates);
      }
      const userIcon = L.divIcon({
        className: "recycling-user-marker",
        html: '<span style="display:block;width:22px;height:22px;border:4px solid white;border-radius:50%;background:#3478F6;box-shadow:0 1px 8px #3338"></span>',
        iconSize: [26, 26], iconAnchor: [13, 13],
      });
      const siteIcon = L.divIcon({
        className: "recycling-site-marker",
        html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:#8B3A52;box-shadow:0 1px 7px #3338"></span>',
        iconSize: [22, 22], iconAnchor: [11, 11],
      });
      if (location) {
        const current: import("leaflet").LatLngExpression = [location.latitude, location.longitude];
        const userMarker = L.marker(current, { icon: userIcon, title: "你目前的位置", zIndexOffset: 1000 }).addTo(map);
        const userPopup = document.createElement("div");
        const userTitle = document.createElement("strong"); userTitle.textContent = "你目前的位置";
        const userCoordinates = document.createElement("p"); userCoordinates.textContent = `${location.latitude.toFixed(5)}°, ${location.longitude.toFixed(5)}°`;
        userPopup.append(userTitle, userCoordinates);
        userMarker.bindTooltip("你的位置", { direction: "top", offset: [0, -8] }).bindPopup(userPopup);
        bounds.push(current);
      }
      points.forEach(site => {
        const marker = L.marker([site.latitude, site.longitude], { icon: siteIcon, title: `${site.district} ${site.address}` }).addTo(map!);
        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `${site.district}${site.neighborhood ? `・${site.neighborhood}` : ""} 舊衣回收據點`;
        const address = document.createElement("p"); address.textContent = site.address;
        popup.append(title, address);
        if (site.organization) { const organization = document.createElement("p"); organization.textContent = site.organization; popup.append(organization); }
        if (site.phone) { const phone = document.createElement("p"); phone.textContent = `電話：${site.phone}`; popup.append(phone); }
        const directions = document.createElement("button");
        directions.type = "button";
        directions.textContent = "在系統內規劃路線";
        directions.style.cssText = "display:inline-block;margin-top:8px;border:0;border-radius:8px;padding:7px 10px;background:#8B3A52;color:white;font-weight:600;cursor:pointer";
        directions.addEventListener("click", () => onNavigate(site));
        popup.append(directions);
        marker.bindPopup(popup);
        bounds.push([site.latitude, site.longitude]);
      });
      if (routePreview?.coordinates.length) map.fitBounds(L.latLngBounds(routePreview.coordinates).pad(0.12), { maxZoom: 16 });
      else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds).pad(0.16), { maxZoom: location ? 15 : 14 });
      resizeTimer = window.setTimeout(() => map?.invalidateSize(), 120);
    }

    void mountMap();
    return () => { disposed = true; if (resizeTimer !== undefined) window.clearTimeout(resizeTimer); map?.remove(); };
  }, [location, sites, routePreview, onNavigate]);

  return <div ref={element} role="application" aria-label="目前位置與舊衣回收據點座標分布圖" className="recycling-coordinate-map w-full overflow-hidden rounded-2xl" style={{ minHeight: 360, height: "clamp(360px, 55vh, 620px)", backgroundColor: "#E9EEE8", backgroundImage: "linear-gradient(rgba(109,132,114,.13) 1px, transparent 1px), linear-gradient(90deg, rgba(109,132,114,.13) 1px, transparent 1px), radial-gradient(ellipse at 45% 55%, rgba(255,255,255,.72), transparent 68%)", backgroundSize: "56px 56px, 56px 56px, 100% 100%", zIndex: 0 }} />;
}

export default function RecyclingScreen({ wardrobe, onBack, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("review");
  const [district, setDistrict] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [showDistantSites, setShowDistantSites] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeLoadingSite, setRouteLoadingSite] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [records, setRecords] = useState<WardrobeItem[]>([]);

  const loadSites = useCallback(async (nextDistrict = district, nextLocation = location) => {
    setLoading(true); setError("");
    try {
      const result = await api.getRecyclingSites({ ...(nextLocation || {}), district: nextDistrict || undefined });
      setSites((result.data || []).map((site: Site) => ({ ...site })));
      setDistricts(result.districts || []);
      setStale(!!result.stale);
    } catch (e) { setError(e instanceof Error ? e.message : "回收據點載入失敗"); }
    finally { setLoading(false); }
  }, [district, location]);

  const loadRecords = useCallback(async () => {
    try { const result = await api.getRecyclingItems(); setRecords((result.data || []).map((item: any) => ({ id: item.item_id, date: item.date, imageUrl: resolveAssetUrl(item.image_url), category: item.tag, dominantColor: "", recyclingStatus: item.recycling_status, recycleSite: item.recycle_site, recyclingPlannedAt: item.recycling_planned_at, recycledAt: item.recycled_at }))); }
    catch (e) { setError(e instanceof Error ? e.message : "回收清單載入失敗"); }
  }, []);

  useEffect(() => { void loadSites(); void loadRecords(); }, []);
  useEffect(() => { setRoutePreview(null); }, [district]);

  const activeItems = wardrobe.filter(item => (item.recyclingStatus || "active") === "active");
  const planned = useMemo(() => records.filter(item => item.recyclingStatus === "planned"), [records]);
  const recycled = useMemo(() => records.filter(item => item.recyclingStatus === "recycled"), [records]);

  const nearestSite = sites[0];
  // The dataset contains Taipei facilities only; 30 km is a UX warning threshold, not an administrative boundary.
  const isOutsideDatasetArea = !!location && nearestSite?.distance_km !== undefined && nearestSite.distance_km > 30;
  const mapSites = isOutsideDatasetArea && !showDistantSites ? [] : sites;

  const startNavigation = useCallback(async (site: Site) => {
    setRouteLoadingSite(site.id);
    setError("");
    setRoutePreview(null);
    try {
      let origin = location;
      if (!origin) {
        if (!navigator.geolocation) throw new Error("瀏覽器不支援定位，無法取得路線起點");
        origin = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => navigator.geolocation.getCurrentPosition(
          position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          () => reject(new Error("無法取得目前位置，請允許瀏覽器定位後再試")),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        ));
        setLocation(origin);
      }
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${site.longitude},${site.latitude}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("路線服務暫時無法連線，請稍後重試");
      const result = await response.json();
      const route = result.routes?.[0];
      if (result.code !== "Ok" || !route?.geometry?.coordinates?.length) throw new Error("找不到可行駛的道路路線，請確認據點座標後再試");
      const steps = (route.legs || []).flatMap((leg: { steps?: OsrmStep[] }) => leg.steps || []).map(describeRouteStep);
      setRoutePreview({ coordinates: route.geometry.coordinates.map(([longitude, latitude]: [number, number]) => [latitude, longitude] as [number, number]), distance: route.distance, duration: route.duration, destination: site, steps });
      window.setTimeout(() => document.getElementById("recycling-map-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "路線規劃失敗");
    } finally {
      setRouteLoadingSite(null);
    }
  }, [location]);

  function useMyLocation() {
    if (!navigator.geolocation) { setError("這個瀏覽器不支援定位，請改用行政區查詢"); return; }
    setLoading(true); setError("");
    navigator.geolocation.getCurrentPosition(position => {
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(next); setLocationAccuracy(position.coords.accuracy); setDistrict(""); setSites([]); setShowDistantSites(false); setRoutePreview(null); void loadSites("", next);
    }, () => { setLoading(false); setError("無法取得定位。請允許瀏覽器使用位置，或改用行政區查詢"); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  async function plan(itemId: number, site: Site) {
    setBusyId(itemId); setError("");
    try { await api.planRecycling(itemId, site.id); await loadRecords(); onChanged(); setSelectedItem(null); setTab("planned"); }
    catch (e) { setError(e instanceof Error ? e.message : "加入待回收清單失敗"); }
    finally { setBusyId(null); }
  }

  async function update(action: "cancel" | "complete", itemId: number) {
    setBusyId(itemId); setError("");
    try { await api.updateRecyclingItem(action, itemId); await loadRecords(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "更新回收狀態失敗"); }
    finally { setBusyId(null); }
  }

  const actionButton = (label: string, onClick: () => void, secondary = false) => <button type="button" onClick={onClick} className="min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B3A52] sm:w-auto" style={{ color: secondary ? colors.ink : "white", background: secondary ? colors.pale : colors.rose }}>{label}</button>;
  const directionsLink = (site: Site) => <button type="button" disabled={routeLoadingSite !== null} onClick={() => void startNavigation(site)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:bg-[#F8F3EE] disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B3A52] sm:w-auto" style={{ color: colors.rose, borderColor: "rgba(139,58,82,.25)", background: colors.paper }} aria-label={`在系統內規劃前往${site.district}${site.address}的路線`}><Navigation size={17}/>{routeLoadingSite === site.id ? "規劃中…" : "系統內導航"}</button>;
  const itemCard = (item: WardrobeItem, status?: "planned" | "recycled") => <article key={item.id} className="flex gap-4 rounded-2xl border p-4" style={{ background: colors.paper, borderColor: colors.line }}>
    <img src={item.imageUrl} alt={item.category === "top" ? "上衣" : "下著"} className="h-28 w-24 rounded-xl object-cover" style={{ background: colors.pale }} />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><strong style={{ color: colors.ink }}>{item.category === "top" ? "上衣" : "下著"}</strong><span className="rounded-full px-2.5 py-1 text-xs" style={{ color: status === "recycled" ? "#52745A" : status === "planned" ? "#8B5E30" : colors.muted, background: status === "recycled" ? "#E5F0E6" : status === "planned" ? "#F8EEDC" : colors.pale }}>{status === "recycled" ? "已回收" : status === "planned" ? "待回收 · 不可試穿" : "衣櫥中"}</span></div>
      <p className="mt-1 text-sm" style={{ color: colors.muted }}>加入日期：{item.date}</p>
      {status && item.recycleSite && <div className="mt-2 space-y-1 text-sm" style={{ color: colors.muted }}><p className="flex gap-1"><MapPin size={15} className="mt-0.5 shrink-0" />{item.recycleSite.district}・{item.recycleSite.address}</p>{item.recycleSite.organization && <p>{item.recycleSite.organization}</p>}{item.recycleSite.phone && <a className="inline-flex items-center gap-1 underline" href={`tel:${item.recycleSite.phone}`}><Phone size={14}/>{item.recycleSite.phone}</a>}{status === "planned" && Number.isFinite(item.recycleSite.latitude) && Number.isFinite(item.recycleSite.longitude) && <div className="pt-2">{directionsLink(item.recycleSite)}</div>}</div>}
      {status === "planned" && <div className="mt-3 flex flex-wrap gap-2">{actionButton(busyId === item.id ? "處理中…" : "已送達，完成回收", () => void update("complete", item.id))}{actionButton("取消安排", () => void update("cancel", item.id), true)}</div>}
      {status === "recycled" && <p className="mt-2 text-sm" style={{ color: colors.muted }}>完成日期：{item.recycledAt ? new Date(item.recycledAt).toLocaleDateString("zh-TW") : "—"}</p>}
    </div>
  </article>;

  return <div className="flex h-full flex-col" style={{ background: "#F8F3EE" }}>
    <header className="mobile-safe-x mobile-safe-top flex shrink-0 items-center gap-3 border-b px-3 py-4 sm:px-5 sm:py-5 md:px-8" style={{ borderColor: colors.line }}>
      <button type="button" onClick={onBack} aria-label="返回" className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: colors.pale }}><ArrowLeft size={19}/></button>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold" style={{ color: colors.ink }}>衣物回收</h1><p className="text-sm" style={{ color: colors.muted }}>整理衣櫥，查找附近的舊衣回收據點</p></div>
      <Recycle size={23} color={colors.rose}/>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-7">
      <div className="mx-auto max-w-6xl">
        <div role="tablist" aria-label="衣物回收清單" className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border p-1.5 shadow-sm" style={{ borderColor: colors.line, background: colors.paper }}>{([["review", `檢查衣櫥 (${activeItems.length})`], ["planned", `待回收 (${planned.length})`], ["recycled", `已完成 (${recycled.length})`]] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)} className="min-h-11 rounded-xl px-1.5 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm" style={{ background: tab === key ? colors.rose : "transparent", color: tab === key ? "white" : colors.muted }}>{label}</button>)}</div>
        {error && <div role="alert" className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE8E5", color: "#8D3028" }}>{error}</div>}
        {stale && <p className="mb-3 rounded-xl px-4 py-3 text-sm" style={{ background: "#FFF3DA", color: "#805A20" }}>目前無法連線到資料平台，顯示最近一次取得的據點資料。</p>}
        {tab === "review" && <>
          <section className="mb-5 rounded-2xl border p-4 shadow-sm sm:p-5 md:p-6" style={{ borderColor: colors.line, background: colors.paper }}>
            <h2 className="font-semibold" style={{ color: colors.ink }}>尋找回收據點</h2><p className="mt-1 text-sm" style={{ color: colors.muted }}>選擇一件衣物後，可依所在位置或行政區查詢。據點資訊來自臺北市政府公開資料。</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">{actionButton(loading ? "查詢中…" : "使用目前位置", useMyLocation)}<DistrictSelect value={district} options={districts} onChange={nextDistrict => { setDistrict(nextDistrict); setLocation(null); setLocationAccuracy(null); setShowDistantSites(false); void loadSites(nextDistrict, null); }} /></div>
          </section>
          {location && <div role="status" aria-live="polite" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: isOutsideDatasetArea ? "#E8D5B6" : "#D5E2FA", background: isOutsideDatasetArea ? "#FFF8EA" : "#F1F6FF" }}>
            <div className="flex min-w-0 items-start gap-3"><LocateFixed size={20} color={isOutsideDatasetArea ? "#9B7137" : "#3478F6"} className="mt-0.5 shrink-0"/><div><p className="font-medium" style={{ color: colors.ink }}>{isOutsideDatasetArea ? "目前位置在資料涵蓋範圍外" : "已找到你的位置"}</p><p className="mt-0.5 text-sm" style={{ color: colors.muted }}>座標 {location.latitude.toFixed(5)}°、{location.longitude.toFixed(5)}°{locationAccuracy !== null ? `・定位精度約 ${Math.max(1, Math.round(locationAccuracy))} 公尺` : ""}</p>{isOutsideDatasetArea ? <p className="mt-1 max-w-3xl text-sm leading-relaxed" style={{ color: colors.muted }}>這份公開資料只收錄臺北市回收據點；最近的臺北市據點在{nearestSite?.district}，距離約 {nearestSite?.distance_km} 公里，因此不能視為你附近的回收點。</p> : nearestSite?.distance_km !== undefined && <p className="mt-1 text-sm" style={{ color: colors.muted }}>最近的回收據點：{nearestSite.district}・{nearestSite.address}（約 {nearestSite.distance_km} 公里）</p>}{isOutsideDatasetArea && <button type="button" onClick={() => setShowDistantSites(value => !value)} className="mt-2 text-sm font-medium underline underline-offset-2" style={{ color: colors.rose }}>{showDistantSites ? "隱藏臺北市據點" : "仍顯示臺北市據點位置"}</button>}</div></div>
            {actionButton(loading ? "更新中…" : "重新定位", useMyLocation, true)}
          </div>}
          <div className={(location || district) ? "grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,.85fr)] lg:items-start" : "space-y-4"}>
          {(location || district) && <section id="recycling-map-section" className="mb-6 min-w-0 overflow-hidden rounded-2xl border p-3 shadow-sm sm:p-4 lg:sticky lg:top-3 lg:p-5" style={{ background: colors.paper, borderColor: colors.line }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1"><div className="flex items-center gap-2"><MapPin size={19} color={colors.rose}/><h3 className="font-semibold" style={{ color: colors.ink }}>{isOutsideDatasetArea && !showDistantSites ? "你的位置（附近沒有資料涵蓋的據點）" : location ? "你的位置與回收據點" : `${district}回收據點位置`}</h3></div><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: colors.muted }}><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border-2 border-white bg-[#3478F6] shadow"/>你的位置</span>{(!isOutsideDatasetArea || showDistantSites) && <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border-2 border-white bg-[#8B3A52] shadow"/>臺北市回收據點</span>}{routePreview && <span className="inline-flex items-center gap-1.5"><i className="h-1 w-4 rounded bg-[#3478F6]"/>規劃路線</span>}</div></div>
            <RecyclingMap location={location} sites={mapSites} routePreview={routePreview} onNavigate={startNavigation}/>
            {routePreview && <div className="mt-4 rounded-2xl border p-4 sm:p-5" style={{ background: "#F1F6FF", borderColor: "#D5E2FA" }}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold" style={{ color: colors.ink }}>前往 {routePreview.destination.district}・{routePreview.destination.address}</p><p className="mt-1 text-sm" style={{ color: colors.muted }}>開車約 {(routePreview.distance / 1000).toFixed(1)} 公里・約 {Math.max(1, Math.round(routePreview.duration / 60))} 分鐘</p></div><button type="button" onClick={() => setRoutePreview(null)} className="min-h-10 rounded-lg px-3 text-sm font-semibold" style={{ color: colors.rose, background: colors.paper }}>清除路線</button></div>{routePreview.steps.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold" style={{ color: colors.rose }}>查看轉向步驟（{routePreview.steps.length}）</summary><ol className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">{routePreview.steps.map((step, index) => <li key={`${index}-${step}`} className="flex gap-3 rounded-xl px-3 py-2 text-sm" style={{ color: colors.ink, background: "rgba(255,255,255,.75)" }}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ background: "#D5E2FA", color: "#2459B8" }}>{index + 1}</span><span>{step}</span></li>)}</ol></details>}<p className="mt-3 text-xs leading-relaxed" style={{ color: colors.muted }}>這是開車路線預覽與轉向清單，不含即時語音導航或偏離路線後自動重算。</p></div>}
            <p className="mt-3 px-1 text-xs leading-relaxed sm:text-sm" style={{ color: colors.muted }}>可拖曳或縮放地圖，點選標記查看據點地址。街道底圖由 OpenStreetMap 提供；載入時會收到目前地圖範圍。按下「系統內導航」後，起點與目的地座標才會送到公開 OSRM 路由服務，路線會留在本頁顯示。</p>
          </section>}
          <section className="min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4" style={{ background: colors.paper, borderColor: colors.line }}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold" style={{ color: colors.ink }}>衣櫥單品</h3><p className="mt-1 text-sm" style={{ color: colors.muted }}>選擇單品後，再挑選回收據點。</p></div><span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: colors.rose, background: colors.pale }}>{activeItems.length} 件可安排</span></div>
          <div className="space-y-3">{activeItems.length ? activeItems.map(item => <div key={item.id} className="rounded-2xl border p-3 shadow-sm transition hover:shadow-md sm:p-4" style={{ background: colors.paper, borderColor: colors.line }}><div className="flex gap-3 sm:gap-4"><img src={item.imageUrl} alt={item.category === "top" ? "上衣" : "下著"} className="h-28 w-24 shrink-0 rounded-xl object-cover sm:h-32 sm:w-28"/><div className="min-w-0 flex-1"><div className="font-semibold" style={{ color: colors.ink }}>{item.category === "top" ? "上衣" : "下著"} <span className="text-xs font-normal" style={{ color: colors.muted }}>· 衣櫥中</span></div><p className="mt-1 text-sm leading-relaxed" style={{ color: colors.muted }}>選擇回收據點，安排後會移入「待回收」；送達後再確認完成。</p><button type="button" onClick={() => setSelectedItem(selectedItem === item.id ? null : item.id)} className="mt-3 min-h-10 w-full rounded-xl px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B3A52] sm:w-auto" style={{ background: colors.rose }}>{selectedItem === item.id ? "收起據點" : "選擇回收據點"}</button></div></div>
            {selectedItem === item.id && <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: colors.line }}>{!location && !district ? <p className="text-sm" style={{ color: colors.muted }}>請先使用目前位置或選擇行政區，再安排回收。</p> : loading && !sites.length ? <p className="text-sm" style={{ color: colors.muted }}>正在載入回收據點…</p> : <>{isOutsideDatasetArea && <p className="rounded-xl px-3 py-2 text-sm" style={{ color: "#805A20", background: "#FFF3DA" }}>以下都是臺北市據點，並非你所在地附近的回收點；請留意每個點標示的距離。</p>}{sites.length ? sites.map(site => <div key={site.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" style={{ background: "#F8F3EE" }}><div className="min-w-0 flex-1"><p className="text-sm font-medium" style={{ color: colors.ink }}>{site.district}{site.neighborhood ? `・${site.neighborhood}` : ""}{site.distance_km !== undefined ? `・${site.distance_km} 公里` : ""}</p><p className="text-sm" style={{ color: colors.muted }}>{site.address}</p>{site.organization && <p className="text-xs" style={{ color: colors.muted }}>{site.organization}{site.phone ? `｜${site.phone}` : ""}</p>}</div><div className="flex flex-wrap items-center gap-2">{directionsLink(site)}{actionButton(busyId === item.id ? "處理中…" : "安排回收", () => void plan(item.id, site))}</div></div>) : <p className="text-sm" style={{ color: colors.muted }}>沒有符合的據點，請更換行政區或稍後再試。</p>}</>}</div>}
          </div>) : <p className="rounded-2xl p-8 text-center" style={{ background: colors.paper, color: colors.muted }}>目前沒有可安排回收的衣物。</p>}</div>
          </section>
          <p className="mt-5 text-xs leading-relaxed" style={{ color: colors.muted }}>據點為公開資料所列設施；資料未提供即時營運狀態與收受條件，出發前建議先電話確認。</p>
          </div>
        </>}
        {tab === "planned" && <div className="space-y-3">{planned.length ? planned.map(item => itemCard(item, "planned")) : <p className="rounded-2xl p-8 text-center" style={{ background: colors.paper, color: colors.muted }}>尚無待回收衣物。你可以先在「檢查衣櫥」安排據點。</p>}</div>}
        {tab === "recycled" && <div className="space-y-3">{recycled.length ? recycled.map(item => itemCard(item, "recycled")) : <p className="rounded-2xl p-8 text-center" style={{ background: colors.paper, color: colors.muted }}>完成回收後，紀錄會保留在這裡。</p>}</div>}
      </div>
    </main>
  </div>;
}
