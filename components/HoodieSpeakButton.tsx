"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type HoodieSpeakButtonProps = {
  text: string;
  archetype?: string | null;
  mouth?: string | null;
  className?: string;
};

type VoiceProfile = {
  pitch: number;
  rate: number;
};

const BASE_VOICES: Record<string, VoiceProfile> = {
  builder: {
    pitch: 0.95,
    rate: 1.03,
  },

  collector: {
    pitch: 0.88,
    rate: 0.90,
  },

  hodler: {
    pitch: 0.70,
    rate: 0.78,
  },

  flipper: {
    pitch: 1.08,
    rate: 1.14,
  },

  hoodie: {
    pitch: 0.92,
    rate: 0.95,
  },
};

const MOUTH_VOICE_MODIFIERS: Record<
  string,
  {
    pitch?: number;
    rate?: number;
  }
> = {
  // Deep / Beard
  "full-beard": { pitch: -0.12, rate: -0.06 },
  beard: { pitch: -0.10, rate: -0.05 },
  "short-beard": { pitch: -0.08, rate: -0.04 },
  "circle-beard": { pitch: -0.07, rate: -0.03 },
  "extended-goatee": { pitch: -0.06, rate: -0.02 },
  "checked-beard": { pitch: -0.06, rate: -0.02 },
  jaw: { pitch: -0.08, rate: -0.04 },
  horseshoe: { pitch: -0.05 },

  // Happy
  smile: { pitch: 0.09, rate: 0.03 },
  "jocker-smile": { pitch: 0.10, rate: 0.05 },
  "satisfied-look": { pitch: 0.04, rate: -0.02 },
  "big-lips": { pitch: 0.05 },

  // Fast
  "open-mouth": { pitch: 0.05, rate: 0.08 },
  "say-gm": { pitch: 0.06, rate: 0.10 },
  "pixel-spitter": { pitch: 0.04, rate: 0.12 },
  "snake-tongue": { pitch: 0.08, rate: 0.08 },
  "tongue-out": { pitch: 0.08, rate: 0.06 },
  "hungry-mouth": { pitch: 0.02, rate: 0.07 },
  "ape-mouth": { pitch: -0.03, rate: 0.07 },

  // Teeth
  "3-teeth": { pitch: 0.03, rate: 0.03 },
  choppers: { pitch: -0.02, rate: 0.04 },
  "one-teeth-out": { pitch: 0.02, rate: 0.02 },
  "broken-teeth": { pitch: -0.03, rate: -0.01 },
  "teeth-grinding": { pitch: -0.08, rate: -0.05 },
  "dracula-teeth": { pitch: -0.10, rate: -0.03 },
  grill: { pitch: -0.04, rate: 0.03 },
  "cutting-teeth": { pitch: -0.04, rate: 0.04 },
  "skull-teeth": { pitch: -0.14, rate: -0.05 },

  // Slow
  hmmm: { pitch: -0.04, rate: -0.10 },
  eeehhh: { pitch: -0.02, rate: -0.08 },
  "a-simple-mouth": { rate: -0.02 },
  "one-pixel": { pitch: -0.02, rate: -0.03 },
  wale: { pitch: -0.08, rate: -0.06 },

  // Special
  robot: { pitch: -0.03, rate: 0.02 },
  smoking: { pitch: -0.12, rate: -0.08 },
  scarface: { pitch: -0.10, rate: -0.04 },
  "sugar-water": { pitch: 0.08, rate: 0.05 },
};

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getVoiceProfile(
  archetype?: string | null,
  mouth?: string | null,
): VoiceProfile {
  const base =
    BASE_VOICES[normalize(archetype)] ??
    BASE_VOICES.hoodie;

  const modifier =
    MOUTH_VOICE_MODIFIERS[normalize(mouth)] ?? {};

  return {
    pitch: clamp(base.pitch + (modifier.pitch ?? 0), 0.55, 1.35),
    rate: clamp(base.rate + (modifier.rate ?? 0), 0.65, 1.30),
  };
}

function chooseVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find(
      (voice) =>
        voice.lang.startsWith("en") &&
        voice.localService,
    ) ||
    voices.find((voice) => voice.lang.startsWith("en")) ||
    voices[0]
  );
}

export default function HoodieSpeakButton({
  text,
  archetype,
  mouth,
  className = "",
}: HoodieSpeakButtonProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const profile = useMemo(
    () => getVoiceProfile(archetype, mouth),
    [archetype, mouth],
  );

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const load = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    load();

    window.speechSynthesis.addEventListener(
      "voiceschanged",
      load,
    );

    return () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        load,
      );

      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(() => {
    if (!text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      text.replace(/^[“"]|[”"]$/g, ""),
    );

    utterance.lang = "en-US";
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;

    const voice = chooseVoice(voices);

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [profile, text, voices]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return (
    <button
      type="button"
      onClick={speaking ? stop : speak}
      className={`border border-black px-4 py-3 text-[9px] uppercase tracking-[0.15em] hover:bg-black hover:text-[#ccff00] transition-colors ${className}`}
    >
      {speaking ? "■ Stop Voice" : "▶ Speak"}
    </button>
  );
}