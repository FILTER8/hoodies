"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../lib/hoodieHomepage";

type MidiNote = { start: number; end: number; pitch: number; velocity: number };
type Song = { notes: MidiNote[]; duration: number };

// Small, dependency-free Standard MIDI File parser. Supports SMF 0/1, running status,
// note on/off and tempo changes. Audio is synthesized locally with Web Audio.
function readSong(buffer: ArrayBuffer): Song {
  if (buffer.byteLength > 512 * 1024) throw Error("MIDI file is too large (512 KB max).");
  const data = new DataView(buffer);
  let pos = 0;
  const need = (n: number) => { if (pos + n > data.byteLength) throw Error("Invalid or truncated MIDI file."); };
  const byte = () => { need(1); return data.getUint8(pos++); };
  const word = () => { need(2); const v = data.getUint16(pos); pos += 2; return v; };
  const dword = () => { need(4); const v = data.getUint32(pos); pos += 4; return v; };
  const tag = () => String.fromCharCode(byte(), byte(), byte(), byte());
  const vlq = (end: number) => { let n = 0; for (let i = 0; i < 4; i++) { if (pos >= end) throw Error("Invalid MIDI variable-length value."); const v = byte(); n = (n << 7) | (v & 127); if (!(v & 128)) return n; } throw Error("Invalid MIDI timing value."); };
  if (tag() !== "MThd") throw Error("Not a Standard MIDI file.");
  const header = dword();
  if (header < 6 || header > 128) throw Error("Invalid MIDI header.");
  const format = word(); const tracks = word(); const division = word();
  pos = 8 + header;
  if (format > 1 || !tracks || tracks > 64 || !division || (division & 0x8000)) throw Error("Unsupported MIDI format or timing.");
  type Event = { tick: number; kind: "on" | "off" | "tempo"; channel?: number; pitch?: number; velocity?: number; tempo?: number; order: number };
  const events: Event[] = [];
  let order = 0;
  for (let t = 0; t < tracks; t++) {
    if (tag() !== "MTrk") throw Error("Invalid MIDI track.");
    const length = dword(); const end = pos + length;
    if (end > data.byteLength) throw Error("Truncated MIDI track.");
    let tick = 0; let running = 0;
    while (pos < end) {
      tick += vlq(end);
      if (pos >= end) break;
      let status = data.getUint8(pos);
      if (status & 128) { pos++; if (status < 0xf0) running = status; }
      else if (!running) throw Error("Invalid MIDI running status.");
      else status = running;
      if (status === 0xff) {
        const meta = byte(); const count = vlq(end); need(count);
        if (pos + count > end) throw Error("Invalid MIDI meta event.");
        if (meta === 0x51 && count === 3) {
          const tempo = (data.getUint8(pos) << 16) | (data.getUint8(pos + 1) << 8) | data.getUint8(pos + 2);
          if (tempo > 0) events.push({ tick, kind: "tempo", tempo, order: order++ });
        }
        pos += count;
      } else if (status === 0xf0 || status === 0xf7) {
        const count = vlq(end); if (pos + count > end) throw Error("Invalid SysEx event."); pos += count; running = 0;
      } else if (status >= 0xf0) {
        // MIDI system common events (rare in files).
        const count = status === 0xf1 || status === 0xf3 ? 1 : status === 0xf2 ? 2 : 0;
        if (pos + count > end) throw Error("Invalid MIDI system event."); pos += count; running = 0;
      } else {
        const op = status & 0xf0; const channel = status & 15;
        const a = byte(); const b = op === 0xc0 || op === 0xd0 ? 0 : byte();
        if (channel !== 9 && (op === 0x80 || op === 0x90)) {
          events.push({ tick, kind: op === 0x90 && b ? "on" : "off", pitch: a, velocity: b, channel, order: order++ });
          if (events.length > 60000) throw Error("MIDI has too many note events.");
        }
      }
    }
    pos = end;
  }
  // Tempo changes are applied globally across all tracks.
  events.sort((a, b) => a.tick - b.tick || (a.kind === "tempo" ? -1 : b.kind === "tempo" ? 1 : 0) || a.order - b.order);
  let lastTick = 0; let seconds = 0; let microsPerBeat = 500000;
  const active = new Map<string, Array<{ start: number; velocity: number }>>();
  const notes: MidiNote[] = [];
  for (const event of events) {
    seconds += (event.tick - lastTick) * microsPerBeat / division / 1e6;
    lastTick = event.tick;
    if (event.kind === "tempo") { microsPerBeat = event.tempo!; continue; }
    const key = `${event.channel}:${event.pitch}`;
    if (event.kind === "on") {
      const stack = active.get(key) || []; stack.push({ start: seconds, velocity: event.velocity! }); active.set(key, stack);
    } else {
      const stack = active.get(key);
      const start = stack?.shift();
      if (start) notes.push({ start: start.start, end: Math.max(start.start + 0.05, seconds), pitch: event.pitch!, velocity: start.velocity });
    }
  }
  if (!notes.length) throw Error("This MIDI file contains no supported melodic notes.");
  const duration = Math.max(...notes.map(n => n.end));
  if (duration > 900 || notes.length > 12000) throw Error("MIDI is too long for this lightweight player.");
  notes.sort((a, b) => a.start - b.start);
  return { notes, duration };
}

function formatTime(time: number): string { const s = Math.max(0, Math.floor(time)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export default function HoodpageMidiPlayer({ file, title, loop = false, compact = false }: { file: string; title: string; loop?: boolean; compact?: boolean }) {
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voices = useRef(new Set<OscillatorNode>());
  const startTime = useRef(0);
  const offset = useRef(0);
  const cursor = useRef(0);
  const playbackId = useRef(0);
  const playingRef = useRef(false);
  const songRef = useRef<Song | null>(null);
  const playerId = useRef(Math.random().toString(36).slice(2));
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const url = mediaUrl("midi", file);

  function halt(reset = false) {
    playbackId.current += 1;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    voices.current.forEach(v => { try { v.stop(); } catch { /* already ended */ } });
    voices.current.clear();
    playingRef.current = false; setPlaying(false);
    if (reset) { offset.current = 0; setPosition(0); }
    else if (ctx.current) { offset.current = Math.min(songRef.current?.duration || 0, ctx.current.currentTime - startTime.current); setPosition(offset.current); }
  }

  useEffect(() => {
    const activeVoices = voices.current;
    return () => {
      playbackId.current += 1;
      if (timer.current) clearInterval(timer.current);
      activeVoices.forEach(v => { try { v.stop(); } catch {} });
      activeVoices.clear();
      void ctx.current?.close();
      ctx.current = null;
    };
  }, []);
  useEffect(() => {
    const stopOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== playerId.current && playingRef.current) halt(true);
    };
    window.addEventListener("hoodpage-midi-start", stopOther);
    return () => window.removeEventListener("hoodpage-midi-start", stopOther);
  }, []);
  // A new selected track stops the previous one. Loading is lazy until Play.
  useEffect(() => {
    playbackId.current += 1;
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    voices.current.forEach(v => { try { v.stop(); } catch {} }); voices.current.clear();
    playingRef.current = false;
    songRef.current = null; offset.current = 0;
    // Defer component state reset until the next interaction; changing the module
    // key in its parent also remounts this player.
  }, [file]);

  async function begin() {
    if (!url || busy) return;
    if (playingRef.current) { halt(); return; }
    setBusy(true); setError("");
    const id = ++playbackId.current;
    try {
      const audio = ctx.current || new AudioContext();
      ctx.current = audio;
      await audio.resume(); // called in response to the visitor pressing Play
      let current = songRef.current;
      if (!current) {
        const response = await fetch(url);
        if (!response.ok) throw Error(`Could not load MIDI (${response.status}).`);
        current = readSong(await response.arrayBuffer());
        if (id !== playbackId.current) return;
        songRef.current = current; setSong(current);
      }
      if (offset.current >= current.duration) offset.current = 0;
      cursor.current = current.notes.findIndex(note => note.start >= offset.current);
      if (cursor.current < 0) cursor.current = current.notes.length;
      startTime.current = audio.currentTime - offset.current;
      window.dispatchEvent(new CustomEvent("hoodpage-midi-start", { detail: playerId.current }));
      playingRef.current = true; setPlaying(true);
      function schedule() {
        if (!playingRef.current || id !== playbackId.current || !current) return;
        const now = audio.currentTime - startTime.current;
        setPosition(Math.min(current.duration, now));
        while (cursor.current < current.notes.length && current.notes[cursor.current].start < now + 0.27) {
          const note = current.notes[cursor.current++];
          const beginAt = Math.max(audio.currentTime + 0.005, startTime.current + note.start);
          const endAt = Math.max(beginAt + 0.025, startTime.current + note.end);
          const osc = audio.createOscillator(); const gain = audio.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(440 * Math.pow(2, (note.pitch - 69) / 12), beginAt);
          const volume = Math.min(0.075, 0.042 * (note.velocity / 127));
          gain.gain.setValueAtTime(0.0001, beginAt);
          gain.gain.linearRampToValueAtTime(volume, beginAt + 0.012);
          gain.gain.setTargetAtTime(0.0001, Math.max(beginAt + 0.018, endAt - 0.05), 0.03);
          osc.connect(gain).connect(audio.destination);
          osc.start(beginAt); osc.stop(endAt + 0.12);
          voices.current.add(osc);
          osc.onended = () => { voices.current.delete(osc); osc.disconnect(); gain.disconnect(); };
        }
        if (now >= current.duration + 0.15) {
          halt(true);
          if (loopRef.current) void begin();
        }
      }
      schedule();
      timer.current = setInterval(schedule, 100);
    } catch (e) { if (id === playbackId.current) { halt(true); setError(e instanceof Error ? e.message : "MIDI playback failed."); } }
    finally { setBusy(false); }
  }

  if (compact) return <div className="flex shrink-0 items-center gap-2">
    <button type="button" onClick={() => void begin()} disabled={!url || busy} className="min-h-9 border border-current px-3 text-[10px] uppercase disabled:opacity-50" aria-label={`${playing ? "Pause" : "Preview"} ${title}`}>{busy ? "..." : playing ? "Ⅱ PAUSE" : "▶ PLAY"}</button>
    {playing && <span className="text-[9px] tabular-nums">{formatTime(position)}</span>}
    {error && <span className="max-w-44 text-[10px]" title={error}>Playback error</span>}
  </div>;

  return <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-2 text-center">
    <div className="text-[10px] uppercase tracking-wider">♫ {title || "HOMEPAGE MUSIC"}</div>
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button type="button" onClick={() => void begin()} disabled={!url || busy} className="min-h-10 border border-current px-4 py-2 text-xs uppercase disabled:opacity-50" aria-label={playing ? "Pause MIDI" : "Play MIDI"}>{busy ? "LOADING..." : playing ? "Ⅱ PAUSE" : "▶ PLAY"}</button>
      <span className="text-[10px] tabular-nums">{formatTime(position)} / {formatTime(song?.duration || 0)}</span>
      {position > 0 && <button type="button" onClick={() => halt(true)} className="min-h-10 border border-current px-3 py-2 text-[10px]" aria-label="Stop MIDI">■</button>}
    </div>
    {error && <p role="alert" className="text-[10px]">{error}</p>}
  </div>;
}
