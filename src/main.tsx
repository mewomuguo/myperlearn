import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleCheck,
  Download,
  Flag,
  House,
  ListChecks,
  Menu,
  Play,
  Settings as SettingsIcon,
  ShieldCheck,
  Target,
  Timer,
  WifiOff,
  X,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import type {
  Attempt,
  Concept,
  Content,
  ErrorType,
  Exam,
  Question,
  StudyState,
  Task,
} from "./types";
import {
  addDays,
  conceptStatus,
  createExam,
  dayDiff,
  examScore,
  generateQueue,
  initialState,
  localDate,
  makeAttempt,
  pickQuestions,
  planDay,
  readiness,
  submitExam,
  uid,
  weakPoints,
} from "./domain";
import {
  backupState,
  downloadState,
  loadState,
  saveTransaction,
  subscribe,
} from "./storage";
import { mergeRecords, parseRecord } from "./importer";
import "./style.css";
import { AgentActions } from "./webmcp";
type Context = {
  c: Content;
  s: StudyState;
  commit: (f: (s: StudyState) => StudyState) => Promise<void>;
  toast: (m: string) => void;
};
const Study = createContext<Context>(null!);
const useStudy = () => useContext(Study);
const go = (path: string) => {
  location.hash = path;
};
const pct = (n: number) => Math.round(n * 100) + "%";
const errors: ErrorType[] = [
  "概念不懂",
  "數字記錯",
  "選項混淆",
  "看錯題目",
  "計算失誤",
  "不確定／猜測",
];
function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
    </div>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty card">
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
function App() {
  const [c, setC] = useState<Content>(),
    [s, setS] = useState<StudyState>(),
    [fatal, setFatal] = useState(""),
    [message, setMessage] = useState(""),
    [route, setRoute] = useState(location.hash.slice(1) || "/"),
    [online, setOnline] = useState(navigator.onLine),
    [update, setUpdate] = useState<null | (() => Promise<void>)>(null),
    [offlineReady, setOfflineReady] = useState(false),
    [menu, setMenu] = useState(false),
    [saving, setSaving] = useState(0),
    [saveFailed, setSaveFailed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = (m: string) => {
    setMessage(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 7000);
  };
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(import.meta.env.BASE_URL + "data/content.json").then((r) => {
        if (!r.ok) throw Error("教材載入失敗");
        return r.json() as Promise<Content>;
      }),
      loadState(),
    ])
      .then(([content, saved]) => {
        if (live) {
          setC(content);
          setS(saved ?? initialState(content.version));
        }
      })
      .catch((e) =>
        setFatal(
          "無法開啟教材或本機儲存空間。請確認瀏覽器允許儲存，再重新整理。" +
            e.message,
        ),
      );
    const hash = () => {
        setRoute(location.hash.slice(1) || "/");
        setMenu(false);
        window.scrollTo(0, 0);
      },
      net = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    const unsub = subscribe(() => {
      loadState()
        .then((x) => {
          if (x && live) setS(x);
        })
        .catch(() => {});
    });
    return () => {
      live = false;
      unsub();
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  useEffect(() => {
    const updater = registerSW({
      onNeedRefresh() {
        setUpdate(() => () => updater(true));
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisterError() {
        /* Local progress remains usable when install is unavailable. */
      },
    });
  }, []);
  if (fatal)
    return (
      <main className="standalone">
        <Empty title="暫時無法開啟">{fatal}</Empty>
        <button onClick={() => location.reload()}>重新載入</button>
      </main>
    );
  if (!c || !s)
    return (
      <main className="standalone" aria-busy="true">
        正在準備你的15天通關計畫…
      </main>
    );
  const commit = async (f: (s: StudyState) => StudyState) => {
    setSaving((n) => n + 1);
    try {
      const latest = await saveTransaction(f, s);
      setS((old) => (!old || latest.revision >= old.revision ? latest : old));
      setSaveFailed(false);
    } catch (e) {
      setSaveFailed(true);
      toast(
        "儲存未成功：" +
          (e instanceof Error ? e.message : "請確認瀏覽器儲存空間"),
      );
      throw e;
    } finally {
      setSaving((n) => n - 1);
    }
  };
  const day = planDay(s),
    examActive = s.exams.some((e) => !e.submittedAt),
    nav = [
      { href: "/", label: "今日任務", icon: House },
      { href: "/plan", label: "15天計畫", icon: CalendarDays },
      { href: "/library", label: "考點與練習", icon: BookOpen },
      { href: "/mistakes", label: "錯題與弱點", icon: Target },
      { href: "/exams", label: "模擬考", icon: Timer },
    ];
  return (
    <Study.Provider value={{ c, s, commit, toast }}>
      <AgentActions content={c} state={s} commit={commit} />
      <aside className={"sidebar " + (menu ? "mobile-open" : "")}>
        <a className="brand" href="#/">
          <span className="brand-mark">15</span>
          <span>
            人身保險<span className="brand-sub">15 天通關系統</span>
          </span>
        </a>
        <div className="nav-caption">你的學習空間</div>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              className={route === href ? "active" : ""}
              href={"#" + href}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="study-note">
            <ShieldCheck size={18} />
            <p>
              先掌握必考核心
              <br />
              <small>每天3小時，循序累積</small>
            </p>
          </div>
          <a className="settings-link" href="#/settings">
            <SettingsIcon size={18} /> 設定與備份
          </a>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="開啟導覽"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <span>
            我的通關計畫 <span className="muted">/ Day {day}</span>
          </span>
          <div className="top-status">
            {!online && (
              <span>
                <WifiOff size={15} />
                離線
              </span>
            )}
            <span className="save-dot" />
            {saving ? "保存中…" : saveFailed ? "儲存失敗" : "本機保存"}
            <a
              className="icon-button"
              aria-label="設定與備份"
              href="#/settings"
            >
              <SettingsIcon size={18} />
            </a>
          </div>
        </header>
        <div className="page-content">
          {update && (
            <div className="notice">
              教材有更新。
              {examActive ? (
                "完成目前模考後再更新。"
              ) : (
                <button className="text-button" onClick={() => void update()}>
                  儲存完成，立即更新
                </button>
              )}
            </div>
          )}
          {offlineReady && (
            <div className="notice success">
              離線教材已準備好；紀錄會保存在此瀏覽器。
            </div>
          )}
          {!s.settings.setupComplete && route !== "/settings" && (
            <div className="notice">
              已依每天3小時建立計畫。
              <a href="#/settings">設定開始日與考試日期</a>，或直接開始學習。
            </div>
          )}
          <Routes route={route} />
        </div>
        <footer className="page-footer">
          115年7月講義版 · 學習進度保存在此裝置 ·{" "}
          <a href="#/settings">定期匯出備份</a>
        </footer>
      </main>
      <nav className="bottom-nav">
        {nav.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            className={route === href ? "active" : ""}
            href={"#" + href}
          >
            <Icon size={20} />
            <span>
              {label
                .replace("15天", "")
                .replace("考點與", "")
                .replace("錯題與", "")}
            </span>
          </a>
        ))}
      </nav>
      {message && (
        <div className="toast" role="status">
          {message}
          <button aria-label="關閉通知" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </Study.Provider>
  );
}
function Routes({ route }: { route: string }) {
  const [name, id] = route.split("/").filter(Boolean);
  switch (name) {
    case "plan":
      return <PlanPage />;
    case "library":
      return <Library />;
    case "learn":
      return <LessonPage id={id} />;
    case "practice":
      return id ? <PracticeRun id={id} /> : <PracticeHome numeric={false} />;
    case "numbers":
      return <PracticeHome numeric />;
    case "task":
      return <TodayRun />;
    case "mistakes":
      return <Mistakes />;
    case "exams":
      return id ? <ExamPage id={id} /> : <Exams />;
    case "settings":
      return <SettingsPage />;
    default:
      return <Dashboard />;
  }
}
function Dashboard() {
  const { c, s, commit } = useStudy(),
    day = planDay(s),
    r = readiness(s, c),
    weak = weakPoints(s, c),
    today = localDate(),
    queue = s.queues.find((q) => q.date === today),
    done = queue?.tasks.filter((t) => t.completedAt).length ?? 0,
    plan = c.plans[day - 1],
    wrong = weak.filter((x) => x.mistake && x.mistake !== "resolved"),
    last = s.exams.filter((e) => e.submittedAt).at(-1),
    daysLeft = s.settings.examDate
      ? dayDiff(s.settings.examDate, today)
      : Math.max(0, 15 - day),
    [busy, setBusy] = useState(false);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await commit((current) => {
        if (!current.queues.some((q) => q.date === today))
          current.queues.push(generateQueue(current, c));
        current.settings.setupComplete = true;
        return current;
      });
      go("/task");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="一步一步，把不熟變成拿分"
        title="今天，離通關更近一步。"
      >
        先完成今天的核心，再讓錯題帶你找到下一步。
      </PageTitle>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="live-dot" /> DAY {String(day).padStart(2, "0")} /
            15 · {day >= 12 ? "考前衝刺" : "建立核心"}
          </div>
          <h2>{plan.title}</h2>
          <p>
            {day === 1
              ? "先理解風險，再認識保險。每學一個觀念，立即做題確認。"
              : day >= 12
                ? "用完整練習卷找出漏洞，集中修正反覆答錯的考點。"
                : "今天的核心、到期複習與錯題，已為你排好順序。"}
          </p>
          <div className="hero-meta">
            <span>
              <Timer size={16} />
              每日 {s.settings.dailyMinutes} 分鐘
            </span>
            <span>
              <ListChecks size={16} />
              {queue
                ? `${done} / ${queue.tasks.length} 項已完成`
                : `${plan.requiredConceptIds.length} 個核心考點`}
            </span>
          </div>
          <button
            className="button lime"
            onClick={() => void start()}
            disabled={busy}
          >
            <Play size={17} fill="currentColor" />
            {queue
              ? done === queue.tasks.length
                ? "查看今日成果"
                : "繼續今天的任務"
              : "開始今天的任務"}
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="day-wheel">
          <small>距離{s.settings.examDate ? "考試" : "計畫結束"}</small>
          <strong>{daysLeft < 0 ? "已到期" : daysLeft}</strong>
          <span>{daysLeft < 0 ? "請更新考試日期" : "天"}</span>
        </div>
      </section>
      <section className="stats">
        <div className="stat card">
          <span>高重要度完成率</span>
          <strong>
            {pct(r.learned / r.coreCount)}
            <small>
              {r.learned} / {r.coreCount} MUST
            </small>
          </strong>
          <div className="bar">
            <i style={{ width: pct(r.learned / r.coreCount) }} />
          </div>
          <small>已閱讀並練習 · {r.mastered} 個跨日掌握</small>
        </div>
        <div className="stat card">
          <span>待修正錯題考點</span>
          <strong>
            {wrong.length}
            <small>個考點</small>
          </strong>
          <a href="#/mistakes">
            先解決反覆錯的地方 <ChevronRight size={15} />
          </a>
        </div>
        <div className="stat card">
          <span>目前準備度（暫估）</span>
          <strong>
            {r.score}
            <small>/ 100</small>
          </strong>
          <small>正式考制待確認，不能視為通過機率</small>
        </div>
      </section>
      <div className="two-col">
        <section className="card section-card">
          <div className="section-heading">
            <h2>今天的學習路線</h2>
            <a href="#/plan">
              完整計畫 <ChevronRight size={15} />
            </a>
          </div>
          {[
            {
              name: "理解核心",
              text: day >= 12 ? "依模考錯誤回看短課" : "白話短課＋生活情境",
              min: plan.learnMinutes,
            },
            {
              name: "立即做題",
              text:
                day >= 12
                  ? "完整限時卷，交卷後看解析"
                  : "學完就測，不熟馬上回看",
              min: plan.answerMinutes,
            },
            {
              name: "複習與修正",
              text:
                day === 1
                  ? "閉眼回想今天學到的重點"
                  : "昨日錯題＋到期複習＋數字期限",
              min: plan.reviewMinutes,
            },
          ].map((x, i) => (
            <div className="route-row" key={x.name}>
              <span className="step-no">0{i + 1}</span>
              <div>
                <strong>{x.name}</strong>
                <small>{x.text}</small>
              </div>
              <span className="time-pill">{x.min} 分</span>
            </div>
          ))}
          <p className="tiny muted">
            以上為180分鐘建議分配；實際任務依進度與可用時間調整。短課剩餘時間用於回想、筆記與休息。
          </p>
        </section>
        <section className="card section-card">
          <div className="section-heading">
            <h2>目前最值得補強</h2>
            <a href="#/mistakes">查看全部</a>
          </div>
          {weak.length ? (
            weak.slice(0, 3).map((w) => (
              <a
                className="focus-row"
                key={w.concept.id}
                href={"#/learn/" + w.concept.id}
              >
                <div>
                  <Badge tone={w.concept.priority}>{w.concept.priority}</Badge>
                  <h3>{w.concept.title}</h3>
                  <small>
                    {w.sample} 筆獨立證據 ·{" "}
                    {w.accuracy === null
                      ? "尚未測驗"
                      : `近期 ${pct(w.accuracy)}`}
                  </small>
                </div>
                <ChevronRight size={18} />
              </a>
            ))
          ) : (
            <div className="soft-empty">
              <Target size={30} />
              <h3>先累積第一份學習證據</h3>
              <p>完成今日練習後，這裡會依重要度、錯誤率與遺忘程度排序。</p>
            </div>
          )}
        </section>
      </div>
      <div className="two-col">
        <ReadinessCard />
        <section className="card section-card">
          <div className="section-heading">
            <h2>模考紀錄</h2>
            <a href="#/exams">進入模考</a>
          </div>
          {last ? (
            <>
              <div className="big-number">
                {examScore(last).percent}
                <small>分</small>
              </div>
              <p>
                {last.label} · {last.questions.length} 題 ·{" "}
                {new Date(last.submittedAt!).toLocaleDateString("zh-TW")}
              </p>
              <a href={"#/exams/" + last.id}>查看解析與錯因</a>
            </>
          ) : (
            <div className="soft-empty">
              <ChartNoAxesCombined size={30} />
              <h3>Day 12 開始完整練習卷</h3>
              <p>Day 13 補弱點，Day 14 兩回，Day 15 最後一回。</p>
            </div>
          )}
          <a className="quick-link" href="#/numbers">
            數字／期限訓練 <ChevronRight size={18} />
          </a>
        </section>
      </div>
    </>
  );
}
function ReadinessCard() {
  const { c, s } = useStudy(),
    r = readiness(s, c);
  return (
    <section className="card section-card">
      <div className="section-heading">
        <h2>準備度怎麼算？</h2>
        <Badge>暫估 {r.score}/100</Badge>
      </div>
      {r.parts.map((p) => (
        <div className="readiness-row" key={p.name}>
          <span>{p.name}</span>
          <div className="bar">
            <i style={{ width: pct(p.value) }} />
          </div>
          <small>
            {Math.round(p.value * p.max)} / {p.max}
          </small>
        </div>
      ))}
      <p className="tiny muted">
        核心須至少3次、2種題型、跨2日且近期正確率80%，才算掌握。尚無證據記0，不當成答錯。正式考試名稱及合格規則未確認，模考項25分暫不採計（目前上限75）；練習卷分數另列。這不是及格保證。
      </p>
    </section>
  );
}
function PlanPage() {
  const { c, s } = useStudy();
  return (
    <>
      <PageTitle eyebrow="15 DAYS · 優先完成 MUST" title="你的15天通關路線">
        前11天建立重點，最後4天用考試找漏洞。漏掉的核心會帶入下一天。
      </PageTitle>
      <div className="plan-list">
        {c.plans.map((p) => (
          <details
            className={
              "card plan-card " + (p.day === planDay(s) ? "current" : "")
            }
            key={p.day}
            open={p.day === planDay(s)}
          >
            <summary>
              <div className="plan-day">
                DAY<strong>{String(p.day).padStart(2, "0")}</strong>
              </div>
              <div className="grow">
                <h2>{p.title}</h2>
                <small>
                  {addDays(s.settings.planStartDate, p.day - 1)} · 理解{" "}
                  {p.learnMinutes}／做題 {p.answerMinutes}／檢討{" "}
                  {p.reviewMinutes} 分
                </small>
              </div>
              <Badge>
                {p.day >= 12 ? "衝刺" : `${p.requiredConceptIds.length} 核心`}
              </Badge>
              <ChevronRight size={18} />
            </summary>
            <div className="plan-detail">
              <p>{p.outcome}</p>
              {p.examLabels.length > 0 && (
                <p className="notice">
                  限時完整卷：{p.examLabels.join("、")}；每卷依設定{" "}
                  {s.settings.examQuestions} 題／{s.settings.examMinutes}{" "}
                  分鐘，加30分鐘檢討。{p.day === 14 ? "今天至少完成兩回。" : ""}
                </p>
              )}
              <div className="concept-chips">
                {p.requiredConceptIds.map((id) => {
                  const x = c.concepts.find((x) => x.id === id)!;
                  return (
                    <a key={id} href={"#/learn/" + id}>
                      {conceptStatus(s, c, id).learned ? "✓ " : ""}
                      {x.title}
                      {x.issue ? " · 待核" : ""}
                    </a>
                  );
                })}
              </div>
              {p.optionalConceptIds.length > 0 && (
                <p className="tiny">
                  有餘力再學：
                  {p.optionalConceptIds
                    .map((id) => c.concepts.find((x) => x.id === id)?.title)
                    .join("、")}
                </p>
              )}
              {!p.newLearningAllowed && (
                <p className="tiny muted">
                  不加入新章節，以必背、數字期限、反覆錯題與模考為主。
                </p>
              )}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
function Library() {
  const { c, s } = useStudy(),
    [query, setQuery] = useState(""),
    [chapter, setChapter] = useState(""),
    [priority, setPriority] = useState("");
  const items = c.concepts.filter(
    (x) =>
      (!chapter || x.chapterId === chapter) &&
      (!priority || x.priority === priority) &&
      (!query || (x.title + x.outcome + x.tags.join("")).includes(query)),
  );
  return (
    <>
      <PageTitle eyebrow="講義重要度 × 小步學習" title="把考點拆小，把核心學會">
        150個知識點，保留講義頁碼與重要度依據。
      </PageTitle>
      <div className="action-row">
        <a className="button" href="#/practice">
          <Play size={16} />
          混合練習
        </a>
        <a className="button secondary" href="#/numbers">
          數字／期限訓練
        </a>
      </div>
      <div className="filters card">
        <label>
          搜尋考點
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：復效、受益人、期限"
          />
        </label>
        <label>
          章節
          <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="">全部12章</option>
            {c.chapters.map((x) => (
              <option key={x.id} value={x.id}>
                {"★".repeat(x.stars)} {x.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          優先順序
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">全部優先度</option>
            {["MUST", "SHOULD", "OPTIONAL"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted tiny">
        {items.length} 個考點 · MUST 先完成／SHOULD 有餘力補強／OPTIONAL
        選做補分
      </p>
      <div className="lesson-grid">
        {items.map((x) => {
          const st = conceptStatus(s, c, x.id);
          return (
            <a className="card lesson-card" href={"#/learn/" + x.id} key={x.id}>
              <div className="row-between">
                <Badge tone={x.priority}>{x.priority}</Badge>
                <small>
                  {x.issue
                    ? "待核對"
                    : st.mastered
                      ? "✓ 已掌握"
                      : st.learned
                        ? "已練習"
                        : st.read
                          ? "已閱讀"
                          : "未開始"}
                </small>
              </div>
              <h3>{x.title}</h3>
              <p>{x.outcome}</p>
              <div className="tags">
                {x.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="lesson-bottom">
                Day {x.firstDay} · 講義 p.{x.printedPages.join("、")}
                <ChevronRight size={16} />
              </div>
            </a>
          );
        })}
      </div>
      {items.length === 0 && (
        <Empty title="沒有符合的考點">請換個關鍵字或清除篩選。</Empty>
      )}
    </>
  );
}
function Lesson({
  concept,
  onComplete,
}: {
  concept: Concept;
  onComplete?: () => Promise<void>;
}) {
  const { c, s, commit, toast } = useStudy(),
    st = conceptStatus(s, c, concept.id),
    [busy, setBusy] = useState(false),
    chapter = c.chapters.find((x) => x.id === concept.chapterId)!;
  const mark = async () => {
    setBusy(true);
    try {
      await commit((x) => {
        if (!x.learnEvents.some((e) => e.conceptId === concept.id))
          x.learnEvents.push({
            id: uid(),
            conceptId: concept.id,
            readAt: new Date().toISOString(),
          });
        return x;
      });
      if (onComplete) await onComplete();
      else toast("已記錄閱讀，接著做題確認。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="lesson-reader">
      <div className="reader-meta">
        <Badge tone={concept.priority}>{concept.priority}</Badge>
        <span>
          {chapter.title} · {"★".repeat(chapter.stars)}
        </span>
      </div>
      <h1>{concept.title}</h1>
      <div className="tags">
        {concept.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {concept.issue && (
        <div className="notice warning">
          待核對：{concept.issue} 此考點的題目暫不計分、不進模考。
        </div>
      )}
      <section className="card reader-section">
        <div className="eyebrow">先理解</div>
        <p className="lesson-text">{concept.lesson.explanation}</p>
        <div className="example">
          <strong>用情境記住</strong>
          <p>{concept.lesson.example}</p>
        </div>
      </section>
      <section className="card reader-section">
        <div className="eyebrow">遮住上方，再試著回答</div>
        {concept.lesson.recall.map((r, i) => (
          <p key={i}>
            {i + 1}. {r}
          </p>
        ))}
      </section>
      <details className="card evidence">
        <summary>為什麼現在學？查看講義依據</summary>
        <p>{concept.priorityReason}</p>
        <p>
          印刷頁 {concept.printedPages.join("、")}／PDF頁{" "}
          {concept.pdfPages.join("、")} · A+頁：
          {concept.aPlusPages.join("、") || "無"} · 對應章末題：
          {concept.chapterQuestionNumbers.join("、") || "無"}
        </p>
        <p>
          章重要度 {chapter.importanceScore}／100 · {chapter.questionCount}
          道章末題 · {chapter.aPlusBlockCount}
          個A+。優先度含前置能力判斷，並非官方命題機率。
        </p>
      </details>
      <div className="action-row">
        <button className="button" disabled={busy} onClick={() => void mark()}>
          <CircleCheck size={17} />
          {onComplete
            ? "理解了，進入下一步"
            : st.read
              ? "再次確認已理解"
              : "標記已閱讀"}
        </button>
        {!onComplete && !concept.issue && (
          <StartPractice ids={[concept.id]} label="練習這個考點" count={2} />
        )}
      </div>
    </article>
  );
}
function LessonPage({ id }: { id: string }) {
  const { c } = useStudy(),
    x = c.concepts.find((x) => x.id === id);
  return x ? (
    <>
      <a className="back" href="#/library">
        ← 考點與練習
      </a>
      <Lesson key={id} concept={x} />
    </>
  ) : (
    <Empty title="找不到這個考點">請回考點列表重新選擇。</Empty>
  );
}
function StartPractice({
  ids,
  numeric = false,
  count = 10,
  label = "開始10題練習",
}: {
  ids: string[];
  numeric?: boolean;
  count?: number;
  label?: string;
}) {
  const { c, s, commit, toast } = useStudy(),
    [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const qs = pickQuestions(s, c, ids, count, numeric);
      if (!qs.length) {
        toast("目前範圍沒有已開放的題目。");
        return;
      }
      const id = uid();
      await commit((x) => {
        x.practices.push({
          id,
          questionIds: qs.map((q) => q.id),
          index: 0,
          mode: numeric ? "number" : "practice",
          createdAt: new Date().toISOString(),
        });
        return x;
      });
      go("/practice/" + id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="button secondary"
      disabled={busy}
      onClick={() => void start()}
    >
      <Play size={16} />
      {label}
    </button>
  );
}
function PracticeHome({ numeric }: { numeric: boolean }) {
  const { c, s } = useStudy(),
    [scope, setScope] = useState("learned");
  const ids = c.concepts
      .filter(
        (x) =>
          scope === "all" ||
          (scope === "core" && x.priority === "MUST") ||
          (scope === "learned" && conceptStatus(s, c, x.id).read),
      )
      .map((x) => x.id),
    n = c.questions.filter(
      (q) =>
        ids.includes(q.conceptId) &&
        q.status === "source_checked" &&
        (!numeric || q.numeric),
    ).length,
    last = s.practices.find(
      (p) => !p.finishedAt && p.mode === (numeric ? "number" : "practice"),
    );
  return (
    <>
      <PageTitle
        eyebrow={numeric ? "反覆回想 · 記住條件與單位" : "即時解析 · 錯因整理"}
        title={numeric ? "數字／期限訓練" : "混合練習"}
      >
        {numeric
          ? "天數、月份、年限、比例、年齡與金額，要連起算點一起記。"
          : "先作答再看解析。當天重刷同一題型，不會灌高掌握程度。"}
      </PageTitle>
      <section className="card section-card narrow">
        <h2>選擇練習範圍</h2>
        <label>
          出題範圍
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="learned">我已讀過的考點</option>
            <option value="core">全部 MUST 核心</option>
            <option value="all">全部已開放題目</option>
          </select>
        </label>
        <p className="muted">目前有 {n} 題可用。優先抽尚未練過的題型。</p>
        <StartPractice ids={ids} numeric={numeric} />
        {last && (
          <p>
            <a href={"#/practice/" + last.id}>繼續上次未完成的練習 →</a>
          </p>
        )}
      </section>
      {numeric && (
        <div className="notice">
          數字題包含「數值」及「適用條件」兩種檢核。稅務等有疑義內容已隔離，請勿將講義版本直接用於實際投保或申報。
        </div>
      )}
    </>
  );
}
function ErrorPicker({ attempt }: { attempt: Attempt }) {
  const { commit } = useStudy(),
    [selected, setSelected] = useState(attempt.errorTypes),
    [pending, setPending] = useState(false);
  useEffect(() => {
    setSelected(attempt.errorTypes);
  }, [attempt.id, attempt.errorTypes]);
  const change = async (error: ErrorType) => {
    const clean: ErrorType[] = selected.filter((x) => x !== "未分類");
    const next = clean.includes(error)
      ? clean.filter((x) => x !== error)
      : [...clean, error];
    setSelected(next);
    setPending(true);
    try {
      await commit((s) => {
        const a = s.attempts.find((x) => x.id === attempt.id);
        if (a) a.errorTypes = next.length ? next : ["未分類"];
        return s;
      });
    } catch {
      setSelected(attempt.errorTypes);
    } finally {
      setPending(false);
    }
  };
  return (
    <fieldset className="error-picker">
      <legend>這次卡在哪裡？可複選</legend>
      {errors.map((e) => (
        <label key={e}>
          <input
            type="checkbox"
            disabled={pending}
            checked={selected.includes(e)}
            onChange={() => void change(e)}
          />
          {e}
        </label>
      ))}
    </fieldset>
  );
}

function QuestionCard({
  q,
  sessionId,
  mode,
  onNext,
  nextLabel = "下一題",
}: {
  q: Question;
  sessionId: string;
  mode: Attempt["mode"];
  onNext: () => Promise<void>;
  nextLabel?: string;
}) {
  const { c, s, commit } = useStudy(),
    [choice, setChoice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    start = useRef(Date.now()),
    lock = useRef(false),
    attempt = s.attempts.find(
      (a) => a.sessionId === sessionId && a.questionId === q.id,
    ),
    concept = c.concepts.find((x) => x.id === q.conceptId);
  const answer = async () => {
    if (!choice || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await commit((x) => {
        if (
          !x.attempts.some(
            (a) => a.sessionId === sessionId && a.questionId === q.id,
          )
        )
          x.attempts.push(
            makeAttempt(
              q,
              choice,
              sessionId,
              mode,
              new Date(),
              Date.now() - start.current,
            ),
          );
        return x;
      });
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <section className="card question-card">
      <div className="row-between">
        <Badge>{q.numeric ? "數字／條件" : "觀念檢核"}</Badge>
        <span className="tiny muted">{concept?.title}</span>
      </div>
      <h2>{q.stem}</h2>
      <div className="options">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            disabled={!!attempt || busy}
            className={
              "option " +
              (attempt
                ? o.id === q.correctOptionId
                  ? "correct"
                  : o.id === attempt.selectedOptionId
                    ? "incorrect"
                    : ""
                : choice === o.id
                  ? "selected"
                  : "")
            }
            onClick={() => setChoice(o.id)}
          >
            <span>{String.fromCharCode(65 + i)}</span>
            <div>{o.text}</div>
            {attempt && o.id === q.correctOptionId && <CircleCheck size={20} />}
          </button>
        ))}
      </div>
      {attempt ? (
        <>
          <div
            className={"answer-box " + (attempt.correct ? "good" : "bad")}
            role="status"
          >
            <strong>
              {attempt.correct
                ? "答對了，確認你也能說出原因。"
                : "先找原因，這題就是下一個拿分點。"}
            </strong>
            <p>{q.explanation}</p>
          </div>
          {!attempt.correct && <ErrorPicker attempt={attempt} />}
          <p className="tiny muted">
            原創改寫 · 講義115年7月版 p.{q.sourcePages.join("、")} · {q.id} ·
            非官方原題
          </p>
          <div className="action-row">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onNext();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {nextLabel}
              <ChevronRight size={17} />
            </button>
            {concept && <a href={"#/learn/" + concept.id}>回看短課</a>}
          </div>
        </>
      ) : (
        <button
          className="button"
          disabled={!choice || busy}
          onClick={() => void answer()}
        >
          確認答案
        </button>
      )}
    </section>
  );
}
function PracticeRun({ id }: { id: string }) {
  const { c, s, commit } = useStudy(),
    p = s.practices.find((x) => x.id === id);
  if (!p) return <Empty title="找不到練習紀錄">請重新開始一組練習。</Empty>;
  const a = s.attempts.filter((x) => x.sessionId === id);
  if (p.finishedAt || p.index >= p.questionIds.length)
    return (
      <>
        <PageTitle eyebrow="練習完成" title="又多掌握了一點。">
          這次答對 {a.filter((x) => x.correct).length} / {p.questionIds.length}{" "}
          題，錯因會帶入你的弱點排序。
        </PageTitle>
        <div className="action-row">
          <a className="button" href="#/">
            回今日任務
          </a>
          <a className="button secondary" href="#/mistakes">
            整理錯題
          </a>
          <a href={p.mode === "number" ? "#/numbers" : "#/practice"}>
            再練一組
          </a>
        </div>
      </>
    );
  const q = c.questions.find((q) => q.id === p.questionIds[p.index]);
  if (!q || q.status !== "source_checked")
    return <Empty title="這題已暫停使用">請開始新版練習。</Empty>;
  return (
    <>
      <PageTitle
        eyebrow={p.mode === "number" ? "數字／期限訓練" : "混合練習"}
        title={`第 ${p.index + 1} / ${p.questionIds.length} 題`}
      />
      <QuestionCard
        key={q.id}
        q={q}
        sessionId={id}
        mode={p.mode}
        nextLabel={p.index === p.questionIds.length - 1 ? "查看成果" : "下一題"}
        onNext={() =>
          commit((x) => {
            const latest = x.practices.find((y) => y.id === id);
            if (latest && latest.index === p.index) {
              latest.index++;
              if (latest.index >= latest.questionIds.length)
                latest.finishedAt = new Date().toISOString();
            }
            return x;
          })
        }
      />
    </>
  );
}
function TodayRun() {
  const { c, s, commit } = useStudy(),
    queue = s.queues.find((q) => q.date === localDate());
  if (!queue)
    return (
      <Empty title="今天的任務尚未開始">
        <a href="#/">回首頁開始今天的任務</a>
      </Empty>
    );
  const task = queue.tasks.find((t) => !t.completedAt),
    done = queue.tasks.filter((t) => t.completedAt).length;
  const complete = async () => {
    await commit((x) => {
      const t = x.queues
        .find((q) => q.id === queue.id)
        ?.tasks.find((t) => t.id === task?.id);
      if (t) t.completedAt = new Date().toISOString();
      return x;
    });
  };
  if (
    task &&
    ((task.kind === "lesson" &&
      !c.concepts.some((x) => x.id === task.conceptId)) ||
      (task.kind === "question" &&
        !c.questions.some(
          (x) => x.id === task.questionId && x.status === "source_checked",
        )))
  )
    return (
      <section className="card section-card">
        <h2>這項任務的教材已更新或暫停使用</h2>
        <p>舊紀錄已保留，這項不納入掌握證據。</p>
        <button className="button" onClick={() => void complete()}>
          略過舊版任務，繼續
        </button>
      </section>
    );
  if (!task)
    return (
      <>
        <PageTitle
          eyebrow={`DAY ${queue.day} · 今日任務完成`}
          title="今天的進步，已經存好了。"
        >
          完成 {done} 項任務。明天會優先安排錯題與到期複習。
        </PageTitle>
        {queue.unassignedCore > 0 && (
          <div className="notice warning">
            仍有 {queue.unassignedCore}{" "}
            個核心因時間或來源待核未排入；今日完成不代表所有核心已掌握。
          </div>
        )}
        <ReadinessCard />
        <div className="action-row">
          <a className="button" href="#/">
            返回首頁
          </a>
          <a href="#/mistakes">查看今天的弱點</a>
        </div>
      </>
    );
  return (
    <>
      <div className="task-heading">
        <div>
          <div className="eyebrow">
            DAY {queue.day} · {task.reason}
          </div>
          <p>
            已完成 {done} / {queue.tasks.length} 項 · 本次預估 {task.minutes}{" "}
            分鐘
          </p>
        </div>
        <a href="#/">暫停，回首頁</a>
      </div>
      <div className="bar task-progress">
        <i style={{ width: pct(done / queue.tasks.length) }} />
      </div>
      {task.kind === "lesson" ? (
        <Lesson
          key={task.id}
          concept={c.concepts.find((x) => x.id === task.conceptId)!}
          onComplete={complete}
        />
      ) : task.kind === "question" ? (
        <QuestionCard
          key={task.id}
          q={c.questions.find((x) => x.id === task.questionId)!}
          sessionId={task.id}
          mode="task"
          onNext={complete}
          nextLabel="下一項任務"
        />
      ) : (
        <ExamTask task={task} queueId={queue.id} complete={complete} />
      )}
    </>
  );
}
function ExamTask({
  task,
  queueId,
  complete,
}: {
  task: Task;
  queueId: string;
  complete: () => Promise<void>;
}) {
  const { c, s, commit, toast } = useStudy(),
    [busy, setBusy] = useState(false);
  const queue = s.queues.find((q) => q.id === queueId),
    examTask = queue?.tasks.find(
      (t) => t.kind === "exam" && t.examLabel === task.examLabel,
    ),
    exam = s.exams.find((e) => e.id === (task.examId ?? examTask?.examId));
  const start = async () => {
    setBusy(true);
    try {
      let id = "";
      await commit((x) => {
        const t = x.queues
          .find((q) => q.id === queueId)!
          .tasks.find((t) => t.id === task.id)!;
        if (t.examId) {
          id = t.examId;
          return x;
        }
        const active = x.exams.find((e) => !e.submittedAt);
        if (active) throw Error("請先完成目前未交卷的模考。");
        const e = createExam(x, c, task.examLabel!);
        id = e.id;
        x.exams.push(e);
        t.examId = id;
        return x;
      });
      go("/exams/" + id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card section-card">
      <h1>
        {task.examLabel} · {task.kind === "exam" ? "完整限時練習" : "錯題檢討"}
      </h1>
      <p>
        {task.kind === "exam"
          ? "限時作答，交卷後顯示解析。重新整理不會重設倒數。"
          : "逐題看解析，為錯題標記原因，再完成本項檢討。"}
      </p>
      {exam ? (
        <>
          <a className="button" href={"#/exams/" + exam.id}>
            {exam.submittedAt ? "查看結果與解析" : "繼續作答"}
          </a>
          {exam.submittedAt && (
            <button
              className="button secondary"
              onClick={() => void complete()}
            >
              {task.kind === "exam" ? "已交卷，進入檢討" : "已完成檢討，下一項"}
            </button>
          )}
        </>
      ) : task.kind === "exam" ? (
        <button className="button" disabled={busy} onClick={() => void start()}>
          開始本回模考
        </button>
      ) : (
        <p>請先完成前一項模考。</p>
      )}
    </section>
  );
}
function Mistakes() {
  const { c, s } = useStudy(),
    [tab, setTab] = useState("open"),
    weak = weakPoints(s, c),
    items = weak.filter((x) =>
      tab === "all" || tab === "resolved"
        ? tab === "all" || x.mistake === "resolved"
        : x.mistake && x.mistake !== "resolved",
    );
  return (
    <>
      <PageTitle
        eyebrow="重要度 × 錯誤率 × 遺忘 × 題目頻率"
        title="把弱點，練成拿分點。"
      >
        錯題需跨日、不同題型答對，才會逐步退出複習清單。
      </PageTitle>
      <div className="tabs">
        {[
          ["open", "待修正"],
          ["all", "全部弱點"],
          ["resolved", "已修正"],
        ].map(([v, l]) => (
          <button
            className={tab === v ? "active" : ""}
            key={v}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {items.length ? (
        <>
          <StartPractice
            ids={items.map((x) => x.concept.id)}
            label="開始弱點10題"
          />
          <div className="weak-list">
            {items.map((w) => (
              <section className="card section-card" key={w.concept.id}>
                <div className="row-between">
                  <div>
                    <Badge tone={w.concept.priority}>
                      {w.concept.priority}
                    </Badge>
                    <h2>{w.concept.title}</h2>
                  </div>
                  <Badge>
                    {w.mistake === "resolved"
                      ? "已修正"
                      : w.mistake === "recovering"
                        ? "改善中"
                        : w.mistake
                          ? "待修正"
                          : "待累積證據"}
                  </Badge>
                </div>
                <div className="mini-stats">
                  <span>
                    近期正確率{" "}
                    <strong>
                      {w.accuracy === null ? "尚無" : pct(w.accuracy)}
                    </strong>
                  </span>
                  <span>
                    獨立作答 <strong>{w.sample}</strong>
                  </span>
                  <span>
                    複習日期 <strong>{w.nextReview ?? "未安排"}</strong>
                  </span>
                  <span>
                    弱點排序分 <strong>{w.score.toFixed(2)}</strong>
                  </span>
                </div>
                {w.lastWrong && (
                  <>
                    <p className="muted tiny">
                      最近錯因：{w.lastWrong.errorTypes.join("、")} ·{" "}
                      {w.lastWrong.localDate}
                    </p>
                    <details className="mistake-detail">
                      <summary>查看最近錯題與解析</summary>
                      {(() => {
                        const q = c.questions.find(
                          (q) => q.id === w.lastWrong!.questionId,
                        );
                        return q ? (
                          <>
                            <p>
                              <strong>{q.stem}</strong>
                            </p>
                            <p className="text-bad">
                              你的答案：
                              {q.options.find(
                                (o) => o.id === w.lastWrong!.selectedOptionId,
                              )?.text ?? "未作答"}
                            </p>
                            <p>
                              正確答案：
                              {
                                q.options.find(
                                  (o) => o.id === q.correctOptionId,
                                )?.text
                              }
                            </p>
                            <p>{q.explanation}</p>
                            <ErrorPicker attempt={w.lastWrong!} />
                          </>
                        ) : (
                          <p>此題屬舊版教材，歷史紀錄已保留。</p>
                        );
                      })()}
                    </details>
                  </>
                )}
                <a href={"#/learn/" + w.concept.id}>回看短課與練習 →</a>
              </section>
            ))}
          </div>
        </>
      ) : (
        <Empty
          title={tab === "resolved" ? "尚無跨日修正紀錄" : "目前沒有待修正錯題"}
        >
          完成練習後會自動整理在這裡。沒有錯題仍不代表已通過所有考點。
        </Empty>
      )}
      <details className="card evidence">
        <summary>排序與修正規則</summary>
        <p>
          章節重要度（MUST至少0.6）× 平滑錯誤率（錯誤+1／樣本+2）×
          遺忘因子（1至2）×
          講義對應題頻（1至2）。近期採14天內最多10筆獨立作答，避免新考點被零樣本忽略。
        </p>
        <p>
          同日同題型只採第一筆。錯後在較後日期答對才算改善；至少2個不同日期、2種題型答對才算已修正。
        </p>
      </details>
    </>
  );
}
function Exams() {
  const { c, s, commit, toast } = useStudy(),
    [busy, setBusy] = useState(false),
    active = s.exams.find((e) => !e.submittedAt);
  const start = async () => {
    setBusy(true);
    try {
      let id = "";
      await commit((x) => {
        const active = x.exams.find((e) => !e.submittedAt);
        if (active) {
          id = active.id;
          return x;
        }
        const exam = createExam(x, c, "自由練習 " + (x.exams.length + 1));
        x.exams.push(exam);
        id = exam.id;
        return x;
      });
      go("/exams/" + id);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="DAY 12–15 · 用完整卷檢驗自己"
        title="模擬考與考後檢討"
      >
        限時、不即時公布答案，交卷後一次整理錯因。
      </PageTitle>
      <div className="notice">
        正式考試科目尚未確認。目前是「講義綜合練習卷」，
        {s.settings.examQuestions}題／{s.settings.examMinutes}
        分鐘、實務與法規各半，非官方卷型或及格判定。
        <a href="#/settings">調整練習設定</a>
      </div>
      <section className="card section-card">
        <h2>{active ? "有一回尚未交卷" : "準備好，完成一整回。"}</h2>
        <p className="muted">
          Day 12：A卷 · Day 13：補強 · Day 14：B、C兩卷 · Day
          15：D卷。請從今日任務啟動，才會對應每日進度。
        </p>
        <button className="button" disabled={busy} onClick={() => void start()}>
          <Timer size={17} />
          {active ? "繼續未完成的模考" : "開始自由模考"}
        </button>
        <a className="button secondary" href="#/">
          回今日任務
        </a>
      </section>
      <h2 className="section-title">歷次結果</h2>
      {s.exams.length ? (
        <div className="exam-list">
          {[...s.exams].reverse().map((e) => (
            <a className="card exam-row" key={e.id} href={"#/exams/" + e.id}>
              <div>
                <h3>{e.label}</h3>
                <small>
                  {new Date(e.startedAt).toLocaleString("zh-TW")} ·{" "}
                  {e.questions.length}題 · 新題型 {pct(e.unseenFamilyRatio)}
                </small>
              </div>
              <strong>
                {e.submittedAt ? `${examScore(e).percent} 分` : "作答中"}
              </strong>
              <ChevronRight size={18} />
            </a>
          ))}
        </div>
      ) : (
        <Empty title="尚未完成模考">先建立核心，再用完整卷檢查跨章理解。</Empty>
      )}
    </>
  );
}
function ExamPage({ id }: { id: string }) {
  const { s, commit } = useStudy(),
    e = s.exams.find((e) => e.id === id),
    [now, setNow] = useState(Date.now()),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    expiryLock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      e &&
      !e.submittedAt &&
      now >= Date.parse(e.deadlineAt) &&
      !expiryLock.current
    ) {
      expiryLock.current = true;
      void commit((x) => submitExam(x, id)).finally(() => {
        expiryLock.current = false;
      });
    }
  }, [now, e?.submittedAt, id]);
  if (!e) return <Empty title="找不到模考紀錄">請回模考列表。</Empty>;
  if (e.submittedAt) return <ExamReport exam={e} />;
  const seconds = Math.max(
      0,
      Math.ceil((Date.parse(e.deadlineAt) - now) / 1000),
    ),
    q = e.questions[e.index];
  const mutate = async (f: (e: Exam) => void) => {
    await commit((x) => {
      const current = x.exams.find((y) => y.id === id)!;
      if (current.submittedAt) return x;
      if (Date.now() >= Date.parse(current.deadlineAt))
        return submitExam(x, id);
      f(current);
      return x;
    });
  };
  return (
    <>
      <div className="exam-header">
        <div>
          <div className="eyebrow">{e.label} · 限時練習卷</div>
          <h1>
            第 {e.index + 1} / {e.questions.length} 題
          </h1>
        </div>
        <div
          className={"countdown " + (seconds < 300 ? "urgent" : "")}
          role="timer"
        >
          <Timer size={20} />
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </div>
      </div>
      <div className="exam-layout">
        <section className="card question-card">
          <div className="row-between">
            <Badge>交卷後看解析</Badge>
            <button
              className={
                "text-button " + (e.marked.includes(q.id) ? "flagged" : "")
              }
              onClick={() =>
                void mutate((x) => {
                  x.marked = x.marked.includes(q.id)
                    ? x.marked.filter((id) => id !== q.id)
                    : [...x.marked, q.id];
                })
              }
            >
              <Flag size={16} />
              {e.marked.includes(q.id) ? "已標記" : "稍後檢查"}
            </button>
          </div>
          <h2>{q.stem}</h2>
          <div className="options">
            {q.options.map((o, i) => (
              <button
                key={o.id}
                className={
                  "option " + (e.answers[q.id] === o.id ? "selected" : "")
                }
                onClick={() =>
                  void mutate((x) => {
                    x.answers[q.id] = o.id;
                  })
                }
              >
                <span>{String.fromCharCode(65 + i)}</span>
                <div>{o.text}</div>
              </button>
            ))}
          </div>
          <div className="row-between">
            <button
              className="button secondary"
              disabled={e.index === 0}
              onClick={() =>
                void mutate((x) => {
                  x.index = Math.max(0, x.index - 1);
                })
              }
            >
              上一題
            </button>
            {e.index < e.questions.length - 1 ? (
              <button
                className="button"
                onClick={() =>
                  void mutate((x) => {
                    x.index = Math.min(x.questions.length - 1, x.index + 1);
                  })
                }
              >
                下一題
              </button>
            ) : (
              <button className="button" onClick={() => setConfirm(true)}>
                檢查並交卷
              </button>
            )}
          </div>
        </section>
        <aside className="card exam-map">
          <h3>答題卡</h3>
          <p className="tiny muted">
            已答 {Object.keys(e.answers).length}/{e.questions.length} · 標記{" "}
            {e.marked.length}
          </p>
          <div className="question-map">
            {e.questions.map((q, i) => (
              <button
                key={q.id}
                title={e.marked.includes(q.id) ? "已標記" : ""}
                className={
                  (e.answers[q.id] ? "answered " : "") +
                  (e.index === i ? "current " : "") +
                  (e.marked.includes(q.id) ? "flagged" : "")
                }
                onClick={() =>
                  void mutate((x) => {
                    x.index = i;
                  })
                }
              >
                {i + 1}
                {e.marked.includes(q.id) && <span>•</span>}
              </button>
            ))}
          </div>
          <button className="button full" onClick={() => setConfirm(true)}>
            交卷
          </button>
          <p className="tiny muted">
            離開頁面仍計時；到期自動交卷。關閉瀏覽器後會在下次開啟本卷時結算。
          </p>
        </aside>
      </div>
      {confirm && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            className="modal card"
          >
            <h2 id="submit-title">確認交卷</h2>
            <p>
              尚有 {e.questions.length - Object.keys(e.answers).length} 題未答、
              {e.marked.length} 題標記待查。交卷後不能再修改答案。
            </p>
            <div className="action-row">
              <button
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await commit((x) => submitExam(x, id));
                    setConfirm(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                確認交卷
              </button>
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                繼續檢查
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function ExamReport({ exam: e }: { exam: Exam }) {
  const { s } = useStudy(),
    score = examScore(e),
    [filter, setFilter] = useState("wrong"),
    qs = e.questions.filter(
      (q) => filter === "all" || e.answers[q.id] !== q.correctOptionId,
    );
  return (
    <>
      <PageTitle
        eyebrow={`${e.label} · 已交卷`}
        title={`這回練習 ${score.percent} 分`}
      >
        答對 {score.correct} / {score.total} · 未答 {score.unanswered} · 新題型{" "}
        {pct(e.unseenFamilyRatio)}。此為練習成績，不判定正式考試及格。
      </PageTitle>
      <div className="action-row">
        <a className="button" href="#/task">
          返回今日任務
        </a>
        <a className="button secondary" href="#/exams">
          全部模考紀錄
        </a>
      </div>
      {e.unseenFamilyRatio < 0.5 && (
        <div className="notice warning">
          本卷過半題型曾經練過，分數可能有熟題效應；請連同跨日掌握與錯題重犯一起判讀。
        </div>
      )}
      <div className="tabs">
        <button
          className={filter === "wrong" ? "active" : ""}
          onClick={() => setFilter("wrong")}
        >
          只看錯題（{score.total - score.correct}）
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          全部解析
        </button>
      </div>
      {qs.length ? (
        qs.map((q) => {
          const a = s.attempts.find(
            (a) => a.sessionId === e.id && a.questionId === q.id,
          );
          return (
            <section className="card report-question" key={q.id}>
              <h3>
                {e.questions.indexOf(q) + 1}. {q.stem}
              </h3>
              <p
                className={
                  e.answers[q.id] === q.correctOptionId
                    ? "text-good"
                    : "text-bad"
                }
              >
                你的答案：
                {q.options.find((o) => o.id === e.answers[q.id])?.text ??
                  "未作答"}
              </p>
              <p>
                正確答案：
                <strong>
                  {q.options.find((o) => o.id === q.correctOptionId)?.text}
                </strong>
              </p>
              <p className="muted">{q.explanation}</p>
              {a && !a.correct && <ErrorPicker attempt={a} />}
              <small>講義 p.{q.sourcePages.join("、")} · 原創改寫</small>
            </section>
          );
        })
      ) : (
        <Empty title="這一回全部答對">明天用跨日測驗確認記憶是否穩固。</Empty>
      )}
    </>
  );
}
function SettingsPage() {
  const { c, s, commit, toast } = useStudy(),
    [form, setForm] = useState(s.settings),
    [incoming, setIncoming] = useState<StudyState | null>(null),
    [busy, setBusy] = useState(false),
    [importMode, setImportMode] = useState("merge"),
    input = useRef<HTMLInputElement>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await commit((x) => {
        x.settings = {
          ...form,
          profileId: x.settings.profileId,
          setupComplete: true,
          updatedAt: new Date().toISOString(),
        };
        return x;
      });
      toast("設定已保存。已建立的今日任務與進行中模考不會重排。");
    } finally {
      setBusy(false);
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error("檔案超過20MB。");
      setIncoming(parseRecord(await file.text(), c));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const apply = async () => {
    if (!incoming) return;
    setBusy(true);
    try {
      await backupState(s);
      await commit((current) =>
        importMode === "replace"
          ? { ...incoming, contentVersion: c.version }
          : mergeRecords(current, incoming),
      );
      setIncoming(null);
      toast("紀錄已匯入；原紀錄已在本機備份。");
    } catch (e) {
      toast("未匯入：" + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle eyebrow="你的時間、你的進度" title="設定與資料備份">
        不需帳號。手機與電腦以匯出／匯入紀錄接續學習。
      </PageTitle>
      <form className="card section-card" onSubmit={(e) => void save(e)}>
        <h2>學習計畫</h2>
        <div className="form-grid">
          <label>
            計畫開始日
            <input
              required
              type="date"
              value={form.planStartDate}
              onChange={(e) =>
                setForm({ ...form, planStartDate: e.target.value })
              }
            />
          </label>
          <label>
            考試日期（未定可留白）
            <input
              type="date"
              value={form.examDate ?? ""}
              onChange={(e) =>
                setForm({ ...form, examDate: e.target.value || null })
              }
            />
          </label>
          <label>
            每日學習時間（分鐘）
            <input
              required
              type="number"
              min={180}
              max={600}
              step={10}
              value={form.dailyMinutes}
              onChange={(e) =>
                setForm({ ...form, dailyMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <h2>完整練習卷</h2>
        <p className="tiny muted">
          這些是自訂練習設定，不會變成官方考制。正式報名名稱仍需確認；時間計算採台北時區。
        </p>
        <div className="form-grid">
          <label>
            練習名稱
            <input
              required
              maxLength={100}
              value={form.examName}
              onChange={(e) => setForm({ ...form, examName: e.target.value })}
            />
          </label>
          <label>
            每回題數
            <input
              required
              type="number"
              min={10}
              max={100}
              value={form.examQuestions}
              onChange={(e) =>
                setForm({ ...form, examQuestions: Number(e.target.value) })
              }
            />
          </label>
          <label>
            限時分鐘
            <input
              required
              type="number"
              min={10}
              max={180}
              value={form.examMinutes}
              onChange={(e) =>
                setForm({ ...form, examMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button className="button" disabled={busy}>
          保存設定
        </button>
        <p className="tiny muted">
          Day
          14兩回各需「限時＋30分鐘檢討」。調整後若超過每日時間，請增加當日投入。
        </p>
      </form>
      <section className="card section-card">
        <h2>匯出與匯入</h2>
        <p>紀錄存在此瀏覽器，清除網站資料會移除進度。換裝置前先匯出。</p>
        <div className="action-row">
          <button className="button" onClick={() => downloadState(s)}>
            <Download size={17} />
            匯出學習紀錄
          </button>
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
          >
            選擇紀錄檔匯入
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            aria-label="匯入紀錄檔"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>
        <p className="tiny muted">
          合併保留目前設定，依紀錄識別碼去重；同筆紀錄衝突時會停止。取代會先備份。跨裝置修改同一場模考後，請選擇要保留的版本，不會自動猜測。
        </p>
      </section>
      <section className="card section-card">
        <h2>安裝與離線使用</h2>
        <p>
          部署後先連網開啟一次，等待離線教材準備好。Android／桌面可使用瀏覽器的「安裝應用程式」；iPhone使用Safari「分享
          → 加入主畫面」。
        </p>
        <p className="tiny muted">
          開發預覽不啟用離線快取；正式建置支援離線。更新時保留學習紀錄，模考進行中請完成後再更新。
        </p>
      </section>
      <section className="card section-card">
        <h2>教材與資料來源</h2>
        {c.sources.map((x) => (
          <div className="source-row" key={x.title}>
            <h3>
              {x.url ? (
                <a href={x.url} target="_blank" rel="noreferrer">
                  {x.title} ↗
                </a>
              ) : (
                x.title
              )}
            </h3>
            <p>{x.note}</p>
          </div>
        ))}
        <p className="tiny muted">
          教材版本 {c.version} · {c.concepts.length} 知識點 ·{" "}
          {c.questions.filter((q) => q.status === "source_checked").length}{" "}
          題開放／{c.questions.filter((q) => q.status === "quarantined").length}{" "}
          題待核。重要度只以講義證據為主，外部法規不改寫章節權重。
        </p>
        <details>
          <summary>查看待核對考點</summary>
          {c.concepts
            .filter((x) => x.issue)
            .map((x) => (
              <p key={x.id}>
                <a href={"#/learn/" + x.id}>{x.title}</a>：{x.issue}
              </p>
            ))}
        </details>
      </section>
      {incoming && (
        <div className="modal-backdrop">
          <section
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <h2 id="import-title">預覽匯入紀錄</h2>
            <p>
              {incoming.attempts.length} 筆作答、{incoming.learnEvents.length}{" "}
              筆閱讀、{incoming.exams.length} 回模考。
            </p>
            <p className="tiny muted">
              教材版本 {incoming.contentVersion}
              ；舊版或不明題目保留紀錄，但不納入目前掌握度。
            </p>
            <label>
              匯入方式
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="merge">合併，保留目前設定</option>
                <option value="replace">取代目前全部進度與設定</option>
              </select>
            </label>
            <div className="action-row">
              <button
                className="button"
                disabled={busy}
                onClick={() => void apply()}
              >
                確認匯入
              </button>
              <button
                className="button secondary"
                onClick={() => downloadState(s, "-匯入前")}
              >
                先下載目前備份
              </button>
              <button className="text-button" onClick={() => setIncoming(null)}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
