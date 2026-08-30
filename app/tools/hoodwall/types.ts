export const HOODWALL_CHANNEL = "onchainhoodies-hoodwall-v1";

// Projector safe-area inset. Normalized drawing coordinates 0..1 map inside this.
export const CALIBRATION_MARGIN = 0.04;

export type HoodWallMessage =
  | { type: "PING" }
  | { type: "PROJECTOR_READY"; width: number; height: number }
  | { type: "PROJECTOR_STATUS"; width: number; height: number; fullscreen: boolean }
  | { type: "PROJECTOR_CLOSING" }
  | { type: "POINT"; x: number; y: number }
  | { type: "POINT_END" }
  | { type: "DRIP"; x: number; y: number; length: number }
  | { type: "PIXEL_SIZE"; value: number }
  | { type: "CLEAR" }
  | {
      type: "CLEAR_FIELD";
      x: number;
      y: number;
      width: number;
      height: number;
      visible: boolean;
      progress: number;
    }
  | { type: "CALIBRATION_SHOW" }
  | { type: "CALIBRATION_HIDE" };
