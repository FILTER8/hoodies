declare module "gifenc" {
  export type GIFPalette = number[][];

  export type GIFFrameOptions = {
    palette?: GIFPalette;
    delay?: number;
    repeat?: number;
    dispose?: number;
    transparent?: boolean;
  };

  export type GIFEncoderInstance = {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GIFFrameOptions,
    ): void;

    finish(): void;

    bytes(): Uint8Array;

    bytesView(): Uint8Array;

    stream(): unknown;

    reset(): void;
  };

  export interface GIFEncoderFactory {
    (): GIFEncoderInstance;
    new (): GIFEncoderInstance;
  }

  export const GIFEncoder: GIFEncoderFactory;

  export function quantize(
    pixels: Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: "rgb444" | "rgb565" | "rgba4444";
      oneBitAlpha?: number | boolean;
      clearAlpha?: boolean;
      clearAlphaColor?: number;
    },
  ): GIFPalette;

  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: GIFPalette,
    format?: "rgb444" | "rgb565" | "rgba4444",
  ): Uint8Array;
}