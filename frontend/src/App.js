import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import InputBox from "./InputBox";

const STORAGE_KEY = "soulscape-entries-v1";

// Helper to serialize entries while excluding large fields
function serializeEntry(entry) {
  const { image, explanation, ...rest } = entry;
  return rest;
}

function saveEntriesToStorage(entries) {
  try {
    const serialized = entries.map(serializeEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      console.warn("localStorage quota exceeded. Removing oldest entries...");
      // Keep only the last 10 entries to free space
      const trimmed = entries.slice(-10).map(serializeEntry);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (err2) {
        console.error("Failed to save even trimmed entries", err2);
      }
    } else {
      console.error("Failed to save entries", err);
    }
  }
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function blendHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(lerp(ca.r, cb.r, t));
  const g = Math.round(lerp(ca.g, cb.g, t));
  const blue = Math.round(lerp(ca.b, cb.b, t));
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(blue)}`;
}

function mixStates(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  const palette = a.palette.map((color, idx) => blendHex(color, b.palette[idx % b.palette.length], t));
  return {
    ...a,
    emotion: `${a.emotion}→${b.emotion}`,
    intensity: lerp(a.intensity, b.intensity, t),
    palette,
    seed: lerp(a.seed, b.seed, t),
  };
}

const uid = () =>
  (window.crypto?.randomUUID?.() ||
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`).toString();

function createEntry({ text, emotion, intensity, palette, confidence, explanation, coping, support }) {
  return {
    id: uid(),
    text,
    emotion,
    intensity,
    palette,
    seed: Math.random() * 1000,
    // include optional analysis metadata when present
    confidence: confidence ?? undefined,
    explanation: explanation ?? undefined,
    coping: coping ?? undefined,
    support: support ?? undefined,
    createdAt: new Date().toISOString(),
  };
}

function useSoulscapeRenderer(canvasRef, state) {
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      const { width } = canvas.getBoundingClientRect();
      canvas.width = width * window.devicePixelRatio;
      canvas.height = 600 * window.devicePixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (ts) => {
      const s = stateRef.current;
      if (!s) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        raf = requestAnimationFrame(draw);
        return;
      }

      const t = ts * 0.001;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      const intensity = s.intensity ?? 0.4;

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, s.palette[0]);
      gradient.addColorStop(0.5, s.palette[1 % s.palette.length]);
      gradient.addColorStop(1, s.palette[2 % s.palette.length]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Floating orbs
      for (let i = 0; i < 24; i++) {
        const phase = (s.seed + i * 7.13 + t * (0.2 + intensity)) % 1;
        const x = (0.1 + 0.8 * Math.sin(phase * Math.PI * 2 + i)) * w;
        const y = (0.1 + 0.8 * Math.cos(phase * Math.PI * 2 + i * 0.7)) * h;
        const radius = 40 + 120 * Math.abs(Math.sin(t * 0.6 + i)) * (0.3 + intensity);
        const orbGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        orbGradient.addColorStop(0, `${s.palette[i % s.palette.length]}55`);
        orbGradient.addColorStop(1, `${s.palette[(i + 1) % s.palette.length]}00`);
        ctx.fillStyle = orbGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pulsing waves
      ctx.lineWidth = 2 + intensity * 4;
      ctx.strokeStyle = `${s.palette[0]}99`;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const noise = Math.sin((x / w) * Math.PI * 2 * (1 + k * 0.2) + t + s.seed * 0.01 * k);
          const y = h * 0.5 + noise * 40 * (k + 1) * (0.5 + intensity);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Center pulse
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.fillStyle = `${s.palette[1 % s.palette.length]}${Math.round(80 + pulse * 120)
        .toString(16)
        .padStart(2, "0")}`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 80 + 60 * pulse * intensity, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef, stateRef]);
}

function EntryCard({ entry, onSelect, isActive }) {
  const date = new Date(entry.createdAt);
  return (
    <button className={`entry ${isActive ? "active" : ""}`} onClick={() => onSelect(entry.id)}>
      <div>
        <p className="entry-date">{date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        <p className="entry-title">{entry.emotion} · {(entry.intensity * 100).toFixed(0)}%</p>
        <p className="entry-text">{entry.text}</p>
        {isActive && entry.coping && (
          <div className="entry-coping">
            <p className="muted">Coping:</p>
            <ul>
              {entry.coping.slice(0, 2).map((c, i) => (
                <li key={i} style={{ fontSize: 12 }}>{c.title}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </button>
  );
}

function JourneyControls({ entries, onPlay, onStop, isPlaying }) {
  const canPlay = entries.length >= 2;
  return (
    <div className="journey">
      <div>
        <p className="label">Monthly Journey</p>
        <p className="muted">Morphs each saved soulscape into the next. Works best with 5+ entries.</p>
      </div>
      <div className="journey-actions">
        <button className="secondary" onClick={isPlaying ? onStop : onPlay} disabled={!canPlay}>
          {isPlaying ? "Pause journey" : "Play journey"}
        </button>
        {!canPlay && <span className="hint">Save at least 2 entries</span>}
      </div>
    </div>
  );
}

function App() {
  const canvasRef = useRef(null);
  const [entries, setEntries] = useState([]);
  const [currentState, setCurrentState] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [journeyIdx, setJourneyIdx] = useState(0);
  const [journeyT, setJourneyT] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setEntries(parsed);
      setCurrentState(parsed[parsed.length - 1] || null);
    }
  }, []);

  useEffect(() => {
    saveEntriesToStorage(entries);
  }, [entries]);

  const activeState = useMemo(() => {
    if (isPlaying && entries.length >= 2) {
      const a = entries[journeyIdx % entries.length];
      const b = entries[(journeyIdx + 1) % entries.length];
      return mixStates(a, b, journeyT);
    }
    if (selectedId) return entries.find((e) => e.id === selectedId) || currentState;
    return currentState || entries[entries.length - 1];
  }, [isPlaying, entries, journeyIdx, journeyT, selectedId, currentState]);

  useSoulscapeRenderer(canvasRef, activeState);

  const handleEmotionDetected = (payload) => {
    const entry = createEntry(payload);
    setCurrentState(entry);
    setEntries((prev) => [...prev, entry]);
    setSelectedId(entry.id);
  };

  const handleSelectEntry = (id) => {
    setIsPlaying(false);
    setSelectedId(id);
  };

  const handlePlayJourney = () => {
    if (entries.length < 2) return;
    setSelectedId(null);
    setIsPlaying(true);
  };

  const handlePauseJourney = () => setIsPlaying(false);

  useEffect(() => {
    if (!isPlaying) return;
    let raf;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const duration = 2400;
      const loop = elapsed % (duration * entries.length);
      const idx = Math.floor(loop / duration);
      const t = (loop % duration) / duration;
      setJourneyIdx(idx);
      setJourneyT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, entries.length]);

  const handleSaveSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas || !activeState) return;
    // Store image separately to avoid bloating localStorage
    const dataUrl = canvas.toDataURL("image/png");
    const imageKey = `soulscape-image-${activeState.id}`;
    try {
      sessionStorage.setItem(imageKey, dataUrl);
    } catch (err) {
      console.warn("Failed to save image", err);
    }
    // Don't store image in entries to save space
  };

  const latest = entries[entries.length - 1];

  // Feedback form state
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackEmotion, setFeedbackEmotion] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStats, setFeedbackStats] = useState({ total: 0, byEmotion: {} });
  const [showExplanation, setShowExplanation] = useState(false);
  const [copingOpen, setCopingOpen] = useState(false); // collapsed by default

  const submitFeedback = async () => {
    if (!activeState) return alert("No active entry to attach feedback to");
    const payload = {
      text: activeState.text || "",
      correctedEmotion: feedbackEmotion || null,
      note: feedbackNote || null,
    };
    try {
      setFeedbackSending(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to send feedback");
      setShowFeedback(false);
      setFeedbackEmotion("");
      setFeedbackNote("");
      alert("Thanks — feedback recorded.");
      // refresh stats
      fetchFeedbackStats();
    } catch (err) {
      console.error(err);
      alert("Failed to send feedback. Is the backend running?");
    } finally {
      setFeedbackSending(false);
    }
  };

  const fetchFeedbackStats = async () => {
    try {
      const res = await fetch("/api/feedback/stats");
      if (!res.ok) return;
      const data = await res.json();
      setFeedbackStats({ total: data.total || 0, byEmotion: data.byEmotion || {} });
    } catch (err) {
      // ignore
    }
  };

  // load stats on mount
  useEffect(() => {
    fetchFeedbackStats();
  }, []);

  return (
    <div className="shell">
      <header className="nav">
        <div>
          <p className="eyebrow">Soulscape · Digital Safe Space</p>
          <h1>Your feelings as living art</h1>
          <p className="muted">
            Type how you feel. We translate it into a responsive, abstract “soulscape.” Save moments and watch them blend into a monthly journey.
          </p>
        </div>
          <div className="nav-actions">
          <button className="secondary" onClick={handleSaveSnapshot} disabled={!activeState}>
            Save this moment
          </button>
          <button
            className="secondary"
            onClick={() =>
              alert(
                `Feedback submissions: ${feedbackStats.total}\n` +
                  Object.entries(feedbackStats.byEmotion || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")
              )
            }
          >
            Feedback ({feedbackStats.total})
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="left">
          <InputBox onEmotionDetected={handleEmotionDetected} />
          <JourneyControls entries={entries} onPlay={handlePlayJourney} onStop={handlePauseJourney} isPlaying={isPlaying} />
          <div className="history">
            <p className="label">Saved entries</p>
            {entries.length === 0 && <p className="muted">Your journey hasn’t started yet.</p>}
            <div className="entry-grid">
              {entries.slice().reverse().map((entry) => (
                <EntryCard key={entry.id} entry={entry} onSelect={handleSelectEntry} isActive={selectedId === entry.id || (!selectedId && latest?.id === entry.id)} />
              ))}
            </div>
          </div>
        </section>

        <section className="canvas-card">
          <div className="canvas-header">
            <div>
              <p className="label">Live soulscape</p>
              <p className="muted">
                Colors reflect the emotion, motion follows intensity. Journey mode morphs one day into the next.
              </p>
            </div>
            {activeState && (
              <div className="pill">
                <span className="dot" style={{ background: activeState.palette[0] }} />
                <div>
                  <p>{activeState.emotion} · {(activeState.intensity * 100).toFixed(0)}%</p>
                  {activeState.subtypes && activeState.subtypes.length > 0 && (
                    <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {activeState.subtypes.map((s) => s.subtype).join(", ")}
                    </p>
                  )}
                </div>
                {activeState.confidence !== undefined && (
                  <small style={{ marginLeft: 8, color: "#666" }}>Interpretation confidence: {(activeState.confidence * 100).toFixed(0)}%</small>
                )}
                {activeState.explanation && (
                  <button className="link" onClick={() => setShowExplanation((s) => !s)} style={{ marginLeft: 8 }}>
                    {showExplanation ? "Hide details" : "Details"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} className="canvas" />
          </div>
          {/* Support / crisis block - shown only when backend returns support */}
          {activeState?.support && (
            <div
              className="support-panel"
              style={{
                border: "1px solid #e6eef8",
                padding: 14,
                marginTop: 12,
                borderRadius: 10,
                background: "linear-gradient(180deg,#fbfdff,#f4f8ff)",
                color: "#0d1720",
                boxShadow: "0 1px 6px rgba(13,18,24,0.04)",
              }}
              role="region"
              aria-label="Support and resources"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p className="label" style={{ marginBottom: 6 }}>Support</p>
                  <p style={{ margin: 0, lineHeight: 1.4 }}>{activeState.support.message}</p>
                  {activeState.support.severity && activeState.support.severity !== "elevated" && (
                    <p style={{ margin: "8px 0 0 0", color: "#55606a", fontSize: 13 }}><em>Detected level: {activeState.support.severity}</em></p>
                  )}
                </div>
              </div>

              {/* Quick grounding script — brief, conversational, not clinical */}
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "#ffffff", border: "1px solid #eef4fb" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>A short grounding you can try now</p>
                <ol style={{ marginTop: 8 }}>
                  <li>Stop and take 3 slow breaths — in for 4, out for 6.</li>
                  <li>Look around and name 3 things you can see, 2 you can touch, 1 you can hear.</li>
                  <li>If you can, place your feet on the floor and notice the contact — hold for a few breaths.</li>
                </ol>
                <p style={{ margin: "6px 0 0 0", color: "#55606a", fontSize: 13 }}>Try these for 60–120 seconds and notice any small change.</p>
              </div>

              {/* Resources (only shown when provided by backend) */}
              {activeState.support.resources && activeState.support.resources.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Helplines & resources</p>
                  <ul style={{ marginTop: 8 }}>
                    {activeState.support.resources.map((r, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {r.url && r.url.startsWith("tel:") ? (
                            <a href={r.url} style={{ color: "#0b66c3", fontWeight: 600 }}>{r.label}</a>
                          ) : (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0b66c3", fontWeight: 600 }}>{r.label}</a>
                          )}
                          {r.note ? <span style={{ color: "#6b7280", marginTop: 4 }}>{r.note}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 8, padding: 10, borderRadius: 6, background: "#fff3f3", border: "1px solid rgba(176,0,32,0.06)" }}>
                    <p style={{ margin: 0, color: "#8b0000", fontWeight: 600 }}>If you are in immediate danger, contact local emergency services now.</p>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: 0, color: "#55606a" }}>If these feelings feel overwhelming, consider reaching out to someone you trust or a professional.</p>
                </div>
              )}

              {/* Quiet disclaimer from backend */}
              {activeState.disclaimer && (
                <p className="muted" style={{ marginTop: 12 }}>{activeState.disclaimer}</p>
              )}
            </div>
          )}
          {activeState?.coping && (
            <div className="coping-panel">
              <div className="coping-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p className="label">Coping suggestions</p>
                  <p className="muted">Short, non-clinical steps you can try now.</p>
                </div>
                <div>
                  <button className="link" onClick={() => setCopingOpen((s) => !s)}>{copingOpen ? "Hide" : "Show"}</button>
                </div>
              </div>

              {copingOpen ? (
                <>
                  <ul>
                    {activeState.coping.map((c, i) => (
                      <li key={i}>
                        <strong>{c.title}</strong>: {c.description}
                      </li>
                    ))}
                  </ul>
                  {showExplanation && activeState.explanation && (
                    <div className="explanation-box">
                      <p><strong>Sentiment score:</strong> {activeState.explanation.sentimentScore}</p>
                      <p><strong>Top candidates:</strong> {activeState.explanation.topCandidates.map(t => `${t.emotion}(${t.score})`).join(", ")}</p>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: "8px 0", color: "#666", fontSize: 13 }}>
                  <em>Suggestions are available — expand to view.</em>
                </div>
              )}

              <div className="feedback-row">
                <button className="secondary" onClick={() => setShowFeedback((s) => !s)}>
                  {showFeedback ? "Cancel" : "This doesn’t feel right"}
                </button>
              </div>
              {showFeedback && (
                <div className="feedback-form">
                  <p className="muted">Tell us what the emotion should be (optional) and any note.</p>
                  <select value={feedbackEmotion} onChange={(e) => setFeedbackEmotion(e.target.value)}>
                    <option value="">— Leave as-is —</option>
                    <option value="joy">joy</option>
                    <option value="calm">calm</option>
                    <option value="sadness">sadness</option>
                    <option value="anger">anger</option>
                    <option value="fear">fear</option>
                    <option value="mixed">mixed</option>
                  </select>
                  <textarea value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} placeholder="Optional note" rows={3} />
                  <div style={{ marginTop: 8 }}>
                    <button className="primary" onClick={submitFeedback} disabled={feedbackSending}>
                      {feedbackSending ? "Sending…" : "Send feedback"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
