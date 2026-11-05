"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "./WalletProvider";

type OwnershipCheck = {
  address: string;
  tokenId: number;
  owned: boolean;
};

export default function HoodieHomepageEditLink({ id }: { id: number }) {
  const { address } = useWallet();
  const [check, setCheck] = useState<OwnershipCheck | null>(null);

  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();
    const requestedAddress = address;
    const requestedId = id;

    fetch(`/api/hoodies?owner=${encodeURIComponent(requestedAddress)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{
          items?: Array<{ tokenId: number | string }>;
        }>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const owned = Boolean(
          data?.items?.some((item) => Number(item.tokenId) === requestedId),
        );
        setCheck({ address: requestedAddress, tokenId: requestedId, owned });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCheck({ address: requestedAddress, tokenId: requestedId, owned: false });
        }
      });

    return () => controller.abort();
  }, [address, id]);

  // A result for a previous wallet or Hoodie is never trusted for this render.
  if (!address || check?.address !== address || check.tokenId !== id || !check.owned) {
    return null;
  }

  return (
    <Link
      href={`/hoodos/homepage?hoodie=${id}`}
      className="border border-[#ccff00] px-3 py-2 hover:bg-[#ccff00] hover:text-black"
    >
      Edit homepage ↗
    </Link>
  );
}
