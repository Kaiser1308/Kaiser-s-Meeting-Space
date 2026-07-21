import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Mode = "record" | "translate";

function App() {
  const [mode, setMode] = useState<Mode>("record");
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const active = state !== "idle";
  return <main>
    <aside><div className="brand">K<span>•</span></div><nav><button className="selected">Meetings</button><button>Templates</button><button>Settings</button></nav></aside>
    <section className="page">
      <header><div><p className="eyebrow">KAISER'S MEETING SPACE</p><h1>Your meetings, fully preserved.</h1><p className="sub">Record every word. Translate live. Create evidence-linked minutes.</p></div><button className="profile">KT</button></header>
      <div className="grid">
        <article className="start-card"><p className="eyebrow">NEW MEETING</p><h2>Ready when you are.</h2>
          <div className="modes"><button className={mode === "record" ? "active" : ""} onClick={() => setMode("record")}><b>Record meeting</b><small>Full audio + transcript</small></button><button className={mode === "translate" ? "active" : ""} onClick={() => setMode("translate")}><b>Live translation</b><small>Vietnamese ↔ English</small></button></div>
          <div className="sources"><span>MICROPHONE</span><strong>Default microphone</strong><span>SYSTEM AUDIO</span><strong>Computer audio</strong></div>
          <button className="record" onClick={() => setState(state === "idle" ? "recording" : "idle")}><i />{active ? "End meeting" : "Start meeting"}</button>
          {active && <button className="pause" onClick={() => setState(state === "paused" ? "recording" : "paused")}>{state === "paused" ? "Resume" : "Pause"}</button>}
        </article>
        <article className="evidence"><p className="eyebrow">DATA PROMISE</p><h2>Nothing gets summarized away.</h2><div className="evidence-row"><b>01</b><span><strong>Original audio</strong><small>Immutable source recording</small></span></div><div className="evidence-row"><b>02</b><span><strong>Complete transcript</strong><small>Speakers, timestamps, revisions</small></span></div><div className="evidence-row"><b>03</b><span><strong>Detailed minutes</strong><small>Every claim linked to evidence</small></span></div></article>
      </div>
      <section className="recent"><div><p className="eyebrow">LIBRARY</p><h2>Recent meetings</h2></div><p className="empty">Your completed meetings will appear here.</p></section>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
