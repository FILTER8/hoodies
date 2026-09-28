"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { mountSpaceHood, type Archetype, type Bitmap, type SpaceHoodOptions, type RunStats, type GameControls } from "./spacehood-engine";

async function randomFrames(signal: AbortSignal): Promise<Bitmap[]> {
  const ids: string[] = [];
  for (let offset = 0; ; ) {
    const page = await json<{ total: number; limit: number; frames: { tokenId: number }[] }>(`/api/arcade/spacehood/frames?offset=${offset}`, signal);
    ids.push(...page.frames.map(frame => String(frame.tokenId)));
    if (offset + page.limit >= page.total) break;
    if (!(page.limit > 0)) throw new Error("Invalid HoodFrame pagination.");
    offset += page.limit;
  }
  const pool = [...new Set(ids)];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const results: Bitmap[] = [];
  for (let i = 0; i < pool.length && results.length < 8; i += 8) {
    const batch = await Promise.allSettled(pool.slice(i, i + 8).map(id => json<AssetResponse>(`/api/arcade/hoodframe/${id}`, signal).then(data => bitmap(data, 12))));
    results.push(...batch.flatMap(item => item.status === "fulfilled" ? [item.value] : []));
    if (signal.aborted) throw new Error("Loading cancelled.");
  }
  if (!results.length) throw new Error("No saved HoodFrames could be loaded.");
  return results.slice(0, 8);
}
const ABILITIES: Record<Archetype, string> = {
  Builder: "REINFORCED · 4 STARTING LIVES",
  Flipper: "AGILE · 25% FASTER MOVEMENT",
  Collector: "SCAVENGER · +1 SPECIAL AMMO · DOUBLE GALLERY POINTS",
  HODLer: "GUARD · 6 SECOND SPAWN SHIELD",
};
type HoodieAsset = { id: string; archetype: Archetype; sprite: Bitmap };
type WalletList = { owner: string; ids: string[]; error?: string };
type Loaded = { owner: string; id: string; hoodie?: HoodieAsset; frames?: Bitmap[]; residents?: Bitmap[]; error?: string };
type AssetResponse = { tokenId?: string | number; archetype?: string; error?: string; sprite?: { width: number; height: number; pixels: string[] } };

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}
function bitmap(data: AssetResponse, expected: number): Bitmap {
  const s = data.sprite;
  if (!s || s.width !== expected || s.height !== expected || !Array.isArray(s.pixels) || s.pixels.length !== expected || s.pixels.some(row => typeof row !== "string" || row.length !== expected || /[^01]/.test(row))) {
    throw new Error(`Expected a ${expected}×${expected} binary sprite from the arcade route.`);
  }
  return { width: s.width, height: s.height, rows: s.pixels };
}
async function hoodie(id: string, signal: AbortSignal): Promise<HoodieAsset> {
  const data = await json<AssetResponse>(`/api/arcade/hoodie/${encodeURIComponent(id)}`, signal);
  const names: Record<string, Archetype> = { builder: "Builder", collector: "Collector", flipper: "Flipper", hodler: "HODLer" };
  const archetype = names[(data.archetype || "").trim().toLowerCase()];
  if (!archetype) throw new Error(`Hoodie #${id} has an unrecognized archetype.`);
  return { id, archetype, sprite: bitmap(data, 20) };
}

function TouchControls({ controls, phase }: { controls: React.RefObject<GameControls | null>; phase?: RunStats["phase"] }) {
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const selectedDirection = useRef(0);
  function release() {
    pointer.current = null;
    selectedDirection.current = 0;
    controls.current?.move(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
  }
  useEffect(() => {
    const reset = () => {
      pointer.current = null;
      selectedDirection.current = 0;
      controls.current?.move(0, 0);
      if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    };
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    document.addEventListener("visibilitychange", reset);
    return () => { reset(); window.removeEventListener("blur", reset); window.removeEventListener("resize", reset); document.removeEventListener("visibilitychange", reset); };
  }, [controls]);
  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId || !stick.current) return;
    const box = stick.current.getBoundingClientRect();
    const dx = event.clientX - box.left - box.width / 2, dy = event.clientY - box.top - box.height / 2;
    const radius = box.width * .3, length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
    const x = dx * scale, y = dy * scale, dead = 8;
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`;
    controls.current?.move(Math.abs(x) > dead ? Math.sign(x) : 0, Math.abs(y) > dead ? Math.sign(y) : 0);
    const direction = Math.abs(x) > radius * .5 ? Math.sign(x) : 0;
    if (direction && direction !== selectedDirection.current) controls.current?.select(direction);
    selectedDirection.current = direction;
  }
  return <div className="sh-touch-controls" aria-label="Touch game controls">
    <div className="sh-stick-area"><div ref={stick} className="sh-stick" role="group" aria-label="Joystick: drag to move; left or right to select"
      onPointerDown={event => { if (pointer.current !== null) return; event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
      onPointerMove={move} onPointerUp={event => { if (pointer.current === event.pointerId) release(); }}
      onPointerCancel={event => { if (pointer.current === event.pointerId) release(); }} onLostPointerCapture={event => { if (pointer.current === event.pointerId) release(); }}>
      <span className="sh-stick-cross" /><span ref={knob} className="sh-stick-knob" />
    </div><span className="sh-control-label">MOVE</span></div>
    <span className="sh-console-mark" aria-hidden="true">OCH<br />84 × 48</span>
    <div className="sh-action-area">
      <button className="sh-fire" type="button" onPointerDown={event => { event.preventDefault(); controls.current?.action(); }} onClick={event => { if (event.detail === 0) controls.current?.action(); }} aria-label="Start, launch or fire one shot">{phase === "ready" || phase === "ended" ? "START" : phase === "briefing" ? "GO" : phase === "paused" ? "RESUME" : "FIRE"}</button>
      <button className="sh-special" type="button" onPointerDown={event => { event.preventDefault(); controls.current?.useSpecial(); }} onClick={event => { if (event.detail === 0) controls.current?.useSpecial(); }} aria-label="Use special weapon">SPECIAL</button>
    </div>
  </div>;
}

function Game({ options }: { options: SpaceHoodOptions }) {
  const [stats, setStats] = useState<RunStats | null>(null);
  const controls = useRef<GameControls | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const screenWell = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const sound = useRef<HTMLButtonElement>(null);
  const pause = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!canvas.current || !sound.current || !pause.current || !status.current) return;
    const dispose = mountSpaceHood({ canvas: canvas.current, soundButton: sound.current, pauseButton: pause.current, status: status.current, startButton: start.current || undefined }, {...options,onStats:setStats,onControls:value=>{controls.current=value;}});
    return () => { controls.current=null;dispose(); };
  }, [options]);
  useEffect(() => {
    const well = screenWell.current, screen = canvas.current;
    if (!well || !screen) return;
    function resize() {
      if (!well || !screen) return;
      const scale = Math.max(1, Math.min(8, Math.floor(well.clientWidth / 84)));
      screen.style.width = `${84 * scale}px`;
      screen.style.height = `${48 * scale}px`;
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(well);
    return () => observer.disconnect();
  }, []);
  function downloadRun(previous = false) {
    const report = previous ? controls.current?.exportPreviousRun() : controls.current?.exportRun();
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = `spacehood-${report.exportSource}-${report.runId || Date.now()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className="sh-console">
    <div className="sh-game-controls"><button ref={start} type="button">START</button><button ref={sound} type="button" aria-pressed={true}>SOUND ON</button><button ref={pause} type="button">PAUSE</button></div>
    <div ref={screenWell} className="sh-screen-well"><canvas ref={canvas} width={84} height={48} tabIndex={0} aria-label="SpaceHood. Space starts and fires once per press; arrows or WASD move; X uses specials; P pauses; M mutes. Touch controls below the screen." /></div>
    <TouchControls controls={controls} phase={stats?.phase} />
    </div>
    <p ref={status} className="sh-status" aria-live="polite">Press Space to start.</p>
    <p className="sh-readout">{stats ? `LEVEL ${stats.level}/${stats.levels} · ${stats.world} · AMMO ${stats.ammo} · ${stats.weapon.toUpperCase()} ${stats.specialAmmo} · LIVES ${stats.lives} · SCORE ${stats.score}${stats.bonusSeconds ? ` · GALLERY ${stats.bonusSeconds}s` : ""}` : "SPACE / ENTER TO START · ARROWS / WASD TO MOVE · SPACE TO FIRE · X FOR SPECIAL"}</p>
    {stats?.phase === "briefing" && <section className="sh-strategies" aria-label="Level strategy">
      <p>Clear: +10 rounds. Complete your objective: +20 more rounds and +100 points.</p>
      <div>{stats.strategies.map((strategy,i)=><button key={strategy.id} type="button" aria-pressed={i===stats.strategyIndex} onClick={()=>controls.current?.selectStrategy(i)}><strong>{strategy.name}</strong><span>{strategy.description}</span></button>)}</div>
      <button type="button" onClick={()=>{controls.current?.launchLevel();canvas.current?.focus();}}>LAUNCH LEVEL</button>
    </section>}
    {stats?.strategy && stats.phase !== "briefing" && <p className="sh-readout"><strong>OBJ {stats.strategy} {stats.objectiveTarget > 0 ? `${stats.objectiveProgress}/${stats.objectiveTarget}` : stats.objectiveStatus.toUpperCase()}</strong> · CLEAR +10 AMMO · OBJECTIVE +20 AMMO / +100 POINTS ON CLEAR{stats.objectiveTarget > 0 && stats.objectiveStatus === "failed" ? " · FAILED" : ""}</p>}
    {stats && stats.phase !== "briefing" && <p className="sh-readout">{stats.bonusSeconds ? "GALLERY" : "THIS LEVEL"}: SHOTS {stats.metrics.shotsHit}/{stats.metrics.shotsFired} · ACCURACY {stats.metrics.accuracy === null ? "—" : `${stats.metrics.accuracy}%`} · DEATHS {stats.metrics.deaths} · SPECIALS USED {stats.metrics.specials}</p>}
    <p className="sh-event" role="status" aria-live="polite">{stats?.event?.text || "\u00a0"}</p>
    {stats?.lastReward && <p className="sh-readout">{stats.lastReward.world} CLEAR: +{stats.lastReward.clearAmmo} AMMO · OBJECTIVE {stats.lastReward.objectiveMet ? "COMPLETE" : "MISSED"}: +{stats.lastReward.objectiveAmmo} AMMO / +{stats.lastReward.points} POINTS.</p>}
    <p className="sh-readout">FLY INTO ANIMATED PICKUPS · FRAME PICKUP ENTERS BONUS · GALLERY FRAMES TAKE ONE SHOT</p>
    {stats?.exportAvailable && <button type="button" onClick={()=>downloadRun()}>DOWNLOAD {stats.exportSource === "previous" ? "PREVIOUS" : "CURRENT"} RUN STATS</button>}
    {stats?.previousRunAvailable && stats.exportSource === "current" && <button type="button" onClick={()=>downloadRun(true)}>DOWNLOAD PREVIOUS RUN STATS</button>}
    {stats?.phase === "ended" && options.campaign === "classic" && <p className="sh-readout">Own a Hoodie to play all 11 levels with your archetype. Select THE HOOD above to connect your wallet.</p>}
  </>;
}

export default function SpaceHoodPage() {
  const { address, connect } = useWallet();
  const owner = address || "";
  const [mode, setMode] = useState<"classic" | "hood">("classic");
  const [walletList, setWalletList] = useState<WalletList | null>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [runKey, setRunKey] = useState("");
  const currentRunKey = `${mode}-${owner}`;
  const running = runKey === currentRunKey;
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const ids = walletList && walletList.owner === owner ? walletList.ids : [];
  const selectedId = ids.length ? ids[Math.min(index, ids.length - 1)] : "";
  const selected = loaded && loaded.owner === owner && loaded.id === selectedId ? loaded : null;
  const ready = !!(selected?.hoodie && selected.frames);

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    json<{ items?: { tokenId: string | number }[]; error?: string }>(`/api/hoodies?owner=${encodeURIComponent(owner)}`, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.error) throw new Error(data.error);
        const owned = [...new Set((data.items || []).map(item => String(item.tokenId)))].filter(id => /^\d+$/.test(id));
        setWalletList({ owner, ids: owned }); setIndex(0);
      })
      .catch(e => { if (!controller.signal.aborted) setWalletList({ owner, ids: [], error: e instanceof Error ? e.message : "Unable to load Hoodies." }); });
    return () => controller.abort();
  }, [owner, retry]);

  // Fetch one selected Hoodie, plus up to two neighbours for inhabited scenery.
  const neighbours = ids.filter(id => id !== selectedId).slice(0, 2).join(",");
  useEffect(() => {
    if (!owner || !selectedId || mode !== "hood") return;
    const controller = new AbortController();
    Promise.all([
      hoodie(selectedId, controller.signal),
      randomFrames(controller.signal),
      Promise.allSettled(neighbours.split(",").filter(Boolean).map(id => hoodie(id, controller.signal))),
    ]).then(([chosen, frames, others]) => {
      if (controller.signal.aborted) return;
      const residents = [chosen.sprite, ...others.flatMap(item => item.status === "fulfilled" ? [item.value.sprite] : [])];
      setLoaded({ owner, id: selectedId, hoodie: chosen, frames, residents });
    }).catch(e => { if (!controller.signal.aborted) setLoaded({ owner, id: selectedId, error: e instanceof Error ? e.message : "Unable to load game artwork." }); });
    return () => controller.abort();
  }, [owner, selectedId, neighbours, mode, retry]);

  const authorizeStart = useCallback(async () => {
    if (!owner || !selectedId) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await json<{ items?: { tokenId: string | number }[] }>(`/api/hoodies?owner=${encodeURIComponent(owner)}`, controller.signal);
      return !!result.items?.some(item => String(item.tokenId) === selectedId);
    } finally { clearTimeout(timeout); }
  }, [owner, selectedId]);
  const onRunState = useCallback((value: boolean) => { setRunKey(value ? currentRunKey : ""); }, [currentRunKey]);
  const onSelect = useCallback((delta: number) => {if(ids.length){setIndex(i=>(i+delta+ids.length)%ids.length);setError("");}}, [ids.length]);
  const options = useMemo<SpaceHoodOptions>(() => mode === "classic"
    ? { campaign: "classic", onRunState, onError: setError }
    : { campaign: "hood", hoodieId: selectedId, archetype: selected?.hoodie?.archetype, hoodie: selected?.hoodie?.sprite, residents: selected?.residents, frames: selected?.frames, authorizeStart, onSelect, onRunState, onError: setError },
    [mode, selectedId, selected, authorizeStart, onSelect, onRunState]);
  function selectMode(next: "classic" | "hood") { setMode(next); setRunKey(""); setError(""); setRevision(r => r + 1); }
  function navigate(delta: number) { setIndex(i => (i + delta + ids.length) % ids.length); setError(""); }
  async function connectWallet() { setError(""); try { await connect(); } catch (e) { setError(e instanceof Error ? e.message : "Wallet connection failed."); } }
  const loadError = mode === "hood" ? selected?.error || (walletList && walletList.owner === owner ? walletList.error : "") : "";

  return <><SiteHeader /><main className="spacehood-page"><section className="spacehood-game">
    <header><h1>SPACEHOOD</h1><span>{mode === "classic" ? "3 FREE LEVELS" : "11 LEVEL HOODIE CAMPAIGN"}</span></header>
    <nav className="sh-modes" aria-label="Campaign">
      <button type="button" aria-pressed={mode === "classic"} onClick={() => selectMode("classic")}>FREE PLAY</button>
      <button type="button" aria-pressed={mode === "hood"} onClick={() => selectMode("hood")}>THE HOOD</button>
      {mode === "hood" && !owner && <button type="button" onClick={() => void connectWallet()}>CONNECT WALLET</button>}
      {running && <button type="button" onClick={() => selectMode(mode)}>BACK TO SELECT</button>}
    </nav>
    {mode === "hood" && owner && ids.length > 0 && <div className="sh-selection">
      <button type="button" disabled={running || ids.length < 2} onClick={() => navigate(-1)} aria-label="Previous Hoodie">← PREV</button>
      <span>HOODIE #{selectedId}{selected?.hoodie ? ` / ${selected.hoodie.archetype}` : ""} · {Math.min(index + 1, ids.length)}/{ids.length}</span>
      <button type="button" disabled={running || ids.length < 2} onClick={() => navigate(1)} aria-label="Next Hoodie">NEXT →</button>
    </div>}
    {mode === "hood" && selected?.hoodie && <p style={{fontSize: 11, margin: "12px 0"}}>{ABILITIES[selected.hoodie.archetype]}</p>}
    {mode === "classic" || ready && owner ? <Game key={`${mode}-${owner}-${selectedId}-${revision}`} options={options} /> : <div className="sh-placeholder" role="status">
      {!owner ? "CONNECT YOUR WALLET TO SELECT A HOODIE" : loadError ? "UNABLE TO LOAD YOUR HOOD" : walletList?.owner !== owner ? "LOADING YOUR HOODIES…" : ids.length === 0 ? "NO HOODIES FOUND. FREE PLAY IS OPEN TO EVERYONE." : "LOADING HOODIE + SHIP…"}
    </div>}
    {(error || loadError) && <p className="sh-error" role="alert">{error || loadError} <button type="button" onClick={() => { setError(""); setRetry(v => v + 1); }}>RETRY</button></p>}
    <style>{`
      .spacehood-page{box-sizing:border-box;width:100%;min-height:70dvh;padding:32px 12px;background:#000;color:#ccff00;font-family:monospace}
      .spacehood-game{width:100%;max-width:704px;margin:0 auto}.spacehood-page header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.spacehood-page h1{margin:0;color:#ccff00;font:bold 20px monospace;letter-spacing:2px}.spacehood-page header span{font-size:10px;letter-spacing:1px}
      .spacehood-page button{border:1px solid #ccff00;padding:9px 12px;color:#ccff00;background:#000;font:11px monospace;cursor:pointer}.spacehood-page button[aria-pressed=true]{background:#ccff00;color:#000}.spacehood-page button:disabled{opacity:.4;cursor:default}.spacehood-page button:focus-visible{outline:2px solid #ccff00;outline-offset:3px}
      .sh-event{min-height:18px;font-size:12px;font-weight:bold}.sh-strategies{font-size:12px;border-top:1px solid #ccff00;padding-top:8px;margin-top:12px}.sh-strategies>div{display:flex;gap:10px;margin-bottom:12px}.sh-strategies>div button{flex:1;text-align:left}.sh-strategies span{display:block;margin-top:8px;line-height:1.5}.sh-readout{font-size:11px;line-height:1.6;margin-top:18px}.sh-modes{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}.sh-selection{display:flex;align-items:center;justify-content:space-between;font-size:11px;gap:12px;margin-bottom:12px}.sh-game-controls{display:flex;justify-content:flex-end;gap:8px;margin:12px 0 20px}
      .spacehood-page canvas{display:block;width:252px;height:144px;max-width:none;flex-shrink:0;image-rendering:pixelated;outline:none}.sh-placeholder{width:100%;aspect-ratio:84/48;display:grid;place-items:center;text-align:center;border:1px solid #ccff00;font-size:12px}.sh-error{font-size:12px;line-height:1.7;margin-top:20px}.sh-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
      .sh-console{border:1px solid #ccff00;border-radius:14px 14px 26px 26px;padding:14px;background:#080b02;box-shadow:0 5px 0 #354200;box-sizing:border-box}
      .sh-console .sh-game-controls{margin:0 0 12px;gap:6px}.sh-console .sh-game-controls button{min-height:40px}
      .sh-screen-well{width:100%;display:flex;justify-content:center;align-items:center;background:#000;padding:8px 0;border-top:1px solid #354200;border-bottom:1px solid #354200}
      .sh-touch-controls{display:none;align-items:center;justify-content:space-between;gap:8px;padding:18px 0 2px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
      .sh-stick-area{text-align:center}.sh-stick{width:112px;height:112px;border:1px solid #647b00;border-radius:50%;position:relative;display:grid;place-items:center;touch-action:none;background:#000}
      .sh-stick-cross{position:absolute;width:74px;height:1px;background:#354200}.sh-stick-cross:after{content:'';display:block;width:1px;height:74px;background:#354200;position:absolute;left:36px;top:-36px}
      .sh-stick-knob{width:44px;height:44px;border:2px solid #ccff00;border-radius:50%;background:#263000;pointer-events:none;will-change:transform}
      .sh-control-label{display:block;font-size:9px;letter-spacing:2px;margin-top:8px}.sh-console-mark{text-align:center;font-size:9px;line-height:1.8;color:#819f00;letter-spacing:1px}
      .sh-action-area{display:flex;flex-direction:column;align-items:center;gap:12px}.spacehood-page .sh-fire{width:78px;height:78px;border-radius:50%;background:#ccff00;color:#000;font-weight:bold;font-size:13px;touch-action:none;box-shadow:0 4px 0 #647b00;padding:0}
      .spacehood-page .sh-special{min-width:78px;min-height:44px;border-radius:8px;font-size:10px;touch-action:none}.sh-fire:active,.sh-special:active{transform:translateY(2px)}
      @media (pointer:coarse),(any-pointer:coarse),(max-width:760px){.sh-touch-controls{display:flex}}
      @media(max-width:480px){.spacehood-page{padding:18px 12px}.spacehood-page header{gap:12px}.spacehood-page header span{text-align:right;font-size:9px}.sh-selection{gap:6px;flex-wrap:wrap}.sh-console{padding:10px}.sh-console .sh-game-controls{justify-content:space-between}.sh-console .sh-game-controls button{flex:1;padding:8px 5px}.sh-strategies>div{gap:6px}.sh-readout{overflow-wrap:anywhere}}
    `}</style>
  </section></main><SiteFooter /></>;
}
