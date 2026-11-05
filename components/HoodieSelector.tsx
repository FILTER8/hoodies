"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

type HoodieOption = { tokenId: string | number; name?: string; image?: string };

type Props = {
  hoodies: HoodieOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  imageForId: (id: string) => string;
  loading?: boolean;
  disabled?: boolean;
  selectedActive?: boolean;
};
export default function HoodieSelector({ hoodies, selectedId, onSelect, imageForId, loading = false, disabled = false, selectedActive = false }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const chosen = hoodies.findIndex((h) => String(h.tokenId) === selectedId);
  const go = useCallback((direction: -1 | 1) => {
    if (!hoodies.length || disabled) return;
    const index = chosen < 0 ? 0 : (chosen + direction + hoodies.length) % hoodies.length;
    onSelect(String(hoodies[index].tokenId));
  }, [hoodies, disabled, chosen, onSelect]);

  useEffect(() => {
    const element = track.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (element && track.current) {
      const container = track.current;
      const left = element.offsetLeft - container.offsetLeft - (container.clientWidth - element.clientWidth) / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [selectedId]);

  return (
    <section aria-label="Choose your Hoodie" className="border border-[#ccff00] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em]">SELECT YOUR HOODIE</p>
          <p className="mt-1 text-xs">{loading ? "LOADING HOODIES…" : hoodies.length ? `${hoodies.length} OWNED · #${selectedId || "—"} SELECTED` : "NO HOODIES FOUND"}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous Hoodie" disabled={!hoodies.length || disabled} onClick={() => go(-1)} className="flex h-10 w-10 items-center justify-center border border-[#ccff00] text-xl disabled:cursor-not-allowed">←</button>
          <button type="button" aria-label="Next Hoodie" disabled={!hoodies.length || disabled} onClick={() => go(1)} className="flex h-10 w-10 items-center justify-center border border-[#ccff00] text-xl disabled:cursor-not-allowed">→</button>
        </div>
      </div>
      <div ref={track} role="group" aria-label="Owned Hoodies, swipe to browse" className="flex w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2 touch-pan-x" style={{ scrollbarWidth: "thin", scrollbarColor: "#ccff00 #000000" }}>
        {hoodies.map((hoodie) => {
          const id = String(hoodie.tokenId);
          const picked = id === selectedId;
          return (
            <button key={id} type="button" disabled={disabled} aria-pressed={picked} onClick={() => onSelect(id)} className={`shrink-0 snap-center border p-1.5 text-center ${picked ? "border-[#ccff00] bg-[#ccff00] text-black" : "border-[#ccff00] bg-black text-[#ccff00]"}`}>
              <Image
                // Use the canonical on-chain SVG endpoint, not an optional owner-API image field.
                src={imageForId(id)}
                alt={`Hoodie #${id}`}
                width={76}
                height={76}
                unoptimized
                className="h-[68px] w-[68px] object-contain [image-rendering:pixelated] sm:h-[76px] sm:w-[76px]"
              />
              <span className="mt-1 block text-[10px]">#{id}</span>
              {picked && selectedActive && <span className="mt-1 block bg-black px-1 py-0.5 text-[8px] font-bold text-[#ccff00]">● ACTIVE</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
