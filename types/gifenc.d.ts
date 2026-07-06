declare module "gifenc" {
  export class GIFEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
      }
    ): void;

    finish(): void;

    bytes(): Uint8Array;
  }

  export function quantize(
    pixels: Uint8ClampedArray,
    maxColors: number
  ): number[][];

  export function applyPalette(
    pixels: Uint8ClampedArray,
    palette: number[][]
  ): Uint8Array;
}