import { useState, useEffect, useCallback } from "react";

// Saat deploy ke Vercel, set environment variable REACT_APP_API_URL
// ke URL backend Railway kamu, contoh: https://zakkipay-backend.up.railway.app/api
const API = process.env.REACT_APP_API_URL || "http://localhost:3001/api";

const fmt = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const timeAgo = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return "Baru saja";
  if (s < 3600) return Math.floor(s / 60) + " menit lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return new Date(d).toLocaleDateString("id-ID");
};

const CATEGORIES = [
  { id: "pulsa", label: "Pulsa", icon: "📱", grad: ["#6366f1","#818cf8"] },
  { id: "ewallet", label: "E-Wallet", icon: "💳", grad: ["#10b981","#34d399"] },
  { id: "data", label: "Paket Data", icon: "📶", grad: ["#f59e0b","#fbbf24"] },
  { id: "pln", label: "PLN", icon: "⚡", grad: ["#ef4444","#f87171"] },
  { id: "game", label: "Game", icon: "🎮", grad: ["#8b5cf6","#a78bfa"] },
  { id: "tv", label: "TV Kabel", icon: "📺", grad: ["#06b6d4","#22d3ee"] },
  { id: "pdam", label: "PDAM", icon: "💧", grad: ["#3b82f6","#60a5fa"] },
  { id: "bpjs", label: "BPJS", icon: "🏥", grad: ["#ec4899","#f472b6"] },
];

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position:"fixed", top:20, left:"50%", transform:"translateX(-50%)",
      background: toast.type==="error" ? "#ef4444" : toast.type==="warn" ? "#f59e0b" : "#10b981",
      color:"#fff", padding:"12px 24px", borderRadius:30, fontWeight:700,
      fontSize:14, zIndex:999, boxShadow:"0 8px 30px #0003", whiteSpace:"nowrap"
    }}>{toast.msg}</div>
  );
}

// ─── QRIS MODAL ──────────────────────────────────────────────────────────────
function QrisModal({ data, onClose, onCheckStatus }) {
  const [countdown, setCountdown] = useState(300);
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(countdown/60)).padStart(2,"0");
  const ss = String(countdown%60).padStart(2,"0");
  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={ms.box} onClick={e=>e.stopPropagation()}>
        <div style={ms.handle}/>
        <div style={ms.badge}>⏱ {mm}:{ss}</div>
        <div style={ms.title}>Scan QRIS untuk Bayar</div>
        <div style={ms.amount}>{fmt(data.nominal_total)}</div>
        <div style={ms.sub}>Termasuk kode unik • Bayar tepat nominal ini</div>
        {data.qris_image
          ? <img src={data.qris_image} alt="QRIS" style={ms.qr} onError={e=>e.target.style.display="none"}/>
          : <div style={ms.qrPlaceholder}>QR tidak tersedia<br/><small>Gunakan kode di bawah</small></div>
        }
        {data.qris_content && (
          <div style={ms.qrText}>{data.qris_content.slice(0,40)}...</div>
        )}
        <div style={ms.idBox}>ID: <b>{data.id_transaksi}</b></div>
        <button style={ms.btnCheck} onClick={()=>onCheckStatus(data.id_transaksi)}>🔍 Cek Status Pembayaran</button>
        <button style={ms.btnClose} onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}
const ms = {
  overlay:{position:"fixed",inset:0,background:"#000a",zIndex:50,display:"flex",alignItems:"flex-end",justifyContent:"center"},
  box:{background:"#fff",borderRadius:"24px 24px 0 0",padding:"8px 24px 40px",width:"100%",maxWidth:430,display:"flex",flexDirection:"column",alignItems:"center"},
  handle:{width:40,height:4,background:"#e2e8f0",borderRadius:2,margin:"12px auto 20px"},
  badge:{background:"#fef3c7",color:"#92400e",borderRadius:20,padding:"5px 14px",fontSize:13,fontWeight:700,marginBottom:12},
  title:{fontSize:18,fontWeight:800,color:"#1e293b",marginBottom:4},
  amount:{fontSize:32,fontWeight:900,color:"#6366f1",marginBottom:4},
  sub:{fontSize:12,color:"#94a3b8",marginBottom:16},
  qr:{width:200,height:200,borderRadius:16,border:"3px solid #e2e8f0",marginBottom:12},
  qrPlaceholder:{width:200,height:200,borderRadius:16,border:"3px dashed #e2e8f0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:14,textAlign:"center",marginBottom:12},
  qrText:{fontSize:10,color:"#cbd5e1",wordBreak:"break-all",maxWidth:280,textAlign:"center",marginBottom:12},
  idBox:{background:"#f8fafc",borderRadius:10,padding:"8px 16px",fontSize:12,color:"#64748b",marginBottom:16,width:"100%",textAlign:"center",boxSizing:"border-box"},
  btnCheck:{width:"100%",padding:14,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",marginBottom:8},
  btnClose:{width:"100%",padding:12,background:"transparent",color:"#94a3b8",border:"none",fontSize:14,cursor:"pointer"},
};

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
function AuthPage({ onAuth, showToast }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ name:"", email:"", phone:"", password:"" });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = async () => {
    setLoading(true);
    try {
      const body = tab==="login" ? { email:form.email, password:form.password } : form;
      const r = await fetch(`${API}/auth/${tab}`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)
      });
      const d = await r.json();
      if (!r.ok) return showToast(d.message, "error");
      localStorage.setItem("ppob_token", d.token);
      onAuth(d.token);
    } catch { showToast("Gagal terhubung ke server","error"); }
    setLoading(false);
  };

  return (
    <div style={as.root}>
      <div style={as.hero}>
        <div style={as.heroLogo}>⚡</div>
        <div style={as.heroTitle}>ZakkiPay</div>
        <div style={as.heroSub}>Platform PPOB Terpercaya</div>
      </div>
      <div style={as.card}>
        <div style={as.tabs}>
          <div style={{...as.tab, ...(tab==="login"?as.tabActive:{})}} onClick={()=>setTab("login")}>Masuk</div>
          <div style={{...as.tab, ...(tab==="register"?as.tabActive:{})}} onClick={()=>setTab("register")}>Daftar</div>
        </div>
        {tab==="register" && (
          <>
            <input style={as.inp} placeholder="Nama Lengkap" value={form.name} onChange={e=>set("name",e.target.value)}/>
            <input style={as.inp} placeholder="Nomor HP" value={form.phone} onChange={e=>set("phone",e.target.value)} type="tel"/>
          </>
        )}
        <input style={as.inp} placeholder="Email" value={form.email} onChange={e=>set("email",e.target.value)} type="email"/>
        <input style={as.inp} placeholder="Password" value={form.password} onChange={e=>set("password",e.target.value)} type="password"/>
        <button style={as.btn} onClick={submit} disabled={loading}>
          {loading ? "Memproses..." : tab==="login" ? "Masuk" : "Daftar Sekarang"}
        </button>
      </div>
    </div>
  );
}
const as = {
  root:{minHeight:"100vh",background:"linear-gradient(160deg,#6366f1 0%,#8b5cf6 40%,#f8fafc 40%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20},
  hero:{textAlign:"center",marginBottom:32,color:"#fff"},
  heroLogo:{fontSize:56,marginBottom:8},
  heroTitle:{fontSize:36,fontWeight:900,letterSpacing:-1},
  heroSub:{fontSize:15,opacity:0.85},
  card:{background:"#fff",borderRadius:24,padding:28,width:"100%",maxWidth:380,boxShadow:"0 20px 60px #6366f130"},
  tabs:{display:"flex",background:"#f1f5f9",borderRadius:14,padding:4,marginBottom:20},
  tab:{flex:1,textAlign:"center",padding:"10px",borderRadius:10,fontSize:14,fontWeight:600,color:"#64748b",cursor:"pointer"},
  tabActive:{background:"#fff",color:"#6366f1",boxShadow:"0 2px 8px #0001"},
  inp:{width:"100%",padding:"13px 16px",border:"2px solid #e2e8f0",borderRadius:12,fontSize:15,outline:"none",marginBottom:12,boxSizing:"border-box",fontFamily:"inherit"},
  btn:{width:"100%",padding:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:16,cursor:"pointer",marginTop:4},
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("ppob_token"));
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("home");
  const [toast, setToast] = useState(null);
  const [qrisData, setQrisData] = useState(null);

  // Products page state
  const [selCat, setSelCat] = useState(null);
  const [products, setProducts] = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [selProduct, setSelProduct] = useState(null);
  const [targetNum, setTargetNum] = useState("");
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyResult, setBuyResult] = useState(null);

  // Topup state
  const [topupNom, setTopupNom] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);

  // History
  const [topupHistory, setTopupHistory] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [histTab, setHistTab] = useState("topup");

  // Check status
  const [checkId, setCheckId] = useState("");
  const [checkRes, setCheckRes] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const showToast = useCallback((msg, type="success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const authFetch = useCallback(async (url, opts={}) => {
    const r = await fetch(url, { ...opts, headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}`, ...(opts.headers||{}) } });
    return r;
  }, [token]);

  const fetchUser = useCallback(async () => {
    if (!token) return;
    const r = await authFetch(`${API}/user/me`);
    if (r.ok) setUser(await r.json());
    else { localStorage.removeItem("ppob_token"); setToken(null); }
  }, [token, authFetch]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const onAuth = (tok) => { setToken(tok); };

  const logout = () => { localStorage.removeItem("ppob_token"); setToken(null); setUser(null); };

  const goPage = (p) => {
    setPage(p);
    setBuyResult(null);
    setSelProduct(null);
    setCheckRes(null);
    if (p==="history") fetchHistory();
  };

  const openCat = async (cat) => {
    setSelCat(cat);
    setProducts([]);
    setSelProduct(null);
    setTargetNum("");
    setBuyResult(null);
    setPage("products");
    setProdLoading(true);
    try {
      const r = await fetch(`${API}/order/products?jenis=${cat.id}`);
      const d = await r.json();
      setProducts(Array.isArray(d) ? d : []);
    } catch { showToast("Gagal memuat produk","error"); }
    setProdLoading(false);
  };

  const doTopup = async () => {
    const nom = parseInt(topupNom);
    if (!nom || nom < 1000) return showToast("Minimal top up Rp 1.000","error");
    setTopupLoading(true);
    try {
      const r = await authFetch(`${API}/topup/create`, { method:"POST", body:JSON.stringify({nominal:nom}) });
      const d = await r.json();
      if (!r.ok) return showToast(d.message,"error");
      setQrisData(d);
      setTopupNom("");
    } catch { showToast("Gagal terhubung ke server","error"); }
    setTopupLoading(false);
  };

  const doBuy = async () => {
    if (!selProduct) return showToast("Pilih produk dulu","error");
    if (!targetNum.trim()) return showToast("Isi nomor tujuan dulu","error");
    setBuyLoading(true);
    setBuyResult(null);
    try {
      const r = await authFetch(`${API}/order/buy`, {
        method:"POST",
        body:JSON.stringify({ kode:selProduct.kode, tujuan:targetNum, harga:selProduct.harga||selProduct.price||0, produk_nama:selProduct.nama||selProduct.name||selProduct.kode })
      });
      const d = await r.json();
      setBuyResult({ ...d, ok: r.ok });
      if (r.ok) { showToast("Transaksi berhasil!"); fetchUser(); }
      else showToast(d.message,"error");
    } catch { showToast("Gagal terhubung ke server","error"); }
    setBuyLoading(false);
  };

  const doCheck = async () => {
    if (!checkId.trim()) return showToast("Masukkan ID transaksi","error");
    setCheckLoading(true);
    setCheckRes(null);
    try {
      const r = await authFetch(`${API}/topup/status/${checkId.trim()}`);
      const d = await r.json();
      setCheckRes(d);
      if (d.status==="SUCCESS") { fetchUser(); showToast("Pembayaran terkonfirmasi!"); }
    } catch { showToast("Gagal","error"); }
    setCheckLoading(false);
  };

  const checkFromQris = (id) => {
    setQrisData(null);
    setCheckId(id);
    goPage("check");
  };

  const fetchHistory = async () => {
    const [rt, ro] = await Promise.all([
      authFetch(`${API}/topup/history`),
      authFetch(`${API}/order/history`),
    ]);
    if (rt.ok) setTopupHistory(await rt.json());
    if (ro.ok) setOrderHistory(await ro.json());
  };

  if (!token) return <><Toast toast={toast}/><AuthPage onAuth={onAuth} showToast={showToast}/></>;

  return (
    <div style={r.root}>
      <Toast toast={toast}/>
      {qrisData && <QrisModal data={qrisData} onClose={()=>setQrisData(null)} onCheckStatus={checkFromQris}/>}

      {/* HEADER */}
      <div style={r.header}>
        <div style={r.hLeft}>
          {page!=="home" && <button style={r.backBtn} onClick={()=>goPage("home")}>←</button>}
          <span style={r.logo}>⚡ ZakkiPay</span>
        </div>
        {page==="home" && user && (
          <div style={r.hRight}>
            <div style={r.hName}>{user.name.split(" ")[0]}</div>
            <div style={r.avatar} onClick={logout} title="Logout">{user.name[0].toUpperCase()}</div>
          </div>
        )}
      </div>

      <div style={r.body}>

        {/* ── HOME ─────────────────────────────────────── */}
        {page==="home" && (
          <>
            {/* Saldo Card */}
            <div style={r.balCard}>
              <div style={r.balLabel}>Saldo Kamu</div>
              <div style={r.balAmount}>{user ? fmt(user.balance) : "—"}</div>
              <div style={r.balRow}>
                <button style={r.balBtn} onClick={()=>goPage("topup")}>+ Top Up</button>
                <button style={{...r.balBtn, background:"#ffffff22"}} onClick={fetchUser}>↻ Refresh</button>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={r.quickGrid}>
              {[
                {icon:"💳",label:"Top Up",page:"topup"},
                {icon:"🔍",label:"Cek Status",page:"check"},
                {icon:"📋",label:"Riwayat",page:"history"},
                {icon:"💸",label:"Transfer",fn:()=>showToast("Segera hadir","warn")},
              ].map((q,i)=>(
                <div key={i} style={r.quickItem} onClick={()=>q.fn?q.fn():goPage(q.page)}>
                  <div style={r.quickIcon}>{q.icon}</div>
                  <div style={r.quickLabel}>{q.label}</div>
                </div>
              ))}
            </div>

            {/* Promo Banner */}
            <div style={r.promoBanner}>
              <div>
                <div style={r.promoTitle}>🎁 Reward Setiap Transaksi</div>
                <div style={r.promoSub}>Kumpulkan poin & menangkan saldo gratis!</div>
              </div>
              <div style={r.promoArrow}>→</div>
            </div>

            {/* Categories */}
            <div style={r.secTitle}>Layanan</div>
            <div style={r.catGrid}>
              {CATEGORIES.map(cat=>(
                <div key={cat.id} style={r.catCard} onClick={()=>openCat(cat)}>
                  <div style={{...r.catIconBox, background:`linear-gradient(135deg,${cat.grad[0]},${cat.grad[1]})`}}>
                    {cat.icon}
                  </div>
                  <div style={r.catLabel}>{cat.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Tx */}
            <div style={r.secTitle}>Transaksi Terakhir</div>
            {orderHistory.slice(0,3).map((o,i)=>(
              <div key={i} style={r.txCard}>
                <div style={r.txIcon}>{o.status==="SUCCESS"?"✅":"❌"}</div>
                <div style={r.txMid}>
                  <div style={r.txName}>{o.produk}</div>
                  <div style={r.txTime}>{o.tujuan} • {timeAgo(o.created_at)}</div>
                </div>
                <div style={{...r.txAmt, color: o.status==="SUCCESS"?"#ef4444":"#94a3b8"}}>-{fmt(o.harga)}</div>
              </div>
            ))}
            {orderHistory.length===0 && <div style={r.empty}>Belum ada transaksi</div>}
          </>
        )}

        {/* ── PRODUCTS ──────────────────────────────────── */}
        {page==="products" && (
          <>
            <div style={r.pageHero(selCat?.grad)}>
              <div style={r.pageHeroIcon}>{selCat?.icon}</div>
              <div style={r.pageHeroTitle}>{selCat?.label}</div>
            </div>

            <div style={r.formCard}>
              <div style={r.fieldLabel}>Nomor / ID Tujuan</div>
              <input style={r.inp} placeholder="Contoh: 0812xxxxx" value={targetNum}
                onChange={e=>setTargetNum(e.target.value)} type="tel"/>
            </div>

            <div style={r.secTitle}>Pilih Nominal</div>
            {prodLoading && <div style={r.loading}><div style={r.spinner}/> Memuat produk...</div>}
            {!prodLoading && products.length===0 && (
              <div style={r.empty}>Produk tidak tersedia.<br/>Coba kategori lain.</div>
            )}
            <div style={r.prodGrid}>
              {products.map((p,i)=>{
                const sel = selProduct?.kode===p.kode;
                return (
                  <div key={i} style={{...r.prodCard, ...(sel?r.prodCardSel:{})}} onClick={()=>setSelProduct(p)}>
                    {sel && <div style={r.prodCheck}>✓</div>}
                    <div style={r.prodName}>{p.nama||p.name||p.kode}</div>
                    <div style={r.prodPrice}>{fmt(p.harga||p.price||0)}</div>
                    {p.desc && <div style={r.prodDesc}>{p.desc}</div>}
                  </div>
                );
              })}
            </div>

            {selProduct && (
              <div style={r.summaryBox}>
                <div style={r.sumTitle}>Ringkasan Pembelian</div>
                <div style={r.sumRow}><span>Produk</span><b>{selProduct.nama||selProduct.kode}</b></div>
                <div style={r.sumRow}><span>Tujuan</span><b>{targetNum||"—"}</b></div>
                <div style={r.sumRow}><span>Harga</span><b style={{color:"#6366f1"}}>{fmt(selProduct.harga||0)}</b></div>
                <div style={r.sumRow}><span>Saldo kamu</span><b style={{color: (user?.balance||0)>=(selProduct.harga||0)?"#10b981":"#ef4444"}}>{fmt(user?.balance)}</b></div>
                <button style={r.btnBuy} onClick={doBuy} disabled={buyLoading}>
                  {buyLoading ? "Memproses..." : "Beli Sekarang"}
                </button>
              </div>
            )}

            {buyResult && (
              <div style={{...r.resultBox, borderColor: buyResult.ok?"#10b981":"#ef4444"}}>
                <div style={r.resultIcon}>{buyResult.ok?"✅":"❌"}</div>
                <div style={r.resultTitle}>{buyResult.ok?"Berhasil!":"Gagal"}</div>
                <div style={r.resultMsg}>{buyResult.message}</div>
                {buyResult.sn && <div style={r.snBox}>SN: {buyResult.sn}</div>}
              </div>
            )}
          </>
        )}

        {/* ── TOPUP ─────────────────────────────────────── */}
        {page==="topup" && (
          <>
            <div style={r.topupHero}>
              <div style={r.topupLabel}>Saldo Aktif</div>
              <div style={r.topupBalance}>{user ? fmt(user.balance) : "—"}</div>
              <div style={r.topupHint}>Top up via QRIS • Settlement otomatis</div>
            </div>

            <div style={r.secTitle}>Pilih Nominal</div>
            <div style={r.chipGrid}>
              {[5000,10000,20000,50000,100000,200000].map(n=>(
                <div key={n}
                  style={{...r.chip, ...(topupNom==n?r.chipSel:{})}}
                  onClick={()=>setTopupNom(String(n))}>
                  {fmt(n)}
                </div>
              ))}
            </div>

            <div style={r.formCard}>
              <div style={r.fieldLabel}>Atau ketik nominal lain</div>
              <input style={r.inp} placeholder="Minimal Rp 1.000" value={topupNom}
                onChange={e=>setTopupNom(e.target.value.replace(/\D/g,""))} type="tel"/>
              {topupNom && <div style={r.inpHint}>{fmt(parseInt(topupNom)||0)}</div>}
            </div>

            <button style={r.btnPrimary} onClick={doTopup} disabled={topupLoading}>
              {topupLoading ? "Membuat QRIS..." : "Generate QRIS ⚡"}
            </button>

            <div style={r.infoBox}>
              ℹ️ QRIS akan expired dalam <b>5 menit</b>. Bayar sesuai nominal yang tertera (sudah termasuk kode unik).
            </div>
          </>
        )}

        {/* ── CHECK ─────────────────────────────────────── */}
        {page==="check" && (
          <>
            <div style={r.secTitle}>Cek Status Top Up</div>
            <div style={r.formCard}>
              <div style={r.fieldLabel}>ID Transaksi</div>
              <input style={r.inp} placeholder="Contoh: ppob-a1b2c3d4-1"
                value={checkId} onChange={e=>setCheckId(e.target.value)}/>
            </div>
            <button style={r.btnPrimary} onClick={doCheck} disabled={checkLoading}>
              {checkLoading ? "Mengecek..." : "Cek Sekarang"}
            </button>
            {checkRes && (
              <div style={{...r.resultBox, borderColor: checkRes.status==="SUCCESS"?"#10b981":"#f59e0b", marginTop:20}}>
                <div style={r.resultIcon}>{checkRes.status==="SUCCESS"?"✅":"⏳"}</div>
                <div style={r.resultTitle}>{checkRes.status==="SUCCESS"?"Pembayaran Berhasil":"Menunggu Pembayaran"}</div>
                {checkRes.nominal && <div style={{...r.resultMsg, fontWeight:700, fontSize:18}}>{fmt(checkRes.nominal)}</div>}
                {checkRes.status==="PENDING" && <div style={r.resultMsg}>Selesaikan pembayaran QRIS kamu</div>}
                {checkRes.status==="SUCCESS" && <div style={r.resultMsg}>Saldo berhasil ditambahkan ke akunmu 🎉</div>}
              </div>
            )}
          </>
        )}

        {/* ── HISTORY ───────────────────────────────────── */}
        {page==="history" && (
          <>
            <div style={r.histTabs}>
              <div style={{...r.histTab, ...(histTab==="topup"?r.histTabActive:{})}} onClick={()=>setHistTab("topup")}>Top Up</div>
              <div style={{...r.histTab, ...(histTab==="order"?r.histTabActive:{})}} onClick={()=>setHistTab("order")}>Pembelian</div>
            </div>

            {histTab==="topup" && (
              topupHistory.length===0
                ? <div style={r.empty}>Belum ada riwayat top up</div>
                : topupHistory.map((h,i)=>(
                  <div key={i} style={r.histCard}>
                    <div style={{...r.histDot, background: h.status==="SUCCESS"?"#10b981":"#f59e0b"}}/>
                    <div style={r.histMid}>
                      <div style={r.histName}>Top Up Saldo</div>
                      <div style={r.histId}>{h.id_transaksi}</div>
                      <div style={r.histTime}>{timeAgo(h.created_at)}</div>
                    </div>
                    <div style={r.histRight}>
                      <div style={{...r.histAmt, color:"#10b981"}}>+{fmt(h.nominal)}</div>
                      <div style={{...r.histStatus, color: h.status==="SUCCESS"?"#10b981":"#f59e0b"}}>{h.status}</div>
                    </div>
                  </div>
                ))
            )}

            {histTab==="order" && (
              orderHistory.length===0
                ? <div style={r.empty}>Belum ada riwayat pembelian</div>
                : orderHistory.map((o,i)=>(
                  <div key={i} style={r.histCard}>
                    <div style={{...r.histDot, background: o.status==="SUCCESS"?"#6366f1":"#ef4444"}}/>
                    <div style={r.histMid}>
                      <div style={r.histName}>{o.produk}</div>
                      <div style={r.histId}>{o.tujuan}</div>
                      <div style={r.histTime}>{timeAgo(o.created_at)}</div>
                    </div>
                    <div style={r.histRight}>
                      <div style={{...r.histAmt, color:"#ef4444"}}>-{fmt(o.harga)}</div>
                      <div style={{...r.histStatus, color: o.status==="SUCCESS"?"#10b981":"#ef4444"}}>{o.status}</div>
                    </div>
                  </div>
                ))
            )}
          </>
        )}

      </div>

      {/* BOTTOM NAV */}
      <div style={r.nav}>
        {[
          {id:"home",icon:"🏠",label:"Beranda"},
          {id:"topup",icon:"💳",label:"Top Up"},
          {id:"check",icon:"🔍",label:"Cek"},
          {id:"history",icon:"📋",label:"Riwayat"},
        ].map(n=>{
          const active = page===n.id;
          return (
            <div key={n.id} style={r.navItem} onClick={()=>goPage(n.id)}>
              <div style={{...r.navIcon, ...(active?{transform:"scale(1.2)"}:{})}}>{n.icon}</div>
              <div style={{...r.navLabel, color:active?"#6366f1":"#94a3b8", fontWeight:active?700:500}}>{n.label}</div>
              {active && <div style={r.navDot}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const r = {
  root:{fontFamily:"'Inter',system-ui,sans-serif",background:"#f8fafc",minHeight:"100vh",maxWidth:430,margin:"0 auto",position:"relative",paddingBottom:90},
  header:{background:"#fff",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 1px 0 #f1f5f9"},
  hLeft:{display:"flex",alignItems:"center",gap:10},
  logo:{fontWeight:900,fontSize:20,color:"#6366f1",letterSpacing:-0.5},
  backBtn:{background:"none",border:"none",fontSize:22,color:"#6366f1",cursor:"pointer",padding:0,lineHeight:1},
  hRight:{display:"flex",alignItems:"center",gap:10},
  hName:{fontSize:14,fontWeight:600,color:"#475569"},
  avatar:{width:36,height:36,borderRadius:18,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,cursor:"pointer"},
  body:{padding:"0 16px 20px"},
  balCard:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:24,padding:"24px 20px",color:"#fff",margin:"16px 0",boxShadow:"0 8px 32px #6366f130"},
  balLabel:{fontSize:13,opacity:0.8,marginBottom:4},
  balAmount:{fontSize:36,fontWeight:900,letterSpacing:-1,marginBottom:16},
  balRow:{display:"flex",gap:10},
  balBtn:{flex:1,padding:"10px",background:"#ffffff33",color:"#fff",border:"1px solid #ffffff44",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer"},
  quickGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20},
  quickItem:{background:"#fff",borderRadius:16,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer",boxShadow:"0 2px 10px #0001"},
  quickIcon:{fontSize:24},
  quickLabel:{fontSize:11,fontWeight:600,color:"#475569",textAlign:"center"},
  promoBanner:{background:"linear-gradient(135deg,#fef3c7,#fde68a)",borderRadius:16,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,cursor:"pointer"},
  promoTitle:{fontWeight:700,fontSize:14,color:"#92400e"},
  promoSub:{fontSize:12,color:"#b45309",marginTop:2},
  promoArrow:{fontSize:20,color:"#b45309",fontWeight:900},
  secTitle:{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:12,marginTop:4},
  catGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24},
  catCard:{background:"#fff",borderRadius:18,padding:"14px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",boxShadow:"0 2px 10px #0001"},
  catIconBox:{width:48,height:48,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24},
  catLabel:{fontSize:11,fontWeight:700,color:"#475569",textAlign:"center"},
  txCard:{background:"#fff",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8,boxShadow:"0 1px 6px #0001"},
  txIcon:{fontSize:22},
  txMid:{flex:1},
  txName:{fontSize:14,fontWeight:700,color:"#1e293b"},
  txTime:{fontSize:11,color:"#94a3b8",marginTop:2},
  txAmt:{fontSize:14,fontWeight:800},
  pageHero:(grad)=>({background:`linear-gradient(135deg,${grad?.[0]||"#6366f1"},${grad?.[1]||"#8b5cf6"})`,borderRadius:20,padding:"24px 20px",color:"#fff",textAlign:"center",margin:"16px 0",boxShadow:"0 8px 30px #6366f120"}),
  pageHeroIcon:{fontSize:40,marginBottom:6},
  pageHeroTitle:{fontSize:24,fontWeight:900},
  formCard:{background:"#fff",borderRadius:16,padding:16,marginBottom:16,boxShadow:"0 2px 10px #0001"},
  fieldLabel:{fontSize:13,fontWeight:700,color:"#475569",marginBottom:8},
  inp:{width:"100%",padding:"13px 16px",border:"2px solid #e2e8f0",borderRadius:12,fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border 0.2s"},
  inpHint:{fontSize:13,color:"#6366f1",fontWeight:700,marginTop:6},
  prodGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16},
  prodCard:{background:"#fff",borderRadius:16,padding:14,cursor:"pointer",border:"2px solid #f1f5f9",position:"relative",boxShadow:"0 1px 8px #0001",transition:"all 0.15s"},
  prodCardSel:{border:"2px solid #6366f1",background:"#f5f3ff"},
  prodCheck:{position:"absolute",top:10,right:12,color:"#6366f1",fontWeight:900,fontSize:16},
  prodName:{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:6,lineHeight:1.3},
  prodPrice:{fontSize:15,fontWeight:900,color:"#6366f1"},
  prodDesc:{fontSize:11,color:"#94a3b8",marginTop:4},
  summaryBox:{background:"#fff",borderRadius:20,padding:20,marginBottom:16,boxShadow:"0 4px 20px #0002"},
  sumTitle:{fontWeight:800,fontSize:16,color:"#1e293b",marginBottom:14},
  sumRow:{display:"flex",justifyContent:"space-between",fontSize:14,color:"#475569",marginBottom:10,alignItems:"center"},
  btnBuy:{width:"100%",padding:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:16,cursor:"pointer",marginTop:8},
  btnPrimary:{width:"100%",padding:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:16,cursor:"pointer",display:"block"},
  resultBox:{background:"#fff",borderRadius:20,padding:24,textAlign:"center",border:"2px solid",boxShadow:"0 4px 20px #0001",marginBottom:16},
  resultIcon:{fontSize:40,marginBottom:8},
  resultTitle:{fontWeight:900,fontSize:20,color:"#1e293b",marginBottom:4},
  resultMsg:{fontSize:14,color:"#64748b",lineHeight:1.6},
  snBox:{marginTop:12,background:"#f0f0ff",color:"#6366f1",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,display:"inline-block"},
  topupHero:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:24,padding:"28px 24px",color:"#fff",textAlign:"center",margin:"16px 0"},
  topupLabel:{fontSize:13,opacity:0.8,marginBottom:6},
  topupBalance:{fontSize:38,fontWeight:900,letterSpacing:-1,marginBottom:4},
  topupHint:{fontSize:12,opacity:0.7},
  chipGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16},
  chip:{background:"#fff",borderRadius:12,padding:"12px 8px",textAlign:"center",fontSize:13,fontWeight:700,color:"#334155",cursor:"pointer",boxShadow:"0 1px 6px #0001",border:"2px solid transparent"},
  chipSel:{background:"#f5f3ff",color:"#6366f1",border:"2px solid #6366f1"},
  infoBox:{background:"#f0f9ff",borderRadius:14,padding:"12px 16px",fontSize:12,color:"#0369a1",marginTop:12,lineHeight:1.6},
  histTabs:{display:"flex",background:"#fff",borderRadius:14,padding:4,marginBottom:16,boxShadow:"0 1px 6px #0001"},
  histTab:{flex:1,textAlign:"center",padding:10,borderRadius:10,fontSize:14,fontWeight:600,color:"#64748b",cursor:"pointer"},
  histTabActive:{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff"},
  histCard:{background:"#fff",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8,boxShadow:"0 1px 6px #0001"},
  histDot:{width:10,height:10,borderRadius:5,flexShrink:0},
  histMid:{flex:1},
  histName:{fontSize:14,fontWeight:700,color:"#1e293b"},
  histId:{fontSize:11,color:"#94a3b8",marginTop:2},
  histTime:{fontSize:11,color:"#cbd5e1",marginTop:1},
  histRight:{textAlign:"right"},
  histAmt:{fontSize:14,fontWeight:800},
  histStatus:{fontSize:11,fontWeight:700,marginTop:2},
  loading:{textAlign:"center",padding:30,color:"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",gap:10},
  spinner:{width:18,height:18,border:"3px solid #e2e8f0",borderTopColor:"#6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  empty:{textAlign:"center",color:"#94a3b8",padding:"30px 20px",fontSize:14,lineHeight:1.8},
  nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#fff",borderTop:"1px solid #f1f5f9",display:"flex",padding:"8px 0 20px",zIndex:20,boxShadow:"0 -4px 20px #0001"},
  navItem:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer",position:"relative",paddingTop:4},
  navIcon:{fontSize:22,transition:"transform 0.2s"},
  navLabel:{fontSize:10,fontWeight:500},
  navDot:{width:4,height:4,borderRadius:2,background:"#6366f1",marginTop:3},
};
