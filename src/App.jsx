import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";

const DB_ID = 1; // 단일 행으로 전체 데이터 관리

const storage = {
  get: async () => {
    try {
      const { data } = await supabase.from("maemae").select("data").eq("id", DB_ID).single();
      return data?.data ?? null;
    } catch { return null; }
  },
  set: async (value) => {
    const { error } = await supabase.from("maemae").upsert({ id: DB_ID, data: value });
    if (error) throw new Error(error.message);
  },
};

const LARGE_TAGS = ["종배", "시초매매", "장중매매", "스윙"];
const MEDIUM_TAGS = {
  "종배": ["상따", "양봉", "음봉", "기타"],
};
const LOSS_REASONS = ["신규주", "음봉 비중 오버", "추격매수", "뒷구간 하락"];
const NAV_TABS = [
  { id: "대시보드", icon: "📊" },
  { id: "매매일지", icon: "📋" },
  { id: "매매분석", icon: "📈" },
  { id: "강의록", icon: "📚" },
  { id: "자산/가계부", icon: "💰" }
];

const INIT_DATES = ["2026-06-01", "2026-05-31", "2026-05-30"];
const INIT_DATA = Object.fromEntries(INIT_DATES.map(d => [d, { scenarios: [], kakaoImages: [], teacherComment: "", trades: [] }]));
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const fmtDate = d => { const [y, m, day] = d.split("-"); return `${y}년 ${+m}월 ${+day}일`; };
const truncName = n => n?.length > 10 ? n.slice(0, 10) + "…" : n;
const fmtW = d => ["일","월","화","수","목","금","토"][new Date(d).getDay()];
const fmtMoney = n => `₩${Math.abs(n).toLocaleString()}`;
const readImg = (file, cb) => {
  if (!file?.type.startsWith("image/")) return;
  const r = new FileReader();
  r.onload = e => cb(e.target.result);
  r.onerror = () => console.error("이미지를 읽는 중 오류가 발생했습니다.");
  r.readAsDataURL(file);
};

const T = {
  bg: "linear-gradient(160deg, #0b0f1a 0%, #0e1220 60%, #0b0f1a 100%)",
  card: "#161b27", card2: "#0f1320", border: "#1e2538",
  input: "#191f2e", inputBd: "#263050", tabActive: "#2563eb",
  text: "#ccd3ec", sub: "#576080", green: "#1fca7d", red: "#e95c6e", blue: "#5b7cf8",
  profit: "#e95c6e", loss: "#5b7cf8",
};
const inp = { background: T.input, border: `1px solid ${T.inputBd}`, borderRadius: 8, padding: "10px 12px", color: T.text, fontSize: 14, fontWeight: 600, outline: "none", width: "100%", boxSizing: "border-box" };

const Btn = ({ variant = "primary", style: s = {}, children, ...rest }) => (
  <button style={{
    border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer", padding: "10px 18px",
    background: variant === "primary" ? T.tabActive : variant === "danger" ? "#b91c1c" : T.input,
    color: variant === "ghost" ? T.sub : "#fff",
    ...(variant === "ghost" && { border: `1px solid ${T.inputBd}` }), ...s
  }} {...rest}>{children}</button>
);

export default function App() {
  const [tab, setTab] = useState("대시보드");
  const [view, setView] = useState("list");
  const [selDate, setSelDate] = useState(null);
  const [data, setData] = useState(INIT_DATA);
  const [dates, setDates] = useState(INIT_DATES);
  const [trash, setTrash] = useState({});
  const [kakaoOpen, setKakaoOpen] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", returnRate: "", profit: "", tagLarge: "종배", tagMedium: "", tagSmall: "", lossReasons: [], chartImages: [], reason: "", reflection: "" });
  const [loaded, setLoaded] = useState(false);
  const [showScenarioInput, setShowScenarioInput] = useState(false);
  const [scenarioInput, setScenarioInput] = useState("");
  const [scenarioNameInput, setScenarioNameInput] = useState("");
  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(5);
  const [isDirty, setIsDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmPermDelete, setConfirmPermDelete] = useState(null);
  const [analysisTab, setAnalysisTab] = useState("시나리오");
  const [analysisPeriod, setAnalysisPeriod] = useState("일별");
  const [listView, setListView] = useState("일단위");
  const [listSearch, setListSearch] = useState("");
  const [dashPeriod, setDashPeriod] = useState("전체");
  const [dashStart, setDashStart] = useState("");
  const [dashEnd, setDashEnd] = useState("");
  const [dashCalOpen, setDashCalOpen] = useState(null); // "start" | "end" | null
  const [dashCalYear, setDashCalYear] = useState(new Date().getFullYear());
  const [dashCalMonth, setDashCalMonth] = useState(new Date().getMonth());
  const [editForms, setEditForms] = useState({});
  const [formChartIdx, setFormChartIdx] = useState(0);
  const [editChartIdx, setEditChartIdx] = useState({});
  const editChartRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);
  const [selectedKakaoImg, setSelectedKakaoImg] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const importRef = useRef(null);

  const kakaoRef = useRef(null);
  const chartRef = useRef(null);

  // 불러오기 + 3일 지난 항목 자동 정리
  useEffect(() => {
    (async () => {
      try {
        const p = await storage.get();
        if (p) {
          if (p.data) setData(p.data);
          if (p.dates) setDates(p.dates);
          if (p.trash) {
            const now = Date.now();
            const cleaned = Object.fromEntries(
              Object.entries(p.trash).filter(([, v]) => now - v.deletedAt < THREE_DAYS_MS)
            );
            setTrash(cleaned);
            if (Object.keys(cleaned).length !== Object.keys(p.trash).length && p.data && p.dates) {
              await storage.set({ data: p.data, dates: p.dates, trash: cleaned });
            }
          }
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const onPaste = e => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (view === "list") {
        handleImportImage(file);
      } else if (view === "journal") {
        if (showForm) {
          readImg(file, src => setForm(p => ({ ...p, chartImages: [...p.chartImages, src] })));
        } else if (expandedId !== null) {
          readImg(file, src => setEditForms(p => ({
            ...p,
            [expandedId]: { ...(p[expandedId] || {}), chartImages: [...(p[expandedId]?.chartImages || []), src] }
          })));
        } else if (selDate) {
          readImg(file, src => { setData(p => ({ ...p, [selDate]: { ...p[selDate], kakaoImages: [...(p[selDate]?.kakaoImages || []), src] } })); setIsDirty(true); });
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [view, showForm, selDate, parsing, expandedId]);

  const j = selDate ? data[selDate] : null;

  const save = async (d, dl, tr) => {
    await storage.set({ data: d, dates: dl, trash: tr });
  };

  const upd = u => { if (!selDate) return; setData(p => ({ ...p, [selDate]: { ...p[selDate], ...u } })); setIsDirty(true); };

  const openDate = date => {
    setSelDate(date); setView("journal"); setShowForm(false); setExpandedId(null); setIsDirty(false); setSaveMsg("");
    setData(p => p[date] ? p : { ...p, [date]: { scenarios: [], kakaoImages: [], teacherComment: "", trades: [] } });
  };

  const goBack = () => {
    if (isDirty && !window.confirm("저장하지 않은 내용이 있어요.\n저장하지 않고 나가시겠어요?")) return;
    setView("list"); setShowForm(false); setIsDirty(false); setSaveMsg("");
  };

  const handleSave = async () => {
    try {
      await save(data, dates, trash);
      setSaveMsg("저장됐어요 ✓"); setIsDirty(false);
    } catch { setSaveMsg("저장 실패 ✕"); }
    setTimeout(() => setSaveMsg(""), 2500);
  };

  // 휴지통으로 이동
  const deleteDate = async () => {
    const journalData = data[selDate];
    const newDates = dates.filter(d => d !== selDate);
    const newData = { ...data }; delete newData[selDate];
    const newTrash = { ...trash, [selDate]: { deletedAt: Date.now(), journal: journalData } };
    setDates(newDates); setData(newData); setTrash(newTrash);
    setShowDeleteConfirm(false); setView("list"); setIsDirty(false);
    try { await save(newData, newDates, newTrash); } catch { alert("삭제 저장 중 오류가 발생했어요. 다시 시도해주세요."); }
  };

  // 복원
  const restoreDate = async (date) => {
    const item = trash[date];
    const newDates = [...dates, date].sort((a, b) => b.localeCompare(a));
    const newData = { ...data, [date]: item.journal };
    const newTrash = { ...trash }; delete newTrash[date];
    setDates(newDates); setData(newData); setTrash(newTrash);
    try { await save(newData, newDates, newTrash); } catch { alert("복원 저장 중 오류가 발생했어요. 다시 시도해주세요."); }
  };

  // 영구 삭제
  const permanentDelete = async (date) => {
    const newTrash = { ...trash }; delete newTrash[date];
    setTrash(newTrash); setConfirmPermDelete(null);
    try { await save(data, dates, newTrash); } catch { alert("삭제 저장 중 오류가 발생했어요. 다시 시도해주세요."); }
  };

  const selectCalDate = (y, m, d) => {
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!dates.includes(dateStr)) {
      setDates(p => [...p, dateStr].sort((a, b) => b.localeCompare(a)));
      setData(p => ({ ...p, [dateStr]: { scenarios: [], kakaoImages: [], teacherComment: "", trades: [] } }));
    }
    setShowCal(false); openDate(dateStr);
  };

  const saveTrade = () => {
    if (!form.name.trim()) return;
    upd({ trades: [...(j?.trades || []), { id: Date.now(), name: form.name.trim(), returnRate: parseFloat(form.returnRate) || 0, profit: parseInt(form.profit.replace(/[^0-9-]/g, "")) || 0, tagLarge: form.tagLarge, tagMedium: form.tagMedium, tagSmall: form.tagSmall, lossReasons: form.lossReasons, chartImages: form.chartImages, reason: form.reason, reflection: form.reflection }] });
    setForm({ name: "", returnRate: "", profit: "", tagLarge: "종배", tagMedium: "", tagSmall: "", lossReasons: [], chartImages: [], reason: "", reflection: "" });
    setFormChartIdx(0);
    setShowForm(false);
  };

  const cardStyle = (e = {}) => ({ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, marginBottom: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.25)", ...e });
  const hdStyle = (e = {}) => ({ padding: "13px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, ...e });

  const getTimeLeft = (deletedAt) => {
    const msLeft = (deletedAt + THREE_DAYS_MS) - Date.now();
    if (msLeft <= 0) return "곧 삭제";
    const h = Math.ceil(msLeft / (60 * 60 * 1000));
    if (h < 24) return `${h}시간 후 자동 삭제`;
    return `${Math.ceil(msLeft / (24 * 60 * 60 * 1000))}일 후 자동 삭제`;
  };

  // ──────────── MODALS ────────────
  const renderCalendar = () => {
    if (!showCal) return null;
    const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
    const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevDays = new Date(calYear, calMonth, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);
    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, type: "prev" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, type: "cur" });
    const rem = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
    for (let d = 1; d <= rem; d++) cells.push({ day: d, type: "next" });
    const prevMonth = () => calMonth === 0 ? (setCalYear(y => y - 1), setCalMonth(11)) : setCalMonth(m => m - 1);
    const nextMonth = () => calMonth === 11 ? (setCalYear(y => y + 1), setCalMonth(0)) : setCalMonth(m => m + 1);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowCal(false)}>
        <div style={{ background: "#1a1f30", borderRadius: 16, border: `1px solid ${T.border}`, padding: "20px", width: 320, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{calYear}년 {MONTHS[calMonth]}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 20, padding: "2px 8px", lineHeight: 1 }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
            {DAYS.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, padding: "4px 0", color: i === 0 ? T.red : i === 6 ? T.blue : T.sub }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px 2px" }}>
            {cells.map((cell, i) => {
              if (cell.type !== "cur") return <div key={i} style={{ textAlign: "center", padding: "9px 0", fontSize: 13, color: "#252d45" }}>{cell.day}</div>;
              const ds = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}`;
              const hasEntry = dates.includes(ds); const isToday = ds === today;
              const dow = (firstDow + cell.day - 1) % 7;
              return (
                <div key={i} onClick={() => selectCalDate(calYear, calMonth, cell.day)}
                  style={{ textAlign: "center", padding: "9px 0", fontSize: 13, cursor: "pointer", borderRadius: 8, position: "relative", fontWeight: hasEntry || isToday ? 700 : 400, color: isToday ? "#fff" : dow === 0 ? T.red : dow === 6 ? T.blue : T.text, background: isToday ? T.tabActive : hasEntry ? "#1c2840" : "transparent" }}>
                  {cell.day}
                  {hasEntry && !isToday && <div style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: T.green }} />}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button onClick={() => setShowCal(false)} style={{ background: "none", border: `1px solid ${T.inputBd}`, borderRadius: 8, padding: "8px 24px", color: T.sub, cursor: "pointer", fontSize: 13 }}>닫기</button>
          </div>
        </div>
      </div>
    );
  };

  const renderTrash = () => {
    if (!showTrash) return null;
    const trashDates = Object.keys(trash).sort((a, b) => b.localeCompare(a));
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setShowTrash(false); setConfirmPermDelete(null); }}>
        <div style={{ background: "#1a1f30", borderRadius: 16, border: `1px solid ${T.border}`, width: 380, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🗑️</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>휴지통</span>
              <span style={{ fontSize: 11, color: T.sub }}>3일 후 자동 삭제</span>
            </div>
            <button onClick={() => { setShowTrash(false); setConfirmPermDelete(null); }} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 16px 16px" }}>
            {trashDates.length === 0
              ? <div style={{ textAlign: "center", color: T.sub, padding: "40px 0", fontSize: 13 }}>휴지통이 비어있어요 🙂</div>
              : trashDates.map(date => {
                const item = trash[date];
                const trades = item.journal?.trades || [];
                const isPerm = confirmPermDelete === date;
                return (
                  <div key={date} style={{ background: T.card2, borderRadius: 10, border: `1px solid ${T.border}`, padding: "14px 16px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 3 }}>{fmtDate(date)}</div>
                        <div style={{ fontSize: 11, color: T.sub }}>매매 {trades.length}건</div>
                      </div>
                      <div style={{ fontSize: 11, color: "#e9956e", fontWeight: 600 }}>{getTimeLeft(item.deletedAt)}</div>
                    </div>
                    {isPerm
                      ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: T.sub, flex: 1 }}>정말 영구 삭제할까요?</span>
                          <button onClick={() => permanentDelete(date)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#b91c1c", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>확인</button>
                          <button onClick={() => setConfirmPermDelete(null)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${T.inputBd}`, background: "none", color: T.sub, fontSize: 13, cursor: "pointer" }}>취소</button>
                        </div>
                      : <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => restoreDate(date)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${T.inputBd}`, background: "none", color: T.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>복원</button>
                          <button onClick={() => setConfirmPermDelete(date)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: "#1f0d0d", color: T.red, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>영구 삭제</button>
                        </div>}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  };

  // ──────────── DASH CALENDAR ────────────
  const renderDashCalendar = () => {
    if (!dashCalOpen) return null;
    const DAYS = ["일","월","화","수","목","금","토"];
    const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
    const firstDow = new Date(dashCalYear, dashCalMonth, 1).getDay();
    const daysInMonth = new Date(dashCalYear, dashCalMonth + 1, 0).getDate();
    const prevDays = new Date(dashCalYear, dashCalMonth, 0).getDate();
    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, type: "prev" });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, type: "cur" });
    const rem = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
    for (let d = 1; d <= rem; d++) cells.push({ day: d, type: "next" });
    const prevMonth = () => dashCalMonth === 0 ? (setDashCalYear(y => y-1), setDashCalMonth(11)) : setDashCalMonth(m => m-1);
    const nextMonth = () => dashCalMonth === 11 ? (setDashCalYear(y => y+1), setDashCalMonth(0)) : setDashCalMonth(m => m+1);
    const selectDate = (d) => {
      const ds = `${dashCalYear}-${String(dashCalMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (dashCalOpen === "start") { setDashStart(ds); if (dashEnd && ds > dashEnd) setDashEnd(""); }
      else { setDashEnd(ds); if (dashStart && ds < dashStart) setDashStart(""); }
      setDashCalOpen(null);
    };
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setDashCalOpen(null)}>
        <div style={{ background:"#1a1f30", borderRadius:16, border:`1px solid ${T.border}`, padding:"20px", width:320, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign:"center", fontSize:13, fontWeight:600, color:T.blue, marginBottom:12 }}>
            {dashCalOpen === "start" ? "🗓 시작일 선택" : "🗓 종료일 선택"}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <button onClick={prevMonth} style={{ background:"none", border:"none", color:T.sub, cursor:"pointer", fontSize:20, padding:"2px 8px", lineHeight:1 }}>‹</button>
            <span style={{ fontWeight:700, fontSize:16, color:T.text }}>{dashCalYear}년 {MONTHS[dashCalMonth]}</span>
            <button onClick={nextMonth} style={{ background:"none", border:"none", color:T.sub, cursor:"pointer", fontSize:20, padding:"2px 8px", lineHeight:1 }}>›</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>
            {DAYS.map((d,i) => <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, padding:"4px 0", color:i===0?T.red:i===6?T.blue:T.sub }}>{d}</div>)}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"3px 2px" }}>
            {cells.map((cell, i) => {
              if (cell.type !== "cur") return <div key={i} style={{ textAlign:"center", padding:"9px 0", fontSize:13, color:"#252d45" }}>{cell.day}</div>;
              const ds = `${dashCalYear}-${String(dashCalMonth+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}`;
              const isStart = ds === dashStart, isEnd = ds === dashEnd;
              const inRange = dashStart && dashEnd && ds > dashStart && ds < dashEnd;
              const dow = (firstDow + cell.day - 1) % 7;
              return (
                <div key={i} onClick={() => selectDate(cell.day)}
                  style={{ textAlign:"center", padding:"9px 0", fontSize:13, cursor:"pointer", borderRadius:8, fontWeight:isStart||isEnd?700:400, color:isStart||isEnd?"#fff":dow===0?T.red:dow===6?T.blue:T.text, background:isStart||isEnd?T.tabActive:inRange?"#1c2840":"transparent" }}>
                  {cell.day}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:16, textAlign:"center" }}>
            <button onClick={() => setDashCalOpen(null)} style={{ background:"none", border:`1px solid ${T.inputBd}`, borderRadius:8, padding:"8px 24px", color:T.sub, cursor:"pointer", fontSize:13 }}>닫기</button>
          </div>
        </div>
      </div>
    );
  };

  // ──────────── DASHBOARD ────────────
  const renderDashboard = () => {
    const all = [];
    dates.forEach(d => (data[d]?.trades || []).forEach(t => all.push({ ...t, date: d })));
    const now = new Date();
    const filtered = (() => {
      if (dashPeriod === "이번달") return all.filter(t => { const [y,m] = t.date.split("-"); return +y === now.getFullYear() && +m === now.getMonth()+1; });
      if (dashPeriod === "지난달") { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return all.filter(t => { const [y,m] = t.date.split("-"); return +y === d.getFullYear() && +m === d.getMonth()+1; }); }
      if (dashPeriod === "최근3개월") { const ago = new Date(now); ago.setMonth(now.getMonth()-3); return all.filter(t => t.date >= ago.toISOString().slice(0,10)); }
      if (dashPeriod === "직접입력" && dashStart && dashEnd) return all.filter(t => t.date >= dashStart && t.date <= dashEnd);
      return all;
    })();
    const totalProfit = filtered.reduce((s, t) => s + t.profit, 0);
    const wins = filtered.filter(t => t.returnRate > 0).length;
    const winRate = filtered.length > 0 ? (wins / filtered.length * 100).toFixed(1) : "0.0";
    const monthlyProfit = all.filter(t => { const [y, m] = t.date.split("-"); return +y === now.getFullYear() && +m === now.getMonth() + 1; }).reduce((s, t) => s + t.profit, 0);
    // 종목별 수익금 합산
    const mergedMap = {};
    filtered.forEach(t => {
      if (!mergedMap[t.name]) mergedMap[t.name] = { name: t.name, profit: 0, tagMedium: t.tagMedium, date: t.date, count: 0 };
      mergedMap[t.name].profit += t.profit;
      mergedMap[t.name].count++;
    });
    const merged = Object.values(mergedMap);
    const top5g = merged.filter(t => t.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 5);
    const top5l = merged.filter(t => t.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 5);
    const recent = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 10);
    const StatCard = ({ label, value, color, icon }) => (
      <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: "18px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
          <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 28, color, letterSpacing: "-0.5px" }}>{value}</div>
      </div>
    );
    const Tag = ({ label, pos }) => <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: pos ? "rgba(233,92,110,0.15)" : "rgba(91,124,248,0.15)", color: pos ? T.profit : T.loss, whiteSpace: "nowrap" }}>{label}</span>;
    const TopItem = ({ t, pos }) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{truncName(t.name)}</span>
            <Tag label={t.tagMedium} pos={pos} />
          </div>
          <span style={{ fontWeight: 700, color: pos ? T.profit : T.loss, fontSize: 13, whiteSpace: "nowrap" }}>{pos ? "+" : "-"}{fmtMoney(t.profit)}</span>
        </div>
        <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{t.count > 1 ? `${t.count}번 매매 합산` : fmtDate(t.date)}</div>
      </div>
    );
    return (
      <div style={{ padding: 12 }}>
        {/* 기간 선택 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["전체", "이번달", "지난달", "최근3개월", "직접입력"].map(p => (
              <button key={p} onClick={() => setDashPeriod(p)}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${dashPeriod === p ? T.tabActive : T.inputBd}`, background: dashPeriod === p ? "#1a2d50" : "transparent", color: dashPeriod === p ? T.blue : T.sub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
          {dashPeriod === "직접입력" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button onClick={() => { setDashCalYear(new Date().getFullYear()); setDashCalMonth(new Date().getMonth()); setDashCalOpen("start"); }}
                style={{ ...inp, flex: 1, cursor: "pointer", textAlign: "center", color: dashStart ? T.text : T.sub, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🗓 {dashStart || "시작일"}
              </button>
              <span style={{ color: T.sub, fontSize: 14, flexShrink: 0 }}>~</span>
              <button onClick={() => { setDashCalYear(new Date().getFullYear()); setDashCalMonth(new Date().getMonth()); setDashCalOpen("end"); }}
                style={{ ...inp, flex: 1, cursor: "pointer", textAlign: "center", color: dashEnd ? T.text : T.sub, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🗓 {dashEnd || "종료일"}
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <StatCard icon="💰" label="총 수익금" value={(totalProfit >= 0 ? "+" : "-") + fmtMoney(totalProfit)} color={totalProfit >= 0 ? T.profit : T.loss} />
          <StatCard icon="🏆" label="승률" value={`${winRate}%`} color={T.text} />
          <StatCard icon="🏦" label="총 자산" value="₩0" color={T.text} />
          <StatCard icon="📅" label="이번달 수지" value={(monthlyProfit >= 0 ? "+" : "-") + fmtMoney(monthlyProfit)} color={monthlyProfit >= 0 ? T.profit : T.loss} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[{ title: "수익금 TOP 5", items: top5g, pos: true }, { title: "손실금 TOP 5", items: top5l, pos: false }].map(({ title, items, pos }) => (
            <div key={title} style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: pos ? T.profit : T.loss, marginBottom: 14 }}>{title}</div>
              {items.length === 0 ? <div style={{ fontSize: 12, color: T.sub, textAlign: "center", padding: "12px 0" }}>데이터 없음</div> : items.map((t, i) => <TopItem key={i} t={t} pos={pos} />)}
            </div>
          ))}
        </div>
        <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}` }}><span style={{ fontWeight: 600, fontSize: 14, color: T.sub }}>최근 매매</span></div>
          {recent.length === 0
            ? <div style={{ padding: "32px", textAlign: "center", color: T.sub, fontSize: 13 }}>매매 내역이 없습니다.<br /><span style={{ fontSize: 11, marginTop: 4, display: "block" }}>매매일지에서 종목을 추가해보세요.</span></div>
            : recent.map((t, i) => {
              const pos = (t.returnRate ?? 0) >= 0;
              return (
                <div key={i} style={{ padding: "13px 16px", borderBottom: i < recent.length - 1 ? `1px solid ${T.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{truncName(t.name)}</div><div style={{ fontSize: 11, color: T.sub }}>{fmtDate(t.date)}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: pos ? T.profit : T.loss, fontSize: 14 }}>{pos ? "" : "-"}{fmtMoney(t.profit)}</div>
                    <div style={{ fontSize: 12, color: pos ? T.profit : T.loss }}>{pos ? "+" : ""}{(t.returnRate ?? 0).toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  const handleImportImage = (file) => {
    if (!file?.type.startsWith("image/")) return;
    setParsing(true);
    setParseMsg("분석 중...");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(",")[1];
      const mediaType = file.type;
      try {
        const res = await fetch("/api/parse-trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType })
        });
        const json = await res.json();
        if (!json.date || !json.trades) throw new Error("파싱 실패");

        const dateStr = json.date;
        const newDates = dates.includes(dateStr) ? dates : [...dates, dateStr].sort((a, b) => b.localeCompare(a));
        const existing = data[dateStr] || { scenarios: [], kakaoImages: [], teacherComment: "", trades: [] };
        const newTrades = json.trades.map(t => ({ id: Date.now() + Math.random(), name: t.name, profit: t.profit, returnRate: t.returnRate, tagLarge: "종배", tagMedium: "", tagSmall: "", lossReasons: [], chartImages: [], reason: "", reflection: "" }));
        const newData = { ...data, [dateStr]: { ...existing, trades: [...existing.trades, ...newTrades] } };
        setDates(newDates);
        setData(newData);
        await save(newData, newDates, trash);
        setParseMsg(`✓ ${json.trades.length}건 추가됨`);
        setTimeout(() => {
          if (isDirty && !window.confirm("저장하지 않은 내용이 있어요.\n저장하지 않고 이동할까요?")) return;
          closeImportModal();
          openDate(dateStr);
        }, 1200);
      } catch (e) {
        setParseMsg("분석 실패 ✕");
        setTimeout(() => { setParseMsg(""); setImportPreview(null); setImportFile(null); }, 2500);
      }
      setParsing(false);
    };
    reader.readAsDataURL(file);
  };

  const setImportImage = (file) => {
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = e => setImportPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportFile(null);
    setParseMsg("");
  };

  // ──────────── IMPORT MODAL ────────────
  const renderImportModal = () => {
    if (!showImportModal) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
        onClick={closeImportModal}>
        <div style={{ background: "#1a1f30", borderRadius: 16, border: `1px solid ${T.border}`, padding: "28px 24px", width: 400, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", textAlign: "center" }}
          onClick={e => e.stopPropagation()}
          onPaste={e => {
            const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
            if (!item) return;
            setImportImage(item.getAsFile());
          }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 6 }}>📷 사진 가져오기</div>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 20 }}>증권사 매매내역 캡처 후 Ctrl+V로 붙여넣기</div>

          {!importPreview ? (
            <>
              <div style={{ border: `2px dashed ${T.inputBd}`, borderRadius: 12, padding: "36px 16px", marginBottom: 16, color: T.sub, fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                여기에 <span style={{ color: T.blue, fontWeight: 700 }}>Ctrl+V</span>
              </div>
              <button onClick={() => importRef.current?.click()}
                style={{ background: "none", border: `1px solid ${T.inputBd}`, borderRadius: 8, padding: "9px 20px", color: T.sub, fontSize: 13, cursor: "pointer" }}>
                파일로 선택하기
              </button>
            </>
          ) : (
            <>
              <img src={importPreview} alt="preview" style={{ width: "100%", borderRadius: 10, marginBottom: 16, maxHeight: 260, objectFit: "contain", background: "#0d1018" }} />
              {parseMsg
                ? <div style={{ fontSize: 14, fontWeight: 700, color: parseMsg.includes("✓") ? T.green : T.red, marginBottom: 12 }}>{parseMsg}</div>
                : <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={closeImportModal}
                      style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${T.inputBd}`, background: "none", color: T.sub, fontSize: 14, cursor: "pointer" }}>취소</button>
                    <button onClick={() => { handleImportImage(importFile); }}
                      disabled={parsing}
                      style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: T.tabActive, color: "#fff", fontSize: 14, fontWeight: 700, cursor: parsing ? "default" : "pointer", opacity: parsing ? 0.6 : 1 }}>
                      {parsing ? "분석 중..." : "확인"}
                    </button>
                  </div>
              }
            </>
          )}
        </div>
      </div>
    );
  };

  // ──────────── LIST ────────────
  const renderList = () => {
    // 검색 필터
    const filteredDates = dates.filter(date => {
      if (!listSearch.trim()) return true;
      const q = listSearch.toLowerCase();
      const d = data[date] || {};
      if (fmtDate(date).includes(q) || date.includes(q)) return true;
      if ((d.trades || []).some(t =>
        t.name?.toLowerCase().includes(q) ||
        t.tagLarge?.toLowerCase().includes(q) ||
        t.tagMedium?.toLowerCase().includes(q) ||
        t.reason?.toLowerCase().includes(q) ||
        t.reflection?.toLowerCase().includes(q)
      )) return true;
      if (d.teacherComment?.toLowerCase().includes(q)) return true;
      return false;
    });

    // 주 시작일(월요일) 구하기
    const getWeekKey = dateStr => {
      const d = new Date(dateStr);
      const dow = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return mon.toISOString().slice(0,10) + "~" + sun.toISOString().slice(0,10);
    };

    // 그룹핑
    const groups = {};
    filteredDates.forEach(date => {
      const key = listView === "주단위" ? getWeekKey(date) : listView === "월단위" ? date.slice(0,7) : date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(date);
    });
    const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    const fmtGroupLabel = key => {
      if (listView === "주단위") {
        const [s, e] = key.split("~");
        const [sy,sm,sd] = s.split("-"); const [ey,em,ed] = e.split("-");
        return sy === ey
          ? `${sy}년 ${+sm}월 ${+sd}일 ~ ${+em}월 ${+ed}일`
          : `${sy}년 ${+sm}월 ${+sd}일 ~ ${ey}년 ${+em}월 ${+ed}일`;
      }
      if (listView === "월단위") { const [y,m] = key.split("-"); return `${y}년 ${+m}월`; }
      return fmtDate(key);
    };

    return (
      <div style={{ padding: "14px 12px" }}>
        {/* 일/주/월 탭 */}
        <div style={{ display: "flex", background: T.card, borderRadius: 10, padding: 4, marginBottom: 12, border: `1px solid ${T.border}` }}>
          {["일단위", "주단위", "월단위"].map(v => (
            <button key={v} onClick={() => setListView(v)}
              style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, background: listView === v ? T.tabActive : "transparent", color: listView === v ? "#fff" : T.sub, transition: "background 0.2s" }}>
              {v}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.sub, fontSize: 14, pointerEvents: "none" }}>🔍</span>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)}
            style={{ ...inp, paddingLeft: 36 }} placeholder="날짜, 종목명, 태그, 매매이유, 코멘트 검색..." />
        </div>

        {/* 버튼 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setShowTrash(true)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.inputBd}`, background: "none", color: T.sub, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🗑️ 휴지통{Object.keys(trash).length > 0 && <span style={{ background: "#2a1a1a", color: T.red, borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{Object.keys(trash).length}</span>}
          </button>
          <button onClick={() => setShowImportModal(true)} disabled={parsing}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.inputBd}`, background: "none", color: parsing ? T.sub : T.blue, fontSize: 13, cursor: parsing ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            📷 {parseMsg || "사진"}
          </button>
          <input ref={importRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) { handleImportImage(e.target.files[0]); setShowImportModal(false); } e.target.value = ""; }} />
          <Btn style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => setShowCal(true)}>+ 일지 추가</Btn>
        </div>

        {/* 목록 */}
        {filteredDates.length === 0
          ? <div style={{ textAlign: "center", color: T.sub, padding: "40px 0", fontSize: 13 }}>{listSearch ? "검색 결과가 없어요." : "일지가 없습니다."}</div>
          : groupKeys.map(key => {
              const datesInGroup = groups[key];
              const groupTrades = datesInGroup.flatMap(d => data[d]?.trades || []);
              const groupTotal = groupTrades.reduce((s, t) => s + (t.profit || 0), 0);
              return (
                <div key={key}>
                  {listView !== "일단위" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px 8px" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: T.blue }}>{fmtGroupLabel(key)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: groupTotal >= 0 ? T.profit : T.loss }}>
                        {groupTrades.length}건 · {groupTotal >= 0 ? "+" : "-"}{fmtMoney(groupTotal)}
                      </span>
                    </div>
                  )}
                  {datesInGroup.map(date => {
                    const d = data[date] || {};
                    const trades = d.trades || [];
                    const total = trades.reduce((s, t) => s + (t.profit || 0), 0);
                    const tags = [...new Set(trades.map(t => t.tagMedium).filter(Boolean))].slice(0, 4);
                    return (
                      <div key={date} onClick={() => openDate(date)} style={{ ...cardStyle({ cursor: "pointer" }) }}>
                        <div style={{ padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tags.length ? 10 : 0 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 17, color: T.text, marginBottom: 5 }}>{fmtDate(date)} ({fmtW(date)})</div>
                              <div style={{ fontSize: 13, color: T.sub }}>
                                종목 {trades.length}건{d.kakaoImages?.length > 0 ? ` · 카톡 ${d.kakaoImages.length}장` : ""}{d.teacherComment ? " · 코멘트 있음" : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {trades.length > 0 && (
                                <div style={{ fontWeight: 700, color: total >= 0 ? T.profit : T.loss, fontSize: 15 }}>
                                  {total >= 0 ? "+" : "-"}{fmtMoney(total)}
                                </div>
                              )}
                              <span style={{ color: T.sub, fontSize: 18 }}>›</span>
                            </div>
                          </div>
                          {tags.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {tags.map(tag => (
                                <span key={tag} style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#152040", color: T.blue }}>{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
        }
      </div>
    );
  };

  // ──────────── JOURNAL ────────────
  const renderJournal = () => {
    if (!j) return null;
    const trades = j.trades || [];
    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={goBack} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 13px", fontSize: 13, color: T.sub, cursor: "pointer" }}>← 목록</button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isDirty && <span style={{ fontSize: 12, color: T.sub }}>● 저장 안 됨</span>}
            <div style={{ fontWeight: 800, fontSize: 20, color: "#dce5ff" }}>{fmtDate(selDate)}</div>
          </div>
        </div>

        {/* 시나리오 */}
        <div style={cardStyle()}>
          <div style={hdStyle()}>
            <span style={{ fontSize: 17 }}>🎯</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>시나리오</span>
            <span style={{ fontSize: 11, color: T.sub }}>전날 미리 작성 · 당일 결과 체크</span>
          </div>
          <div style={{ padding: 16 }}>
            {/* 시장분석 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>시장분석</div>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 8 }}>전일 시장상황 내 생각 · 오늘 예상 시장상황을 함께 적어 주세요.</div>
              <textarea
                value={j.marketAnalysis || ""}
                onChange={e => upd({ marketAnalysis: e.target.value })}
                style={{ ...inp, minHeight: 90, resize: "vertical", lineHeight: 1.7, fontSize: 13 }}
                placeholder="예) 어제는 금리 우려로 기술주 약세, 오늘은 반동 시도 예상 but 거래량 부족 우려..."
              />
            </div>

            {/* 시나리오 목록 */}
            {!j.scenarios?.length && !showScenarioInput && (
              <p style={{ color: T.sub, fontSize: 13, marginBottom: 12 }}>아직 작성한 시나리오가 없습니다.</p>
            )}
            {j.scenarios?.map((sc, i) => {
              const scName = typeof sc === "object" ? (sc.name || "") : "";
              const scText = typeof sc === "string" ? sc : (sc.content || sc.text || "");
              const executed = typeof sc === "object" ? sc.executed : false;
              const correct = typeof sc === "object" ? sc.correct : false;
              const updSc = (patch) => {
                const next = j.scenarios.map((s, k) => k !== i ? s : {
                  name: typeof s === "object" ? (s.name || "") : "",
                  content: typeof s === "string" ? s : (s.content || s.text || ""),
                  executed: typeof s === "object" ? s.executed : false,
                  correct: typeof s === "object" ? s.correct : false,
                  ...patch
                });
                upd({ scenarios: next });
              };
              return (
                <div key={i} style={{ background: T.card2, borderRadius: 8, padding: "10px 12px", marginBottom: 6, fontSize: 13, color: T.text, lineHeight: 1.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      {scName && <div style={{ fontWeight: 700, fontSize: 13, color: T.blue, marginBottom: 4 }}>{scName}</div>}
                      <span>{scText}</span>
                    </div>
                    <button onClick={() => upd({ scenarios: j.scenarios.filter((_, k) => k !== i) })} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 16, padding: "0 4px", marginLeft: 8, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={executed} onChange={e => updSc({ executed: e.target.checked })} style={{ accentColor: T.green, width: 14, height: 14 }} />
                      <span style={{ color: executed ? T.green : T.sub }}>실행했음</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={correct} onChange={e => updSc({ correct: e.target.checked })} style={{ accentColor: T.blue, width: 14, height: 14 }} />
                      <span style={{ color: correct ? T.blue : T.sub }}>시장 맞았음</span>
                    </label>
                  </div>
                </div>
              );
            })}

            {/* 시나리오 입력 폼 */}
            {showScenarioInput && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>종목명</label>
                  <input value={scenarioNameInput} onChange={e => setScenarioNameInput(e.target.value)}
                    style={inp} placeholder="예: 삼성전자" autoFocus />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>시나리오 내용</label>
                  <textarea value={scenarioInput} onChange={e => setScenarioInput(e.target.value)}
                    style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.7 }}
                    placeholder="진입 조건, 목표가, 손절가, 대응 계획 등" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => {
                    if (scenarioInput.trim()) upd({ scenarios: [...(j.scenarios || []), { name: scenarioNameInput.trim(), content: scenarioInput.trim(), executed: false, correct: false }] });
                    setScenarioInput(""); setScenarioNameInput(""); setShowScenarioInput(false);
                  }}>추가</Btn>
                  <Btn variant="ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => { setScenarioInput(""); setScenarioNameInput(""); setShowScenarioInput(false); }}>취소</Btn>
                </div>
              </div>
            )}
            {!showScenarioInput && (
              <button onClick={() => setShowScenarioInput(true)} style={{ background: "transparent", border: `1px solid ${T.inputBd}`, borderRadius: 8, width: "100%", padding: "12px", color: T.sub, fontSize: 13, cursor: "pointer" }}>
                + 시나리오 추가
              </button>
            )}
          </div>
        </div>

        {/* 카톡 캡처 / 선생님 코멘트 */}
        <div style={cardStyle()}>
          <div onClick={() => setKakaoOpen(p => !p)} style={{ ...hdStyle({ cursor: "pointer", justifyContent: "space-between", ...(!kakaoOpen && { borderBottom: "none" }) }) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 17 }}>💬</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>카톡 캡처 / 선생님 코멘트</span>
              <span style={{ fontSize: 11, color: T.sub }}>사진 {(j.kakaoImages || []).length}장</span>
            </div>
            <span style={{ color: T.sub, display: "inline-block", transform: kakaoOpen ? "none" : "rotate(180deg)", transition: "transform 0.2s" }}>▲</span>
          </div>
          {kakaoOpen && (
            <div style={{ padding: 16, display: "flex", gap: 16, alignItems: "flex-start" }}>
              {/* 왼쪽: 카톡 캡처 사진 */}
              <div style={{ flex: "0 0 45%", minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 8 }}>카톡 캡처</div>
                {(j.kakaoImages || []).length > 0 && (
                  <>
                    {/* 썸네일 목록 */}
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 4 }}>
                      {j.kakaoImages.map((img, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={img} alt="" onClick={() => setSelectedKakaoImg(i)}
                            style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: selectedKakaoImg === i ? `2px solid ${T.blue}` : `2px solid transparent`, opacity: selectedKakaoImg === i ? 1 : 0.6 }} />
                          <button onClick={() => { const imgs = [...j.kakaoImages]; imgs.splice(i, 1); upd({ kakaoImages: imgs }); setSelectedKakaoImg(imgs.length === 0 ? 0 : Math.min(selectedKakaoImg, imgs.length - 1)); }}
                            style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: T.red, border: "1px solid #0d1018", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ))}
                      {/* 추가 버튼 */}
                      <div onClick={() => kakaoRef.current?.click()}
                        style={{ width: 54, height: 54, borderRadius: 6, border: `1.5px dashed ${T.inputBd}`, background: T.input, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: 20, color: T.sub }}>
                        +
                      </div>
                    </div>
                    {/* 선택된 사진 크게 보기 */}
                    <div style={{ position: "relative" }}>
                      <img src={j.kakaoImages[selectedKakaoImg] || j.kakaoImages[0]} alt=""
                        onClick={() => setLightbox(j.kakaoImages[selectedKakaoImg] || j.kakaoImages[0])}
                        style={{ width: "100%", borderRadius: 8, cursor: "zoom-in", display: "block" }} />
                    </div>
                  </>
                )}
                {!(j.kakaoImages || []).length && (
                  <div onClick={() => kakaoRef.current?.click()} style={{ border: `1.5px dashed ${T.inputBd}`, borderRadius: 10, padding: "16px 10px", textAlign: "center", cursor: "pointer", background: T.input }}>
                    <div style={{ fontSize: 20, marginBottom: 3 }}>🖼️</div>
                    <div style={{ color: T.sub, fontSize: 11 }}>클릭 또는 Ctrl+V</div>
                  </div>
                )}
                <input ref={kakaoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => Array.from(e.target.files).forEach(f => readImg(f, src => { setData(p => ({ ...p, [selDate]: { ...p[selDate], kakaoImages: [...(p[selDate]?.kakaoImages || []), src] } })); setIsDirty(true); }))} />
              </div>

              {/* 오른쪽: 선생님 코멘트 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 8 }}>선생님 코멘트</div>
                <textarea value={j.teacherComment || ""} onChange={e => upd({ teacherComment: e.target.value })}
                  onPaste={e => {
                    e.preventDefault();
                    const raw = e.clipboardData.getData("text");
                    const lines = raw.split("\n");
                    const chunks = [];
                    let cur = null;
                    lines.forEach(line => {
                      if (line.startsWith("[")) {
                        if (cur !== null) chunks.push(cur.trim());
                        cur = line.startsWith("[용") ? line : null;
                      } else {
                        if (cur !== null) cur += "\n" + line;
                      }
                    });
                    if (cur !== null) chunks.push(cur.trim());
                    upd({ teacherComment: chunks.join("\n") || raw });
                  }}
                  style={{ ...inp, minHeight: 400, resize: "vertical", lineHeight: 1.85, fontSize: 12.5, color: "#8fa3be" }} placeholder="선생님 코멘트를 입력하세요..." />
              </div>
            </div>
          )}
        </div>

        {/* 매매내역 */}
        <div style={cardStyle({ marginBottom: 0 })}>
          <div style={hdStyle({ justifyContent: "space-between" })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 17 }}>📊</span><span style={{ fontWeight: 700, fontSize: 15 }}>매매내역</span></div>
            <Btn style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setShowForm(true)}>+ 새 종목</Btn>
          </div>
          {showForm && (
            <div style={{ padding: 16, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: "#dce5ff" }}>새 종목</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
                {[["종목명","name",""],["수익률 (%)","returnRate",""],["수익금 (원)","profit",""]].map(([label,key,ph]) => (
                  <div key={key}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>{label}</label><input style={inp} placeholder={ph} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} /></div>
                ))}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>태그</label>
                <div style={{ display: "grid", gridTemplateColumns: MEDIUM_TAGS[form.tagLarge] ? "1fr 1fr auto" : "1fr auto", gap: 8 }}>
                  <select style={inp} value={form.tagLarge} onChange={e => setForm(p => ({ ...p, tagLarge: e.target.value, tagMedium: MEDIUM_TAGS[e.target.value]?.[0] || "" }))}>{LARGE_TAGS.map(t => <option key={t}>{t}</option>)}</select>
                  {MEDIUM_TAGS[form.tagLarge] && (
                    <select style={inp} value={form.tagMedium} onChange={e => setForm(p => ({ ...p, tagMedium: e.target.value }))}>{MEDIUM_TAGS[form.tagLarge].map(t => <option key={t}>{t}</option>)}</select>
                  )}
                  <Btn style={{ padding: "10px 14px" }} onClick={saveTrade}>추가</Btn>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 6 }}>손실 이유</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LOSS_REASONS.map(r => (
                    <label key={r} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={form.lossReasons.includes(r)}
                        onChange={() => setForm(p => ({ ...p, lossReasons: p.lossReasons.includes(r) ? p.lossReasons.filter(x => x !== r) : [...p.lossReasons, r] }))}
                        style={{ accentColor: T.loss, width: 13, height: 13 }} />
                      <span style={{ color: form.lossReasons.includes(r) ? T.loss : T.sub }}>{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>차트 사진</label>
                <div onClick={() => chartRef.current?.click()} style={{ border: `1.5px dashed ${T.inputBd}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer", background: T.input }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>🖼️</div>
                  <div style={{ color: T.sub, fontSize: 12 }}>클릭하여 선택 · 마우스를 올린 채 Ctrl+V로 붙여넣기</div>
                </div>
                <input ref={chartRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => Array.from(e.target.files).forEach(f => readImg(f, src => setForm(p => ({ ...p, chartImages: [...p.chartImages, src] }))))} />
                {form.chartImages.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 2 }}>
                      {form.chartImages.map((img, i) => (
                        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                          <img src={img} alt="" onClick={() => setFormChartIdx(i)}
                            style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: formChartIdx === i ? `2px solid ${T.tabActive}` : "2px solid transparent", opacity: formChartIdx === i ? 1 : 0.6 }} />
                          <button onClick={() => { setForm(p => ({ ...p, chartImages: p.chartImages.filter((_, j) => j !== i) })); setFormChartIdx(prev => Math.min(prev, form.chartImages.length - 2)); }}
                            style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: T.red, border: "1px solid #0d1018", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                      ))}
                    </div>
                    <img src={form.chartImages[formChartIdx] ?? form.chartImages[0]} alt=""
                      onClick={() => setLightbox(form.chartImages[formChartIdx] ?? form.chartImages[0])}
                      style={{ width: "100%", borderRadius: 8, cursor: "zoom-in", display: "block" }} />
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>매매 이유</label><textarea style={{ ...inp, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} placeholder="" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} /></div>
              <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>반성</label><textarea style={{ ...inp, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} placeholder="" value={form.reflection} onChange={e => setForm(p => ({ ...p, reflection: e.target.value }))} /></div>
              <div style={{ display: "flex", gap: 8 }}><Btn onClick={saveTrade}>추가</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>취소</Btn></div>
            </div>
          )}
          <div style={{ padding: "8px 10px 10px" }}>
            {trades.map(trade => {
              const exp = expandedId === trade.id;
              const pos = trade.returnRate >= 0;
              const ef = editForms[trade.id] || { name: trade.name, returnRate: String(trade.returnRate), profit: String(trade.profit), tagLarge: trade.tagLarge || "종배", tagMedium: trade.tagMedium || "", tagSmall: trade.tagSmall || "", lossReasons: trade.lossReasons || [], chartImages: trade.chartImages || [], reason: trade.reason || "", reflection: trade.reflection || "" };
              const setEf = patch => setEditForms(p => ({ ...p, [trade.id]: { ...(p[trade.id] ?? ef), ...patch } }));
              const savEdit = () => {
                const updated = { ...trade, name: ef.name, returnRate: parseFloat(ef.returnRate) || 0, profit: parseInt(String(ef.profit).replace(/[^0-9-]/g, "")) || 0, tagLarge: ef.tagLarge, tagMedium: ef.tagMedium, tagSmall: ef.tagSmall, lossReasons: ef.lossReasons, chartImages: ef.chartImages, reason: ef.reason, reflection: ef.reflection };
                upd({ trades: trades.map(t => t.id === trade.id ? updated : t) });
                setExpandedId(null);
              };
              return (
                <div key={trade.id} style={{ background: T.card2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8, overflow: "hidden" }}>
                  <div onClick={() => { setExpandedId(exp ? null : trade.id); if (!exp) setEditForms(p => ({ ...p, [trade.id]: { name: trade.name, returnRate: String(trade.returnRate), profit: String(trade.profit), tagLarge: trade.tagLarge || "기타", tagMedium: trade.tagMedium || "기타", tagSmall: trade.tagSmall || "소분류 없음", chartImages: trade.chartImages || [], reason: trade.reason || "", reflection: trade.reflection || "" } })); }} style={{ padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1b2240", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.sub }}>{trade.name?.[0] || "?"}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{truncName(trade.name)}</div>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#152040", color: T.blue, marginTop: 2 }}>{trade.tagMedium}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: pos ? T.profit : T.loss }}>{fmtMoney(trade.profit)}</div>
                        <div style={{ fontSize: 12, color: pos ? T.profit : T.loss }}>{pos ? "+" : ""}{trade.returnRate}%</div>
                      </div>
                      <span style={{ color: T.sub, fontSize: 11, display: "inline-block", transform: exp ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                    </div>
                  </div>
                  {exp && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 14, marginBottom: 12 }}>
                        {[["종목명","name"],["수익률 (%)","returnRate"],["수익금 (원)","profit"]].map(([label,key]) => (
                          <div key={key}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>{label}</label><input style={inp} value={ef[key]} onChange={e => setEf({ [key]: e.target.value })} /></div>
                        ))}
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>태그</label>
                        <div style={{ display: "grid", gridTemplateColumns: MEDIUM_TAGS[ef.tagLarge] ? "1fr 1fr" : "1fr", gap: 8 }}>
                          <select style={inp} value={ef.tagLarge} onChange={e => setEf({ tagLarge: e.target.value, tagMedium: MEDIUM_TAGS[e.target.value]?.[0] || "" })}>{LARGE_TAGS.map(t => <option key={t}>{t}</option>)}</select>
                          {MEDIUM_TAGS[ef.tagLarge] && (
                            <select style={inp} value={ef.tagMedium} onChange={e => setEf({ tagMedium: e.target.value })}>{MEDIUM_TAGS[ef.tagLarge].map(t => <option key={t}>{t}</option>)}</select>
                          )}
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 6 }}>손실 이유</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {LOSS_REASONS.map(r => (
                            <label key={r} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                              <input type="checkbox" checked={(ef.lossReasons || []).includes(r)}
                                onChange={() => setEf({ lossReasons: (ef.lossReasons || []).includes(r) ? ef.lossReasons.filter(x => x !== r) : [...(ef.lossReasons || []), r] })}
                                style={{ accentColor: T.loss, width: 13, height: 13 }} />
                              <span style={{ color: (ef.lossReasons || []).includes(r) ? T.loss : T.sub }}>{r}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>차트 사진</label>
                        {ef.chartImages.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 2 }}>
                              {ef.chartImages.map((img, i) => (
                                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                                  <img src={img} alt="" onClick={() => setEditChartIdx(p => ({ ...p, [trade.id]: i }))}
                                    style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: (editChartIdx[trade.id] ?? 0) === i ? `2px solid ${T.tabActive}` : "2px solid transparent", opacity: (editChartIdx[trade.id] ?? 0) === i ? 1 : 0.6 }} />
                                  <button onClick={() => { setEf({ chartImages: ef.chartImages.filter((_, k) => k !== i) }); setEditChartIdx(p => ({ ...p, [trade.id]: Math.min(p[trade.id] ?? 0, ef.chartImages.length - 2) })); }}
                                    style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: T.red, border: "1px solid #0d1018", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                                </div>
                              ))}
                            </div>
                            <img src={ef.chartImages[editChartIdx[trade.id] ?? 0] ?? ef.chartImages[0]} alt=""
                              onClick={() => setLightbox(ef.chartImages[editChartIdx[trade.id] ?? 0] ?? ef.chartImages[0])}
                              style={{ width: "100%", borderRadius: 8, cursor: "zoom-in", display: "block" }} />
                          </div>
                        )}
                        <div onClick={() => editChartRef.current?.click()} style={{ border: `1.5px dashed ${T.inputBd}`, borderRadius: 10, padding: "14px", textAlign: "center", cursor: "pointer", background: T.input, fontSize: 12, color: T.sub }}>
                          🖼️ 클릭하여 추가
                        </div>
                        <input ref={editChartRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => Array.from(e.target.files).forEach(f => readImg(f, src => setEf({ chartImages: [...ef.chartImages, src] })))} />
                      </div>
                      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>매매 이유</label><textarea style={{ ...inp, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} value={ef.reason} onChange={e => setEf({ reason: e.target.value })} /></div>
                      <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: T.sub, display: "block", marginBottom: 5 }}>반성</label><textarea style={{ ...inp, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} value={ef.reflection} onChange={e => setEf({ reflection: e.target.value })} /></div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn onClick={savEdit}>저장</Btn>
                        <Btn variant="ghost" onClick={() => setExpandedId(null)}>취소</Btn>
                        <Btn variant="danger" style={{ marginLeft: "auto" }} onClick={() => upd({ trades: trades.filter(t => t.id !== trade.id) })}>삭제</Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!trades.length && !showForm && <div style={{ textAlign: "center", color: T.sub, padding: "24px 0", fontSize: 13 }}>아직 매매 내역이 없습니다.</div>}
          </div>
        </div>

        {/* 저장 / 일지 삭제 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 4px" }}>
          <button onClick={() => setShowDeleteConfirm(true)} style={{ background: "none", border: `1px solid #3a1a1a`, borderRadius: 8, color: T.red, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "10px 18px", opacity: 0.8 }}>일지 삭제</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {saveMsg ? <span style={{ fontSize: 13, fontWeight: 600, color: saveMsg.includes("✓") ? T.green : T.red }}>{saveMsg}</span> : isDirty && <span style={{ fontSize: 12, color: T.sub }}>저장되지 않은 변경사항이 있어요</span>}
            <Btn onClick={handleSave} style={{ padding: "11px 36px", fontSize: 15, opacity: isDirty ? 1 : 0.5 }}>저장</Btn>
          </div>
        </div>

        {/* 삭제 확인 모달 */}
        {showDeleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowDeleteConfirm(false)}>
            <div style={{ background: "#1a1f30", borderRadius: 16, border: `1px solid ${T.border}`, padding: "28px 24px", width: 300, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", textAlign: "center" }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 8 }}>일지를 삭제할까요?</div>
              <div style={{ fontSize: 13, color: T.sub, marginBottom: 6 }}>{fmtDate(selDate)}</div>
              <div style={{ fontSize: 12, color: T.sub, marginBottom: 24 }}>삭제된 일지는 휴지통에서<br />3일 동안 복원할 수 있어요.</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${T.inputBd}`, background: "none", color: T.sub, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={deleteDate} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#b91c1c", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>삭제</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ──────────── ANALYSIS ────────────
  const renderAnalysis = () => {
    // 모든 시나리오 수집
    const allScenarios = [];
    dates.forEach(date => {
      (data[date]?.scenarios || []).forEach(sc => {
        const text = typeof sc === "string" ? sc : (sc.content || sc.text || "");
        const executed = typeof sc === "object" ? sc.executed : false;
        const correct = typeof sc === "object" ? sc.correct : false;
        allScenarios.push({ date, text, executed, correct });
      });
    });

    // 전체 요약
    const total = allScenarios.length;
    const executedCount = allScenarios.filter(s => s.executed).length;
    const correctCount = allScenarios.filter(s => s.correct).length;
    const execRate = total > 0 ? (executedCount / total * 100).toFixed(1) : 0;
    const correctRate = total > 0 ? (correctCount / total * 100).toFixed(1) : 0;

    // 기간별 그룹핑
    const grouped = {};
    allScenarios.forEach(s => {
      const d = new Date(s.date);
      let key;
      if (analysisPeriod === "일별") key = s.date;
      else if (analysisPeriod === "주별") {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().slice(0, 10);
      } else {
        key = s.date.slice(0, 7);
      }
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    const groupedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    const ProgressBar = ({ rate, color }) => (
      <div style={{ background: "#1a2035", borderRadius: 6, height: 8, overflow: "hidden", marginTop: 4 }}>
        <div style={{ width: `${rate}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.4s" }} />
      </div>
    );

    const fmtKey = (key) => {
      if (analysisPeriod === "일별") return fmtDate(key);
      if (analysisPeriod === "주별") return `${key} 주`;
      const [y, m] = key.split("-");
      return `${y}년 ${+m}월`;
    };

    // 태그 분석
    const allTrades = [];
    dates.forEach(d => (data[d]?.trades || []).forEach(t => allTrades.push(t)));
    const tagGroups = {};
    allTrades.forEach(t => {
      const key = t.tagMedium || "기타";
      if (!tagGroups[key]) tagGroups[key] = { count: 0, profit: 0, wins: 0 };
      tagGroups[key].count++;
      tagGroups[key].profit += t.profit || 0;
      if (t.returnRate > 0) tagGroups[key].wins++;
    });
    const tagList = Object.entries(tagGroups).sort((a, b) => b[1].count - a[1].count);

    return (
      <div style={{ padding: 12 }}>
        {/* 서브탭 */}
        <div style={{ display: "flex", background: T.card, borderRadius: 10, padding: 4, marginBottom: 16, border: `1px solid ${T.border}` }}>
          {["시나리오", "태그"].map(t => (
            <button key={t} onClick={() => setAnalysisTab(t)}
              style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, background: analysisTab === t ? T.tabActive : "transparent", color: analysisTab === t ? "#fff" : T.sub, transition: "background 0.2s" }}>
              {t} 분석
            </button>
          ))}
        </div>

        {analysisTab === "시나리오" && (
          <>
            <p style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>매매일지에 작성한 시나리오의 <span style={{ color: T.green }}>실행 여부</span>와 <span style={{ color: T.blue }}>시장 적중 여부</span>를 전체 시나리오 대비 비율로 집계합니다.</p>

            {/* 전체 요약 */}
            <div style={{ ...cardStyle(), padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>전체 요약</span>
                <span style={{ fontSize: 12, color: T.sub }}>전체 시나리오 {total}건</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}>
                  <span style={{ color: T.sub }}>실행률 (지켰음)</span>
                  <span style={{ fontWeight: 700, color: T.green }}>{execRate}% ({executedCount}/{total})</span>
                </div>
                <ProgressBar rate={execRate} color={T.green} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}>
                  <span style={{ color: T.sub }}>시장 적중률 (맞았음)</span>
                  <span style={{ fontWeight: 700, color: T.blue }}>{correctRate}% ({correctCount}/{total})</span>
                </div>
                <ProgressBar rate={correctRate} color={T.blue} />
              </div>
            </div>

            {/* 기간 선택 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {["일별", "주별", "월별"].map(p => (
                <button key={p} onClick={() => setAnalysisPeriod(p)}
                  style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${analysisPeriod === p ? T.tabActive : T.inputBd}`, background: analysisPeriod === p ? "#1a2d50" : "transparent", color: analysisPeriod === p ? T.blue : T.sub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {p}
                </button>
              ))}
            </div>

            {/* 기간별 목록 */}
            {groupedKeys.length === 0
              ? <div style={{ textAlign: "center", color: T.sub, padding: "40px 0", fontSize: 13 }}>시나리오 데이터가 없습니다.</div>
              : groupedKeys.map(key => {
                const items = grouped[key];
                const kTotal = items.length;
                const kExec = items.filter(s => s.executed).length;
                const kCorrect = items.filter(s => s.correct).length;
                const kExecRate = (kExec / kTotal * 100).toFixed(1);
                const kCorrectRate = (kCorrect / kTotal * 100).toFixed(1);
                return (
                  <div key={key} style={{ ...cardStyle(), padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtKey(key)}</span>
                      <span style={{ fontSize: 12, color: T.sub }}>시나리오 {kTotal}건</span>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: T.sub }}>실행률</span>
                        <span style={{ color: T.green, fontWeight: 600 }}>{kExecRate}% ({kExec}/{kTotal})</span>
                      </div>
                      <ProgressBar rate={kExecRate} color={T.green} />
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                        <span style={{ color: T.sub }}>시장 적중률</span>
                        <span style={{ color: T.blue, fontWeight: 600 }}>{kCorrectRate}% ({kCorrect}/{kTotal})</span>
                      </div>
                      <ProgressBar rate={kCorrectRate} color={T.blue} />
                    </div>
                  </div>
                );
              })}
          </>
        )}

        {analysisTab === "태그" && (
          <>
            <p style={{ fontSize: 12, color: T.sub, marginBottom: 14 }}>태그별 매매 횟수, 승률, 손익을 집계합니다.</p>
            {tagList.length === 0
              ? <div style={{ textAlign: "center", color: T.sub, padding: "40px 0", fontSize: 13 }}>매매 데이터가 없습니다.</div>
              : tagList.map(([tag, stat]) => {
                const winRate = (stat.wins / stat.count * 100).toFixed(1);
                const pos = stat.profit >= 0;
                return (
                  <div key={tag} style={{ ...cardStyle(), padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: T.blue }}>{tag}</span>
                      <span style={{ fontSize: 12, color: T.sub }}>{stat.count}건</span>
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>승률</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{winRate}%</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>손익</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: pos ? T.profit : T.loss }}>{pos ? "+" : "-"}{fmtMoney(stat.profit)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <ProgressBar rate={winRate} color={T.green} />
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </div>
    );
  };

  // ──────────── MAIN ────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif", fontSize: 14 }}>
      {renderCalendar()}
      {renderDashCalendar()}
      {renderTrash()}
      {renderImportModal()}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, cursor: "zoom-out", padding: 16 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, objectFit: "contain", boxShadow: "0 0 40px rgba(0,0,0,0.8)" }} />
        </div>
      )}
      <div style={{ borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12 }}>
            <div style={{ width: 28, height: 28, background: T.tabActive, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>📋</div>
            <span style={{ fontWeight: 800, fontSize: 18, color: "#dce5ff" }}>주식 매매일지</span>
          </div>
          <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
            {NAV_TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "매매일지") setView("list"); }}
                style={{ padding: "10px 16px", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#fff" : T.sub, background: "transparent", border: "none", borderBottom: tab === t.id ? `2px solid ${T.tabActive}` : "2px solid transparent", marginBottom: -1, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", transition: "color 0.2s" }}>
                {t.icon} {t.id}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {tab === "대시보드" && renderDashboard()}
        {tab === "매매일지" && (view === "list" ? renderList() : renderJournal())}
        {tab === "매매분석" && renderAnalysis()}
        {!["대시보드","매매일지","매매분석"].includes(tab) && (
          <div style={{ textAlign: "center", color: T.sub, padding: "80px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{NAV_TABS.find(t => t.id === tab)?.icon}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{tab}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>준비 중입니다.</div>
          </div>
        )}
      </div>
    </div>
  );
}
