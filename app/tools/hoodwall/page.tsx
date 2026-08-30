"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import {
  CALIBRATION_MARGIN,
  HOODWALL_CHANNEL,
  HoodWallMessage,
} from "./types";

const GREEN = "#ccff00";

const DETECTION_WIDTH = 320;

/*
 * Short camera dropouts are normal with a real laser/projector.
 * Keep the active stroke alive briefly so the visible line does not break.
 */
const LASER_LOST_GRACE_MS = 220;

/*
 * If the laser is absent for longer than this and then returns,
 * always start a NEW stroke. This prevents OFF -> ON jumps.
 * Tiny camera misses shorter than this can still be bridged.
 */
const RECONNECT_CUT_MS = 90;

/*
 * Even during the grace window, never bridge a large physical jump.
 * This prevents laser OFF -> laser ON somewhere else from drawing a diagonal.
 */
const MAX_BRIDGE_DISTANCE_NORMALIZED = 0.035;

const MAX_JUMP_NORMALIZED = 0.08;
const JUMP_RESET_MS = 190;

const SMOOTHING_BUFFER_SIZE = 4;

const MIN_PIXEL_SIZE = 4;
const MAX_PIXEL_SIZE = 40;
const DEFAULT_PIXEL_SIZE = 14;

const PIXEL_PRESETS = [
  4,
  6,
  8,
  10,
  12,
  14,
  16,
  20,
  24,
  28,
  32,
  36,
  40,
];

/*
 * WET INK
 *
 * These are the values to tune later
 * once the real projector + laser are running.
 */
const MAX_WET_SPEED = 2.0;
const DRIP_RATE = 0.07;

const MIN_MOVEMENT_FOR_SPEED = 0.0015;

const DRIP_START_WETNESS = 0.02;

const WETNESS_DECAY = 0.0005;

/*
 * Trigger/amount stays aggressive, while visible drip length grows
 * much faster after a drip begins.
 */
const DRIP_LENGTH_MULTIPLIER = 4.5;
const DRIP_LENGTH_EXPONENT = 1.12;
const MAX_DRIP_LENGTH_PX = 900;

/*
 * IMPORTANT:
 *
 * Drips are ALWAYS exactly 2 projector pixels wide.
 *
 * Brush/grid size has ZERO effect on this.
 */
/*
 * A drip is always TWO HoodWall drip pixels wide.
 * Each drip pixel is fixed at 4 projector pixels, independent from brush size.
 * Result: 8 projector pixels wide on every brush setting.
 */
const DRIP_PIXEL_SIZE_PX = 4;
const DRIP_WIDTH_PIXELS = 2;
const DRIP_WIDTH_PX = DRIP_PIXEL_SIZE_PX * DRIP_WIDTH_PIXELS;

/*
 * How far the laser can travel before
 * the current drip becomes a new drip.
 */
const DRIP_ANCHOR_RESET_DISTANCE = 0.03;

const CLEAR_HOLD_MS = 650;

type Point = {
  x: number;
  y: number;
};

type Candidate = {
  x: number;
  y: number;
  brightness: number;
};

type GridCell = {
  x: number;
  y: number;
};

type ProjectorSize = {
  width: number;
  height: number;
};

type CalibrationPoints = {
  TL: Point;
  TR: Point;
  BR: Point;
  BL: Point;
};

type CalibrationCorner =
  keyof CalibrationPoints;

type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type PaintPixel = {
  x: number;
  y: number;
  width: number;
  height: number;
  projectorWidth: number;
  projectorHeight: number;
};

type ClearField = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CALIBRATION_ORDER: CalibrationCorner[] = [
  "TL",
  "TR",
  "BR",
  "BL",
];

const DEFAULT_CLEAR_FIELD: ClearField = {
  x: 0.82,
  y: 0.84,
  width: 0.12,
  height: 0.08,
};

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function distance(
  a: Point,
  b: Point
) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  return Math.sqrt(
    dx * dx + dy * dy
  );
}

function sendMessage(
  channel: BroadcastChannel | null,
  message: HoodWallMessage
) {
  channel?.postMessage(message);
}

function solveLinearSystem(
  matrix: number[][],
  values: number[]
): number[] | null {
  const size = values.length;

  const augmented =
    matrix.map(
      (row, index) => [
        ...row,
        values[index],
      ]
    );

  for (
    let column = 0;
    column < size;
    column += 1
  ) {
    let pivotRow = column;

    for (
      let row = column + 1;
      row < size;
      row += 1
    ) {
      if (
        Math.abs(
          augmented[row][column]
        ) >
        Math.abs(
          augmented[pivotRow][column]
        )
      ) {
        pivotRow = row;
      }
    }

    if (
      Math.abs(
        augmented[pivotRow][column]
      ) < 1e-10
    ) {
      return null;
    }

    if (
      pivotRow !== column
    ) {
      const temp =
        augmented[column];

      augmented[column] =
        augmented[pivotRow];

      augmented[pivotRow] =
        temp;
    }

    const pivot =
      augmented[column][column];

    for (
      let col = column;
      col <= size;
      col += 1
    ) {
      augmented[column][col] /=
        pivot;
    }

    for (
      let row = 0;
      row < size;
      row += 1
    ) {
      if (
        row === column
      ) {
        continue;
      }

      const factor =
        augmented[row][column];

      for (
        let col = column;
        col <= size;
        col += 1
      ) {
        augmented[row][col] -=
          factor *
          augmented[column][col];
      }
    }
  }

  return augmented.map(
    (row) => row[size]
  );
}

function calculateHomography(
  source: CalibrationPoints
): Homography | null {
  const destination: CalibrationPoints = {
    TL: { x: 0, y: 0 },
    TR: { x: 1, y: 0 },
    BR: { x: 1, y: 1 },
    BL: { x: 0, y: 1 },
  };

  const rows: number[][] = [];
  const values: number[] = [];

  for (
    const corner of
    CALIBRATION_ORDER
  ) {
    const src =
      source[corner];

    const dst =
      destination[corner];

    const x = src.x;
    const y = src.y;

    const u = dst.x;
    const v = dst.y;

    rows.push([
      x,
      y,
      1,
      0,
      0,
      0,
      -u * x,
      -u * y,
    ]);

    values.push(u);

    rows.push([
      0,
      0,
      0,
      x,
      y,
      1,
      -v * x,
      -v * y,
    ]);

    values.push(v);
  }

  const solution =
    solveLinearSystem(
      rows,
      values
    );

  if (
    !solution ||
    solution.length !== 8
  ) {
    return null;
  }

  return solution as Homography;
}

function transformPoint(
  point: Point,
  homography: Homography
): Point | null {
  const [
    h11,
    h12,
    h13,
    h21,
    h22,
    h23,
    h31,
    h32,
  ] = homography;

  const denominator =
    h31 * point.x +
    h32 * point.y +
    1;

  if (
    Math.abs(denominator) <
    1e-10
  ) {
    return null;
  }

  return {
    x:
      (
        h11 * point.x +
        h12 * point.y +
        h13
      ) /
      denominator,

    y:
      (
        h21 * point.x +
        h22 * point.y +
        h23
      ) /
      denominator,
  };
}

function invertHomography(
  h: Homography
): Homography | null {
  const [
    a,
    b,
    c,
    d,
    e,
    f,
    g,
    h2,
  ] = h;

  const c00 =
    e - f * h2;

  const c01 =
    -(d - f * g);

  const c02 =
    d * h2 - e * g;

  const c10 =
    -(b - c * h2);

  const c11 =
    a - c * g;

  const c12 =
    -(a * h2 - b * g);

  const c20 =
    b * f - c * e;

  const c21 =
    -(a * f - c * d);

  const c22 =
    a * e - b * d;

  const determinant =
    a * c00 +
    b * c01 +
    c * c02;

  if (
    Math.abs(determinant) <
    1e-10
  ) {
    return null;
  }

  const inverseDet =
    1 / determinant;

  const i00 =
    c00 * inverseDet;

  const i01 =
    c10 * inverseDet;

  const i02 =
    c20 * inverseDet;

  const i10 =
    c01 * inverseDet;

  const i11 =
    c11 * inverseDet;

  const i12 =
    c21 * inverseDet;

  const i20 =
    c02 * inverseDet;

  const i21 =
    c12 * inverseDet;

  const i22 =
    c22 * inverseDet;

  if (
    Math.abs(i22) <
    1e-10
  ) {
    return null;
  }

  return [
    i00 / i22,
    i01 / i22,
    i02 / i22,

    i10 / i22,
    i11 / i22,
    i12 / i22,

    i20 / i22,
    i21 / i22,
  ];
}

function findBrightestPoint(
  imageData: ImageData,
  threshold: number
): Candidate | null {
  const {
    data,
    width,
    height,
  } = imageData;

  let bestScore = -1;
  let bestX = -1;
  let bestY = -1;
  let bestBrightness = 0;

  const step = 2;

  for (
    let y = 0;
    y < height;
    y += step
  ) {
    for (
      let x = 0;
      x < width;
      x += step
    ) {
      const index =
        (y * width + x) * 4;

      const red =
        data[index];

      const green =
        data[index + 1];

      const blue =
        data[index + 2];

      /**
       * How much stronger red is
       * than the other channels.
       */
      const redDominance =
        red -
        Math.max(
          green,
          blue
        );

      /**
       * Must be bright enough.
       */
      if (
        red < threshold
      ) {
        continue;
      }

      /**
       * Must actually look red,
       * not white / yellow / projector light.
       */
      if (
        redDominance < 55
      ) {
        continue;
      }

      /**
       * Score strongly favors
       * saturated red pixels.
       */
      const score =
        red +
        redDominance * 2;

      if (
        score >
        bestScore
      ) {
        bestScore =
          score;

        bestX = x;
        bestY = y;

        bestBrightness =
          red;
      }
    }
  }

  if (
    bestX < 0 ||
    bestY < 0
  ) {
    return null;
  }

  /**
   * Refine around the candidate.
   */
  const radius = 6;

  let weightedX = 0;
  let weightedY = 0;
  let weightTotal = 0;

  for (
    let y = Math.max(
      0,
      bestY - radius
    );
    y <=
    Math.min(
      height - 1,
      bestY + radius
    );
    y += 1
  ) {
    for (
      let x = Math.max(
        0,
        bestX - radius
      );
      x <=
      Math.min(
        width - 1,
        bestX + radius
      );
      x += 1
    ) {
      const index =
        (y * width + x) * 4;

      const red =
        data[index];

      const green =
        data[index + 1];

      const blue =
        data[index + 2];

      const redDominance =
        red -
        Math.max(
          green,
          blue
        );

      if (
        red < threshold ||
        redDominance < 55
      ) {
        continue;
      }

      const weight =
        redDominance + 1;

      weightedX +=
        x * weight;

      weightedY +=
        y * weight;

      weightTotal +=
        weight;
    }
  }

  if (
    weightTotal <= 0
  ) {
    return {
      x: bestX,
      y: bestY,
      brightness:
        bestBrightness,
    };
  }

  return {
    x:
      weightedX /
      weightTotal,

    y:
      weightedY /
      weightTotal,

    brightness:
      bestBrightness,
  };
}

function smoothPointBuffer(
  points: Point[]
): Point | null {
  if (
    points.length === 0
  ) {
    return null;
  }

  let totalWeight = 0;
  let x = 0;
  let y = 0;

  for (
    let index = 0;
    index < points.length;
    index += 1
  ) {
    const weight =
      index + 1;

    x +=
      points[index].x *
      weight;

    y +=
      points[index].y *
      weight;

    totalWeight +=
      weight;
  }

  return {
    x:
      x /
      totalWeight,

    y:
      y /
      totalWeight,
  };
}

function createDefaultCalibration(
  width: number,
  height: number
): CalibrationPoints {
  const marginX =
    width * 0.1;

  const marginY =
    height * 0.1;

  return {
    TL: {
      x: marginX,
      y: marginY,
    },

    TR: {
      x:
        width -
        marginX,

      y: marginY,
    },

    BR: {
      x:
        width -
        marginX,

      y:
        height -
        marginY,
    },

    BL: {
      x: marginX,

      y:
        height -
        marginY,
    },
  };
}

function normalizedToProjector(
  point: Point,
  width: number,
  height: number
): Point {
  return {
    x:
      CALIBRATION_MARGIN *
        width +
      point.x *
        width *
        (
          1 -
          CALIBRATION_MARGIN *
            2
        ),

    y:
      CALIBRATION_MARGIN *
        height +
      point.y *
        height *
        (
          1 -
          CALIBRATION_MARGIN *
            2
        ),
  };
}

function projectorToNormalized(
  point: Point,
  width: number,
  height: number
): Point {
  const drawableWidth =
    width *
    (
      1 -
      CALIBRATION_MARGIN *
        2
    );

  const drawableHeight =
    height *
    (
      1 -
      CALIBRATION_MARGIN *
        2
    );

  return {
    x:
      (
        point.x -
        CALIBRATION_MARGIN *
          width
      ) /
      drawableWidth,

    y:
      (
        point.y -
        CALIBRATION_MARGIN *
          height
      ) /
      drawableHeight,
  };
}

function rasterizeGridLine(
  from: GridCell,
  to: GridCell
): GridCell[] {
  let x0 = from.x;
  let y0 = from.y;

  const x1 = to.x;
  const y1 = to.y;

  const cells: GridCell[] = [];

  const dx =
    Math.abs(
      x1 - x0
    );

  const sx =
    x0 < x1
      ? 1
      : -1;

  const dy =
    -Math.abs(
      y1 - y0
    );

  const sy =
    y0 < y1
      ? 1
      : -1;

  let error =
    dx + dy;

  while (true) {
    cells.push({
      x: x0,
      y: y0,
    });

    if (
      x0 === x1 &&
      y0 === y1
    ) {
      break;
    }

    const doubledError =
      2 * error;

    if (
      doubledError >= dy
    ) {
      error += dy;
      x0 += sx;
    }

    if (
      doubledError <= dx
    ) {
      error += dx;
      y0 += sy;
    }
  }

  return cells;
}

function pointInsideClearField(
  point: Point,
  field: ClearField
) {
  return (
    point.x >= field.x &&
    point.x <=
      field.x + field.width &&
    point.y >= field.y &&
    point.y <=
      field.y + field.height
  );
}

export default function HoodWallPage() {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const processingCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const overlayCanvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const channelRef =
    useRef<BroadcastChannel | null>(
      null
    );

  const streamRef =
    useRef<MediaStream | null>(
      null
    );

  const animationRef =
    useRef<number | null>(
      null
    );

  const projectorWindowRef =
    useRef<Window | null>(
      null
    );

  const thresholdRef =
    useRef(180);

  const pixelSizeRef =
    useRef(
      DEFAULT_PIXEL_SIZE
    );

  const projectorSizeRef =
    useRef<ProjectorSize>({
      width: 1280,
      height: 720,
    });

  const projectorFullscreenRef =
    useRef(false);

  const homographyRef =
    useRef<Homography | null>(
      null
    );

  const inverseHomographyRef =
    useRef<Homography | null>(
      null
    );

  const candidateRef =
    useRef<Candidate | null>(
      null
    );

  const calibratedRef =
    useRef(false);

  const calibrationEditingRef =
    useRef(false);

  const trackingEnabledRef =
    useRef(true);

  const cameraRunningRef =
    useRef(false);

  const brushDownRef =
    useRef(false);

  const lastValidLaserTimeRef =
    useRef(0);

  const lastAcceptedCameraPointRef =
    useRef<Point | null>(
      null
    );

  const lastAcceptedTimeRef =
    useRef(0);

  const smoothingBufferRef =
    useRef<Point[]>([]);

  const paintPixelsRef =
    useRef<PaintPixel[]>([]);

  const paintPixelKeysRef =
    useRef<Set<string>>(
      new Set()
    );

  const lastPaintCellRef =
    useRef<GridCell | null>(
      null
    );

  /*
   * Last normalized point actually painted.
   * Used to reconnect short tracking dropouts without connecting large jumps.
   */
  const lastPaintPointRef =
    useRef<Point | null>(
      null
    );

  /*
   * WET INK STATE
   */
  const lastMotionPointRef =
    useRef<Point | null>(
      null
    );

  const lastMotionTimeRef =
    useRef(0);

  const wetnessRef =
    useRef(0);

  const dripAnchorRef =
    useRef<Point | null>(
      null
    );

  const dripLengthRef =
    useRef(0);

  const dripsEnabledRef =
    useRef(true);

  /*
   * CLEAR FIELD
   */
  const clearFieldRef =
    useRef<ClearField>({
      ...DEFAULT_CLEAR_FIELD,
    });

  const clearFieldVisibleRef =
    useRef(true);

  const clearHoldStartRef =
    useRef<number | null>(
      null
    );

  const clearTriggeredRef =
    useRef(false);

  const clearFieldDraggingRef =
    useRef(false);

  const clearFieldDragOffsetRef =
    useRef<Point>({
      x: 0,
      y: 0,
    });

  const activeHandleRef =
    useRef<
      CalibrationCorner | null
    >(null);

  const lastUiUpdateRef =
    useRef(0);

  const [
    cameraActive,
    setCameraActive,
  ] = useState(false);

  const [
    cameraError,
    setCameraError,
  ] =
    useState<string | null>(
      null
    );

  const [
    projectorConnected,
    setProjectorConnected,
  ] = useState(false);

  const [
    projectorFullscreen,
    setProjectorFullscreen,
  ] = useState(false);

  const [
    projectorSize,
    setProjectorSize,
  ] =
    useState<ProjectorSize>({
      width: 1280,
      height: 720,
    });

  const [
    trackingBrightness,
    setTrackingBrightness,
  ] = useState(180);

  const [
    pixelSize,
    setPixelSize,
  ] = useState(
    DEFAULT_PIXEL_SIZE
  );

  const [
    detectedBrightness,
    setDetectedBrightness,
  ] = useState(0);

  const [
    candidate,
    setCandidate,
  ] =
    useState<Candidate | null>(
      null
    );

  const [
    calibrated,
    setCalibrated,
  ] = useState(false);

  const [
    calibrationEditing,
    setCalibrationEditing,
  ] = useState(false);

  const [
    calibrationPoints,
    setCalibrationPoints,
  ] =
    useState<CalibrationPoints | null>(
      null
    );

  const [
    trackingEnabled,
    setTrackingEnabled,
  ] = useState(true);

  const [
    rejectedJump,
    setRejectedJump,
  ] = useState(false);

  const [
    dripsEnabled,
    setDripsEnabled,
  ] = useState(true);

  const [
    currentSpeed,
    setCurrentSpeed,
  ] = useState(0);

  const [
    currentWetness,
    setCurrentWetness,
  ] = useState(0);

  const [
    dripLength,
    setDripLength,
  ] = useState(0);

  const [
    clearField,
    setClearField,
  ] = useState<ClearField>({
    ...DEFAULT_CLEAR_FIELD,
  });

  const [
    clearFieldVisible,
    setClearFieldVisible,
  ] = useState(true);

  const [
    clearProgress,
    setClearProgress,
  ] = useState(0);

  const [
    darkMode,
    setDarkMode,
  ] = useState(false);

  useEffect(() => {
    thresholdRef.current =
      trackingBrightness;
  }, [trackingBrightness]);

  useEffect(() => {
    pixelSizeRef.current =
      pixelSize;
  }, [pixelSize]);

  useEffect(() => {
    calibratedRef.current =
      calibrated;
  }, [calibrated]);

  useEffect(() => {
    calibrationEditingRef.current =
      calibrationEditing;
  }, [calibrationEditing]);

  useEffect(() => {
    trackingEnabledRef.current =
      trackingEnabled;
  }, [trackingEnabled]);

  useEffect(() => {
    dripsEnabledRef.current =
      dripsEnabled;
  }, [dripsEnabled]);

  useEffect(() => {
    clearFieldRef.current =
      clearField;
  }, [clearField]);

  useEffect(() => {
    clearFieldVisibleRef.current =
      clearFieldVisible;
  }, [clearFieldVisible]);

  const sendClearField =
    useCallback(
      (
        field =
          clearFieldRef.current,
        visible =
          clearFieldVisibleRef.current,
        progress = 0
      ) => {
        sendMessage(
          channelRef.current,
          {
            type:
              "CLEAR_FIELD",

            x: field.x,
            y: field.y,

            width:
              field.width,

            height:
              field.height,

            visible,
            progress,
          }
        );
      },
      []
    );

  const resetWetInk =
    useCallback(() => {
      lastMotionPointRef.current =
        null;

      lastMotionTimeRef.current =
        0;

      wetnessRef.current =
        0;

      dripAnchorRef.current =
        null;

      dripLengthRef.current =
        0;

      setCurrentSpeed(0);
      setCurrentWetness(0);
      setDripLength(0);
    }, []);

  const endStroke =
    useCallback(() => {
      smoothingBufferRef.current =
        [];

      lastAcceptedCameraPointRef.current =
        null;

      lastPaintCellRef.current =
        null;

      lastPaintPointRef.current =
        null;

      resetWetInk();

      if (
        brushDownRef.current
      ) {
        sendMessage(
          channelRef.current,
          {
            type:
              "POINT_END",
          }
        );

        brushDownRef.current =
          false;
      }
    }, [resetWetInk]);

  const clearWall =
    useCallback(() => {
      paintPixelsRef.current =
        [];

      paintPixelKeysRef.current =
        new Set();

      lastPaintCellRef.current =
        null;

      lastPaintPointRef.current =
        null;

      resetWetInk();

      sendMessage(
        channelRef.current,
        {
          type: "CLEAR",
        }
      );
    }, [resetWetInk]);

  const addPaintRectangle =
    useCallback(
      (
        x: number,
        y: number,
        width: number,
        height: number,
        keyPrefix: string
      ) => {
        const projector =
          projectorSizeRef.current;

        const key =
          `${keyPrefix}:${x}:${y}:${width}:${height}`;

        if (
          paintPixelKeysRef.current.has(
            key
          )
        ) {
          return;
        }

        paintPixelKeysRef.current.add(
          key
        );

        paintPixelsRef.current.push({
          x,
          y,
          width,
          height,

          projectorWidth:
            projector.width,

          projectorHeight:
            projector.height,
        });
      },
      []
    );

  const addBrushPoint =
    useCallback(
      (point: Point) => {
        const projector =
          projectorSizeRef.current;

        const pixelSize =
          pixelSizeRef.current;

        const projected =
          normalizedToProjector(
            point,
            projector.width,
            projector.height
          );

        const cell: GridCell = {
          x:
            Math.floor(
              projected.x /
              pixelSize
            ),

          y:
            Math.floor(
              projected.y /
              pixelSize
            ),
        };

        const previous =
          lastPaintCellRef.current;

        const cells =
          previous
            ? rasterizeGridLine(
                previous,
                cell
              )
            : [cell];

        for (
          const current of
          cells
        ) {
          addPaintRectangle(
            current.x *
              pixelSize,

            current.y *
              pixelSize,

            pixelSize,
            pixelSize,
            "brush"
          );
        }

        lastPaintCellRef.current =
          cell;

        lastPaintPointRef.current =
          point;
      },
      [addPaintRectangle]
    );

  /*
   * DRIP PREVIEW
   *
   * Notice that pixelSizeRef is NOT used here.
   *
   * Drip width = exactly 2 projector pixels.
   */
  const addDripPreview =
    useCallback(
      (
        anchor: Point,
        fromLength: number,
        toLength: number
      ) => {
        const projector =
          projectorSizeRef.current;

        const projected =
          normalizedToProjector(
            anchor,
            projector.width,
            projector.height
          );

        const startX =
          Math.round(
            projected.x -
            DRIP_WIDTH_PX / 2
          );

        const startY =
          Math.round(
            projected.y
          );

        if (
          toLength <=
          fromLength
        ) {
          return;
        }

        addPaintRectangle(
          startX,
          startY +
            fromLength,
          DRIP_WIDTH_PX,
          toLength -
            fromLength,
          "drip"
        );
      },
      [addPaintRectangle]
    );

  const candidateIsValid =
    useCallback(
      (
        point: Point,
        videoWidth: number,
        videoHeight: number,
        now: number
      ) => {
        const previous =
          lastAcceptedCameraPointRef.current;

        if (!previous) {
          return true;
        }

        if (
          now -
            lastAcceptedTimeRef.current >
          JUMP_RESET_MS
        ) {
          return true;
        }

        const diagonal =
          Math.sqrt(
            videoWidth *
              videoWidth +
            videoHeight *
              videoHeight
          );

        const jump =
          distance(
            point,
            previous
          );

        return (
          jump /
            diagonal <=
          MAX_JUMP_NORMALIZED
        );
      },
      []
    );

  const updateWetInk =
    useCallback(
      (
        point: Point,
        now: number
      ) => {
        if (
          !dripsEnabledRef.current
        ) {
          resetWetInk();
          return;
        }

        const previous =
          lastMotionPointRef.current;

        const previousTime =
          lastMotionTimeRef.current;

        if (
          !previous ||
          previousTime <= 0
        ) {
          lastMotionPointRef.current =
            point;

          lastMotionTimeRef.current =
            now;

          dripAnchorRef.current =
            point;

          return;
        }

        const deltaMs =
          Math.max(
            1,
            now -
              previousTime
          );

        const deltaSeconds =
          deltaMs /
          1000;

        let moved =
          distance(
            point,
            previous
          );

        if (
          moved <
          MIN_MOVEMENT_FOR_SPEED
        ) {
          moved = 0;
        }

        const speed =
          moved /
          deltaSeconds;

        /*
         * 1 = very wet / stationary
         * 0 = fast / dry
         */
        const normalizedSpeed =
          clamp(
            speed /
              MAX_WET_SPEED,
            0,
            1
          );

        const wetPressure =
          Math.pow(
            1 - normalizedSpeed,
            0.45
          );

        wetnessRef.current +=
          wetPressure *
          deltaMs *
          DRIP_RATE;

        if (
          wetPressure <
          0.25
        ) {
          wetnessRef.current -=
            deltaMs *
            WETNESS_DECAY;
        }

        wetnessRef.current =
          clamp(
            wetnessRef.current,
            0,
            MAX_DRIP_LENGTH_PX
          );

        let anchor =
          dripAnchorRef.current;

        if (
          !anchor ||
          distance(
            anchor,
            point
          ) >
            DRIP_ANCHOR_RESET_DISTANCE
        ) {
          anchor = point;

          dripAnchorRef.current =
            point;

          /*
           * Moving to a new area retains
           * a little wetness, but creates
           * a fresh drip.
           */
          wetnessRef.current *=
            0.35;

          dripLengthRef.current =
            0;
        }

        const desiredLength =
          wetnessRef.current >=
          DRIP_START_WETNESS
            ? Math.min(
                MAX_DRIP_LENGTH_PX,
                Math.floor(
                  Math.pow(
                    wetnessRef.current,
                    DRIP_LENGTH_EXPONENT
                  ) *
                    DRIP_LENGTH_MULTIPLIER
                )
              )
            : 0;

        if (
          anchor &&
          desiredLength >
            dripLengthRef.current
        ) {
          const previousLength =
            dripLengthRef.current;

          addDripPreview(
            anchor,
            previousLength,
            desiredLength
          );

          sendMessage(
            channelRef.current,
            {
              type: "DRIP",

              x: anchor.x,
              y: anchor.y,

              length:
                desiredLength,
            }
          );

          dripLengthRef.current =
            desiredLength;

          setDripLength(
            desiredLength
          );
        }

        setCurrentSpeed(
          speed
        );

        setCurrentWetness(
          wetPressure
        );

        lastMotionPointRef.current =
          point;

        lastMotionTimeRef.current =
          now;
      },
      [
        addDripPreview,
        resetWetInk,
      ]
    );

  const drawOverlay =
    useCallback(() => {
      const canvas =
        overlayCanvasRef.current;

      const video =
        videoRef.current;

      if (
        !canvas ||
        !video ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        return;
      }

      if (
        canvas.width !==
          video.videoWidth ||
        canvas.height !==
          video.videoHeight
      ) {
        canvas.width =
          video.videoWidth;

        canvas.height =
          video.videoHeight;
      }

      const context =
        canvas.getContext(
          "2d"
        );

      if (!context) {
        return;
      }

      context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const inverse =
        inverseHomographyRef.current;

      /*
       * PAINT PREVIEW
       */
      if (inverse) {
        context.fillStyle =
          GREEN;

        for (
          const pixel of
          paintPixelsRef.current
        ) {
          const projectorCorners = [
            {
              x: pixel.x,
              y: pixel.y,
            },
            {
              x:
                pixel.x +
                pixel.width,

              y: pixel.y,
            },
            {
              x:
                pixel.x +
                pixel.width,

              y:
                pixel.y +
                pixel.height,
            },
            {
              x: pixel.x,

              y:
                pixel.y +
                pixel.height,
            },
          ];

          const cameraCorners =
            projectorCorners
              .map(
                (
                  projectorCorner
                ) => {
                  const normalized =
                    projectorToNormalized(
                      projectorCorner,
                      pixel.projectorWidth,
                      pixel.projectorHeight
                    );

                  return transformPoint(
                    normalized,
                    inverse
                  );
                }
              )
              .filter(
                (
                  point
                ): point is Point =>
                  Boolean(point)
              );

          if (
            cameraCorners.length !==
            4
          ) {
            continue;
          }

          context.beginPath();

          context.moveTo(
            cameraCorners[0].x,
            cameraCorners[0].y
          );

          context.lineTo(
            cameraCorners[1].x,
            cameraCorners[1].y
          );

          context.lineTo(
            cameraCorners[2].x,
            cameraCorners[2].y
          );

          context.lineTo(
            cameraCorners[3].x,
            cameraCorners[3].y
          );

          context.closePath();

          context.fill();
        }
      }

      /*
       * CLEAR FIELD
       */
      if (
        inverse &&
        clearFieldVisible
      ) {
        const field =
          clearFieldRef.current;

        const corners = [
          {
            x: field.x,
            y: field.y,
          },
          {
            x:
              field.x +
              field.width,

            y: field.y,
          },
          {
            x:
              field.x +
              field.width,

            y:
              field.y +
              field.height,
          },
          {
            x: field.x,

            y:
              field.y +
              field.height,
          },
        ]
          .map(
            (point) =>
              transformPoint(
                point,
                inverse
              )
          )
          .filter(
            (
              point
            ): point is Point =>
              Boolean(point)
          );

        if (
          corners.length ===
          4
        ) {
          context.strokeStyle =
            GREEN;

          context.lineWidth =
            Math.max(
              3,
              canvas.width /
                450
            );

          context.beginPath();

          context.moveTo(
            corners[0].x,
            corners[0].y
          );

          context.lineTo(
            corners[1].x,
            corners[1].y
          );

          context.lineTo(
            corners[2].x,
            corners[2].y
          );

          context.lineTo(
            corners[3].x,
            corners[3].y
          );

          context.closePath();
          context.stroke();

          const centerX =
            (
              corners[0].x +
              corners[1].x +
              corners[2].x +
              corners[3].x
            ) /
            4;

          const centerY =
            (
              corners[0].y +
              corners[1].y +
              corners[2].y +
              corners[3].y
            ) /
            4;

          context.fillStyle =
            GREEN;

          context.font =
            `${Math.max(
              10,
              canvas.width /
                85
            )}px monospace`;

          context.textAlign =
            "center";

          context.textBaseline =
            "middle";

          context.fillText(
            "CLEAR",
            centerX,
            centerY
          );
        }
      }

      /*
       * CALIBRATION
       */
      if (
        calibrationPoints
      ) {
        context.strokeStyle = GREEN;

        context.lineWidth =
          Math.max(
            2,
            canvas.width /
              500
          );

        context.beginPath();

        context.moveTo(
          calibrationPoints.TL.x,
          calibrationPoints.TL.y
        );

        context.lineTo(
          calibrationPoints.TR.x,
          calibrationPoints.TR.y
        );

        context.lineTo(
          calibrationPoints.BR.x,
          calibrationPoints.BR.y
        );

        context.lineTo(
          calibrationPoints.BL.x,
          calibrationPoints.BL.y
        );

        context.closePath();
        context.stroke();

        for (
          const corner of
          CALIBRATION_ORDER
        ) {
          const point =
            calibrationPoints[
              corner
            ];

          const handleSize =
            Math.max(
              18,
              canvas.width /
                55
            );

          context.fillStyle = GREEN;

          context.fillRect(
            point.x -
              handleSize / 2,

            point.y -
              handleSize / 2,

            handleSize,
            handleSize
          );

          context.fillStyle =
            "#000000";

          context.font =
            `${Math.max(
              10,
              canvas.width /
                90
            )}px monospace`;

          context.textAlign =
            "center";

          context.textBaseline =
            "middle";

          context.fillText(
            corner,
            point.x,
            point.y
          );
        }
      }

      /*
       * TRACKER
       */
      const current =
        candidateRef.current;

      if (current) {
        const normalized =
          clamp(
            (
              thresholdRef.current -
              100
            ) /
              155,
            0,
            1
          );

        const maxSize =
          canvas.width *
          0.09;

        const minSize =
          canvas.width *
          0.018;

        const size =
          maxSize -
          normalized *
            (
              maxSize -
              minSize
            );

        const half =
          size / 2;

        context.strokeStyle =
          GREEN;

        context.lineWidth =
          Math.max(
            2,
            canvas.width /
              600
          );

        context.strokeRect(
          current.x - half,
          current.y - half,
          size,
          size
        );

        const centerSize =
          Math.max(
            3,
            canvas.width /
              350
          );

        context.fillStyle =
          GREEN;

        context.fillRect(
          current.x -
            centerSize / 2,

          current.y -
            centerSize / 2,

          centerSize,
          centerSize
        );
      }
    }, [
      calibrationPoints,
      clearFieldVisible,
    ]);

  const processFrameRef =
    useRef<() => void>(
      () => undefined
    );

  useEffect(() => {
    processFrameRef.current =
      () => {
        if (
          !cameraRunningRef.current
        ) {
          return;
        }

        const video =
          videoRef.current;

        const canvas =
          processingCanvasRef.current;

        if (
          !video ||
          !canvas ||
          video.readyState <
            HTMLMediaElement
              .HAVE_CURRENT_DATA ||
          !video.videoWidth ||
          !video.videoHeight
        ) {
          animationRef.current =
            requestAnimationFrame(
              () =>
                processFrameRef.current()
            );

          return;
        }

        const aspect =
          video.videoHeight /
          video.videoWidth;

        const width =
          DETECTION_WIDTH;

        const height =
          Math.max(
            1,
            Math.round(
              width *
              aspect
            )
          );

        if (
          canvas.width !== width ||
          canvas.height !== height
        ) {
          canvas.width =
            width;

          canvas.height =
            height;
        }

        const context =
          canvas.getContext(
            "2d",
            {
              willReadFrequently:
                true,
            }
          );

        if (!context) {
          animationRef.current =
            requestAnimationFrame(
              () =>
                processFrameRef.current()
            );

          return;
        }

        context.drawImage(
          video,
          0,
          0,
          width,
          height
        );

        const imageData =
          context.getImageData(
            0,
            0,
            width,
            height
          );

        const detected =
          findBrightestPoint(
            imageData,
            thresholdRef.current
          );

        let cameraCandidate:
          | Candidate
          | null = null;

        if (detected) {
          const scaleX =
            video.videoWidth /
            width;

          const scaleY =
            video.videoHeight /
            height;

          cameraCandidate = {
            x:
              detected.x *
              scaleX,

            y:
              detected.y *
              scaleY,

            brightness:
              detected.brightness,
          };
        }

        candidateRef.current =
          cameraCandidate;

        const now =
          performance.now();

        let validCandidate =
          cameraCandidate;

        let jumpRejected =
          false;

        if (
          cameraCandidate &&
          !candidateIsValid(
            cameraCandidate,
            video.videoWidth,
            video.videoHeight,
            now
          )
        ) {
          validCandidate =
            null;

          jumpRejected =
            true;
        }

        if (
          now -
            lastUiUpdateRef.current >
          60
        ) {
          lastUiUpdateRef.current =
            now;

          setCandidate(
            cameraCandidate
          );

          setDetectedBrightness(
            cameraCandidate
              ?.brightness ??
              0
          );

          setRejectedJump(
            jumpRejected
          );
        }

        if (
          !calibrationEditingRef.current &&
          calibratedRef.current &&
          trackingEnabledRef.current &&
          validCandidate &&
          homographyRef.current
        ) {
          const transformed =
            transformPoint(
              validCandidate,
              homographyRef.current
            );

          if (
            transformed &&
            transformed.x >=
              -0.04 &&
            transformed.x <=
              1.04 &&
            transformed.y >=
              -0.04 &&
            transformed.y <=
              1.04
          ) {
            const normalized: Point = {
              x:
                clamp(
                  transformed.x,
                  0,
                  1
                ),

              y:
                clamp(
                  transformed.y,
                  0,
                  1
                ),
            };

            if (
              clearFieldVisibleRef.current &&
              pointInsideClearField(
                normalized,
                clearFieldRef.current
              )
            ) {
              if (
                clearHoldStartRef.current ===
                null
              ) {
                clearHoldStartRef.current =
                  now;

                clearTriggeredRef.current =
                  false;

                endStroke();
              }

              const elapsed =
                now -
                clearHoldStartRef.current;

              const progress =
                clamp(
                  elapsed /
                    CLEAR_HOLD_MS,
                  0,
                  1
                );

              setClearProgress(
                progress
              );

              sendClearField(
                clearFieldRef.current,
                true,
                progress
              );

              if (
                progress >= 1 &&
                !clearTriggeredRef.current
              ) {
                clearTriggeredRef.current =
                  true;

                clearWall();
              }

              lastValidLaserTimeRef.current =
                now;
            } else {
              if (
                clearHoldStartRef.current !==
                null
              ) {
                clearHoldStartRef.current =
                  null;

                clearTriggeredRef.current =
                  false;

                setClearProgress(
                  0
                );

                sendClearField(
                  clearFieldRef.current,
                  clearFieldVisibleRef.current,
                  0
                );
              }

              const buffer =
                smoothingBufferRef.current;

              buffer.push(
                normalized
              );

              while (
                buffer.length >
                SMOOTHING_BUFFER_SIZE
              ) {
                buffer.shift();
              }

              const smoothed =
                smoothPointBuffer(
                  buffer
                );

              if (smoothed) {
                /*
                 * If tracking disappeared briefly, reconnect only when the
                 * returning laser is still close to the last painted point.
                 * A far return starts a fresh stroke instead of drawing a jump.
                 */
                const lastPaintPoint =
                  lastPaintPointRef.current;

                const gapMs =
                  now -
                  lastValidLaserTimeRef.current;

                /*
                 * OFF -> ON must NEVER reconnect to the old stroke.
                 * After a meaningful laser gap we clear smoothing first,
                 * end the previous stroke, and use the returning point as
                 * the first point of a new stroke.
                 */
                if (
                  brushDownRef.current &&
                  gapMs >= RECONNECT_CUT_MS
                ) {
                  smoothingBufferRef.current =
                    [normalized];

                  lastPaintCellRef.current =
                    null;

                  lastPaintPointRef.current =
                    null;

                  resetWetInk();

                  sendMessage(
                    channelRef.current,
                    {
                      type:
                        "POINT_END",
                    }
                  );

                  brushDownRef.current =
                    false;
                } else if (
                  brushDownRef.current &&
                  gapMs > 40 &&
                  lastPaintPoint &&
                  distance(
                    lastPaintPoint,
                    smoothed
                  ) >
                    MAX_BRIDGE_DISTANCE_NORMALIZED
                ) {
                  /*
                   * Very short camera miss, but the return is too far away:
                   * also start a new stroke instead of drawing a diagonal.
                   */
                  smoothingBufferRef.current =
                    [normalized];

                  lastPaintCellRef.current =
                    null;

                  lastPaintPointRef.current =
                    null;

                  resetWetInk();

                  sendMessage(
                    channelRef.current,
                    {
                      type:
                        "POINT_END",
                    }
                  );

                  brushDownRef.current =
                    false;
                }

                const outputPoint =
                  !brushDownRef.current &&
                  gapMs >= RECONNECT_CUT_MS
                    ? normalized
                    : smoothed;

                sendMessage(
                  channelRef.current,
                  {
                    type:
                      "POINT",

                    x:
                      outputPoint.x,

                    y:
                      outputPoint.y,
                  }
                );

                addBrushPoint(
                  outputPoint
                );

                updateWetInk(
                  outputPoint,
                  now
                );

                brushDownRef.current =
                  true;

                lastValidLaserTimeRef.current =
                  now;

                lastAcceptedTimeRef.current =
                  now;

                lastAcceptedCameraPointRef.current =
                  {
                    x:
                      validCandidate.x,

                    y:
                      validCandidate.y,
                  };
              }
            }
          }
        } else {
          const timeSinceLaser =
            now -
            lastValidLaserTimeRef.current;

          if (
            brushDownRef.current &&
            timeSinceLaser >
              LASER_LOST_GRACE_MS
          ) {
            endStroke();
          }

          if (
            clearHoldStartRef.current !==
              null &&
            timeSinceLaser >
              LASER_LOST_GRACE_MS
          ) {
            clearHoldStartRef.current =
              null;

            clearTriggeredRef.current =
              false;

            setClearProgress(
              0
            );

            sendClearField(
              clearFieldRef.current,
              clearFieldVisibleRef.current,
              0
            );
          }
        }

        drawOverlay();

        animationRef.current =
          requestAnimationFrame(
            () =>
              processFrameRef.current()
          );
      };
  }, [
    addBrushPoint,
    candidateIsValid,
    clearWall,
    drawOverlay,
    endStroke,
    sendClearField,
    updateWetInk,
    resetWetInk,
  ]);

  useEffect(() => {
    if (
      typeof BroadcastChannel ===
      "undefined"
    ) {
      console.error(
        "BroadcastChannel is not supported in this browser."
      );

      return;
    }

    const channel =
      new BroadcastChannel(
        HOODWALL_CHANNEL
      );

    channelRef.current =
      channel;

    channel.onmessage = (
      event:
        MessageEvent<HoodWallMessage>
    ) => {
      const message =
        event.data;

      if (
        message.type ===
        "PROJECTOR_READY"
      ) {
        const next = {
          width:
            message.width,

          height:
            message.height,
        };

        projectorSizeRef.current =
          next;

        setProjectorSize(
          next
        );

        setProjectorConnected(
          true
        );

        sendMessage(
          channel,
          {
            type:
              "PIXEL_SIZE",

            value:
              pixelSizeRef.current,
          }
        );

        sendMessage(
          channel,
          {
            type:
              "CLEAR_FIELD",

            ...clearFieldRef.current,

            visible:
              clearFieldVisibleRef.current,

            progress: 0,
          }
        );

        return;
      }

      if (
        message.type ===
        "PROJECTOR_STATUS"
      ) {
        const next = {
          width: message.width,
          height: message.height,
        };

        projectorSizeRef.current = next;
        projectorFullscreenRef.current = message.fullscreen;

        setProjectorSize(next);
        setProjectorConnected(true);
        setProjectorFullscreen(message.fullscreen);

        return;
      }

      if (
        message.type ===
        "PROJECTOR_CLOSING"
      ) {
        projectorWindowRef.current = null;
        projectorFullscreenRef.current = false;

        setProjectorConnected(false);
        setProjectorFullscreen(false);

        window.setTimeout(() => {
          window.focus();
        }, 100);
      }
    };
    sendMessage(
      channel,
      {
        type: "PING",
      }
    );

    return () => {
      channel.close();

      channelRef.current =
        null;
    };
  }, []);

  useEffect(() => {
    return () => {
      cameraRunningRef.current =
        false;

      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );
    };
  }, []);

  async function startCamera() {
    setCameraError(null);

    try {
      if (
        !navigator.mediaDevices
          ?.getUserMedia
      ) {
        throw new Error(
          "Camera access is not supported in this browser."
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              width: {
                ideal: 1920,
              },

              height: {
                ideal: 1080,
              },

              facingMode:
                "environment",
            },

            audio: false,
          }
        );

      streamRef.current =
        stream;

      const video =
        videoRef.current;

      if (!video) {
        throw new Error(
          "Camera preview unavailable."
        );
      }

      video.srcObject =
        stream;

      await video.play();

      cameraRunningRef.current =
        true;

      setCameraActive(
        true
      );

      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      animationRef.current =
        requestAnimationFrame(
          () =>
            processFrameRef.current()
        );
    } catch (error) {
      cameraRunningRef.current =
        false;

      setCameraActive(
        false
      );

      setCameraError(
        error instanceof Error
          ? error.message
          : "Unable to start camera."
      );
    }
  }

  function stopCamera() {
    cameraRunningRef.current =
      false;

    endStroke();

    if (
      animationRef.current !==
      null
    ) {
      cancelAnimationFrame(
        animationRef.current
      );

      animationRef.current =
        null;
    }

    streamRef.current
      ?.getTracks()
      .forEach(
        (track) =>
          track.stop()
      );

    streamRef.current =
      null;

    if (
      videoRef.current
    ) {
      videoRef.current.srcObject =
        null;
    }

    candidateRef.current =
      null;

    setCameraActive(false);
    setCandidate(null);
    setDetectedBrightness(0);
  }

  const openProjector =
    useCallback(() => {
      setCameraError(null);

      const existing =
        projectorWindowRef.current;

      if (
        existing &&
        !existing.closed
      ) {
        existing.focus();

        sendMessage(
          channelRef.current,
          {
            type: "PING",
          }
        );

        return;
      }

      const projectorWindow =
        window.open(
          "/hoodwall/projector",
          "hoodwall-projector",
          "popup=yes,width=1280,height=720"
        );

      if (
        !projectorWindow
      ) {
        setCameraError(
          "Projector window was blocked. Allow pop-ups for this site."
        );

        return;
      }

      projectorWindowRef.current =
        projectorWindow;

      projectorWindow.focus();
    }, []);

  const fullscreenProjector =
    useCallback(async () => {
      const projector =
        projectorWindowRef.current;

      if (
        !projector ||
        projector.closed
      ) {
        openProjector();
        return;
      }

      projector.focus();

      setCameraError(
        projectorFullscreenRef.current
          ? null
          : "Click the large FULLSCREEN button in the projector window."
      );
    }, [openProjector]);

  function showCalibration() {
    const video =
      videoRef.current;

    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setCameraError(
        "Start the camera first."
      );

      return;
    }

    if (
      !projectorConnected
    ) {
      setCameraError(
        "Open the projector window first."
      );

      return;
    }

    if (
      !projectorFullscreenRef.current
    ) {
      setCameraError(
        "Fullscreen the projector before calibration."
      );

      return;
    }

    endStroke();

    if (
      !calibrationPoints
    ) {
      setCalibrationPoints(
        createDefaultCalibration(
          video.videoWidth,
          video.videoHeight
        )
      );
    }

    setCalibrationEditing(
      true
    );

    calibrationEditingRef.current =
      true;

    sendMessage(
      channelRef.current,
      {
        type:
          "CALIBRATION_SHOW",
      }
    );
  }

  function resetCalibration() {
    const video =
      videoRef.current;

    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    setCalibrationPoints(
      createDefaultCalibration(
        video.videoWidth,
        video.videoHeight
      )
    );
  }

  function cancelCalibration() {
    setCalibrationEditing(
      false
    );

    calibrationEditingRef.current =
      false;

    sendMessage(
      channelRef.current,
      {
        type:
          "CALIBRATION_HIDE",
      }
    );
  }

  function applyCalibration() {
    if (
      !calibrationPoints
    ) {
      return;
    }

    const homography =
      calculateHomography(
        calibrationPoints
      );

    if (!homography) {
      setCameraError(
        "Calibration could not be calculated."
      );

      return;
    }

    const inverse =
      invertHomography(
        homography
      );

    if (!inverse) {
      setCameraError(
        "Calibration inverse could not be calculated."
      );

      return;
    }

    homographyRef.current =
      homography;

    inverseHomographyRef.current =
      inverse;

    smoothingBufferRef.current =
      [];

    lastAcceptedCameraPointRef.current =
      null;

    setCalibrationEditing(
      false
    );

    calibrationEditingRef.current =
      false;

    setCalibrated(true);

    calibratedRef.current =
      true;

    sendMessage(
      channelRef.current,
      {
        type:
          "CALIBRATION_HIDE",
      }
    );

    sendClearField(
      clearFieldRef.current,
      clearFieldVisibleRef.current,
      0
    );
  }

  function handlePixelSizeChange(
    value: number
  ) {
    const next =
      clamp(
        value,
        MIN_PIXEL_SIZE,
        MAX_PIXEL_SIZE
      );

    endStroke();

    pixelSizeRef.current =
      next;

    setPixelSize(next);

    sendMessage(
      channelRef.current,
      {
        type:
          "PIXEL_SIZE",

        value: next,
      }
    );
  }

  function toggleTracking() {
    setTrackingEnabled(
      (current) => {
        const next =
          !current;

        trackingEnabledRef.current =
          next;

        if (!next) {
          endStroke();
        }

        return next;
      }
    );
  }

  function toggleDrips() {
    setDripsEnabled(
      (current) => {
        const next =
          !current;

        dripsEnabledRef.current =
          next;

        resetWetInk();

        return next;
      }
    );
  }

  function toggleClearField() {
    const next =
      !clearFieldVisibleRef.current;

    clearFieldVisibleRef.current =
      next;

    setClearFieldVisible(
      next
    );

    clearHoldStartRef.current =
      null;

    clearTriggeredRef.current =
      false;

    setClearProgress(0);

    sendClearField(
      clearFieldRef.current,
      next,
      0
    );
  }

  function pointerToCanvasPoint(
    event:
      ReactPointerEvent<HTMLCanvasElement>
  ): Point | null {
    const canvas =
      overlayCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    return {
      x:
        (
          (
            event.clientX -
            rect.left
          ) /
          rect.width
        ) *
        canvas.width,

      y:
        (
          (
            event.clientY -
            rect.top
          ) /
          rect.height
        ) *
        canvas.height,
    };
  }

  function cameraPointToNormalized(
    point: Point
  ) {
    if (
      !homographyRef.current
    ) {
      return null;
    }

    return transformPoint(
      point,
      homographyRef.current
    );
  }

  function handlePointerDown(
    event:
      ReactPointerEvent<HTMLCanvasElement>
  ) {
    const point =
      pointerToCanvasPoint(
        event
      );

    if (!point) {
      return;
    }

    if (
      calibrationEditing &&
      calibrationPoints
    ) {
      const canvas =
        overlayCanvasRef.current;

      if (!canvas) {
        return;
      }

      const hitRadius =
        Math.max(
          30,
          canvas.width /
            35
        );

      let closest:
        | CalibrationCorner
        | null = null;

      let closestDistance =
        Infinity;

      for (
        const corner of
        CALIBRATION_ORDER
      ) {
        const cornerPoint =
          calibrationPoints[
            corner
          ];

        const d =
          distance(
            point,
            cornerPoint
          );

        if (
          d <
            hitRadius &&
          d <
            closestDistance
        ) {
          closest =
            corner;

          closestDistance =
            d;
        }
      }

      if (closest) {
        activeHandleRef.current =
          closest;

        event.currentTarget.setPointerCapture(
          event.pointerId
        );

        return;
      }
    }

    if (
      calibrated &&
      clearFieldVisible &&
      !calibrationEditing
    ) {
      const normalized =
        cameraPointToNormalized(
          point
        );

      if (
        normalized &&
        pointInsideClearField(
          normalized,
          clearFieldRef.current
        )
      ) {
        clearFieldDraggingRef.current =
          true;

        clearFieldDragOffsetRef.current =
          {
            x:
              normalized.x -
              clearFieldRef.current.x,

            y:
              normalized.y -
              clearFieldRef.current.y,
          };

        event.currentTarget.setPointerCapture(
          event.pointerId
        );
      }
    }
  }

  function handlePointerMove(
    event:
      ReactPointerEvent<HTMLCanvasElement>
  ) {
    const point =
      pointerToCanvasPoint(
        event
      );

    if (!point) {
      return;
    }

    const corner =
      activeHandleRef.current;

    if (
      corner &&
      calibrationEditing &&
      calibrationPoints
    ) {
      const canvas =
        overlayCanvasRef.current;

      if (!canvas) {
        return;
      }

      const nextPoint = {
        x:
          clamp(
            point.x,
            0,
            canvas.width
          ),

        y:
          clamp(
            point.y,
            0,
            canvas.height
          ),
      };

      setCalibrationPoints(
        (current) => {
          if (!current) {
            return current;
          }

          const next = {
            ...current,
            [corner]: nextPoint,
          };

          // LIVE CALIBRATION: update both transforms immediately while dragging.
          // The projector artwork stays untouched; only the camera-side mapping
          // preview moves so you can visually align preview and real projection.
          const liveHomography = calculateHomography(next);

          if (liveHomography) {
            const liveInverse = invertHomography(liveHomography);

            if (liveInverse) {
              homographyRef.current = liveHomography;
              inverseHomographyRef.current = liveInverse;
            }
          }

          return next;
        }
      );

      return;
    }

    if (
      clearFieldDraggingRef.current
    ) {
      const normalized =
        cameraPointToNormalized(
          point
        );

      if (!normalized) {
        return;
      }

      const current =
        clearFieldRef.current;

      const offset =
        clearFieldDragOffsetRef.current;

      const next: ClearField = {
        ...current,

        x:
          clamp(
            normalized.x -
              offset.x,
            0,
            1 -
              current.width
          ),

        y:
          clamp(
            normalized.y -
              offset.y,
            0,
            1 -
              current.height
          ),
      };

      clearFieldRef.current =
        next;

      setClearField(next);

      sendClearField(
        next,
        true,
        0
      );
    }
  }

  function handlePointerUp(
    event:
      ReactPointerEvent<HTMLCanvasElement>
  ) {
    activeHandleRef.current =
      null;

    clearFieldDraggingRef.current =
      false;

    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // already released
    }
  }

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.target instanceof
          HTMLInputElement ||
        event.target instanceof
          HTMLTextAreaElement
      ) {
        return;
      }

      if (
        event.key.toLowerCase() ===
        "f"
      ) {
        event.preventDefault();

        void fullscreenProjector();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [fullscreenProjector]);

  const pageBackground =
    darkMode
      ? "#000000"
      : GREEN;

  const pageForeground =
    darkMode
      ? GREEN
      : "#000000";

  return (
    <main
      className="min-h-screen"
      style={{
        background:
          pageBackground,

        color:
          pageForeground,

        ["--hood-bg" as string]:
          pageBackground,

        ["--hood-fg" as string]:
          pageForeground,
      }}
    >
      <canvas
        ref={
          processingCanvasRef
        }
        className="hidden"
      />

      <section className="mx-auto max-w-[1500px] px-5 py-6 md:px-8">
        <header className="relative flex flex-col justify-between gap-6 border-b-2 border-[var(--hood-fg)] pb-5 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em]">
              OnChainHoodies /
              Installation 01
            </p>

            <h1 className="mt-2 text-5xl leading-none tracking-[-0.06em] md:text-7xl">
              HOODWALL
            </h1>

            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em]">
              Light graffiti /
              V1
            </p>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
            <button
              type="button"
              onClick={() =>
                setDarkMode(
                  (current) =>
                    !current
                )
              }
              className="hoodwall-mode-button"
            >
              {darkMode
                ? "☀ Light"
                : "◐ Dark"}
            </button>

            <div className="grid grid-cols-2 border-l border-t border-[var(--hood-fg)] font-mono text-[9px] uppercase tracking-[0.12em]">
              <StatusCell
                label="Camera"
                active={
                  cameraActive
                }
              />

              <StatusCell
                label="Projector"
                active={
                  projectorConnected
                }
              />

              <StatusCell
                label="Calibration"
                active={
                  calibrated
                }
              />

              <StatusCell
                label="Tracking"
                active={
                  trackingEnabled &&
                  calibrated
                }
              />
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0">
            <div className="relative aspect-video overflow-hidden border-2 border-[var(--hood-fg)] bg-black">
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-fill"
              />

              <canvas
                ref={
                  overlayCanvasRef
                }
                onPointerDown={
                  handlePointerDown
                }
                onPointerMove={
                  handlePointerMove
                }
                onPointerUp={
                  handlePointerUp
                }
                onPointerCancel={
                  handlePointerUp
                }
                className={`absolute inset-0 h-full w-full touch-none ${
                  calibrationEditing ||
                  (
                    calibrated &&
                    clearFieldVisible
                  )
                    ? "cursor-crosshair"
                    : "pointer-events-none"
                }`}
              />

              {!cameraActive && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ccff00]">
                    Camera offline
                  </p>
                </div>
              )}

              {calibrationEditing && (
                <div className="pointer-events-none absolute left-3 top-3 border border-white bg-black px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white">
                  Drag TL / TR /
                  BR / BL
                </div>
              )}
            </div>

            <div className="grid border-x-2 border-b-2 border-[var(--hood-fg)] sm:grid-cols-4 xl:grid-cols-8">
              <Metric
                label="Detected"
                value={
                  candidate
                    ? "YES"
                    : "NO"
                }
              />

              <Metric
                label="Brightness"
                value={String(
                  detectedBrightness
                )}
              />

              <Metric
                label="Threshold"
                value={String(
                  trackingBrightness
                )}
              />

              <Metric
                label="Pixels"
                value={`${pixelSize}px`}
              />

              <Metric
                label="Speed"
                value={
                  currentSpeed.toFixed(
                    2
                  )
                }
              />

              <Metric
                label="Wetness"
                value={
                  currentWetness.toFixed(
                    2
                  )
                }
              />

              <Metric
                label="Drip"
                value={
                  dripLength > 0
                    ? `${dripLength}px`
                    : "—"
                }
              />

              <Metric
                label="Jump"
                value={
                  rejectedJump
                    ? "REJECT"
                    : "OK"
                }
              />
            </div>
          </section>

          <aside className="space-y-3">
            <Panel title="01 / Camera">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void startCamera()
                  }
                  className="hoodwall-button"
                >
                  Start
                </button>

                <button
                  type="button"
                  onClick={
                    stopCamera
                  }
                  className="hoodwall-button"
                >
                  Stop
                </button>
              </div>
            </Panel>

            <Panel title="02 / Projector">
              <button
                type="button"
                onClick={
                  openProjector
                }
                className="hoodwall-button w-full"
              >
                Open projector
              </button>

              <button
                type="button"
                onClick={() =>
                  void fullscreenProjector()
                }
                className={`hoodwall-button mt-2 w-full ${
                  projectorFullscreen
                    ? "hoodwall-button-active"
                    : ""
                }`}
              >
                {projectorFullscreen
                  ? "Projector fullscreen"
                  : "Go to fullscreen"}
              </button>

              {projectorConnected && (
                <div className="mt-3 space-y-1 font-mono text-[8px] uppercase tracking-[0.1em] opacity-60">
                  <div className="flex justify-between">
                    <span>Resolution</span>
                    <span>
                      {projectorSize.width}×{projectorSize.height}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Mode</span>
                    <span>
                      {projectorFullscreen
                        ? "FULLSCREEN"
                        : "WINDOWED"}
                    </span>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="03 / Tracking brightness">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]">
                <span>
                  Threshold
                </span>

                <span>
                  {
                    trackingBrightness
                  }
                </span>
              </div>

              <input
                type="range"
                min={80}
                max={255}
                step={1}
                value={
                  trackingBrightness
                }
                onChange={(
                  event
                ) =>
                  setTrackingBrightness(
                    Number(
                      event
                        .target
                        .value
                    )
                  )
                }
                className="hoodwall-slider mt-4"
              />

              <div className="mt-3 flex justify-between font-mono text-[8px] uppercase tracking-[0.1em] opacity-60">
                <span>
                  Wide
                </span>

                <span>
                  Precise
                </span>
              </div>
            </Panel>

            <Panel title="04 / Pixel size">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em]">
                <span>
                  Brush
                </span>

                <span>
                  {pixelSize}px
                </span>
              </div>

              <input
                type="range"
                min={
                  MIN_PIXEL_SIZE
                }
                max={
                  MAX_PIXEL_SIZE
                }
                step={1}
                value={
                  pixelSize
                }
                onChange={(
                  event
                ) =>
                  handlePixelSizeChange(
                    Number(
                      event
                        .target
                        .value
                    )
                  )
                }
                className="hoodwall-slider mt-4"
              />

              <div className="mt-3 grid grid-cols-7 gap-1">
                {PIXEL_PRESETS.map(
                  (size) => (
                    <button
                      key={
                        size
                      }
                      type="button"
                      onClick={() =>
                        handlePixelSizeChange(
                          size
                        )
                      }
                      className={`hoodwall-preset ${
                        pixelSize ===
                        size
                          ? "hoodwall-preset-active"
                          : ""
                      }`}
                    >
                      {size}
                    </button>
                  )
                )}
              </div>
            </Panel>

            <Panel title="05 / Wet ink">
              <button
                type="button"
                onClick={
                  toggleDrips
                }
                className={`hoodwall-button w-full ${
                  dripsEnabled
                    ? "hoodwall-button-active"
                    : ""
                }`}
              >
                Drips{" "}
                {dripsEnabled
                  ? "ON"
                  : "OFF"}
              </button>

              <div className="mt-3 space-y-2 font-mono text-[8px] uppercase tracking-[0.1em] opacity-60">
                <div className="flex justify-between">
                  <span>
                    Speed
                  </span>

                  <span>
                    {
                      currentSpeed.toFixed(
                        3
                      )
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Wetness
                  </span>

                  <span>
                    {
                      currentWetness.toFixed(
                        2
                      )
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Drip width
                  </span>

                  <span>
                    2 drip px / 8 output px
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>
                    Length
                  </span>

                  <span>
                    {dripLength}px
                  </span>
                </div>
              </div>
            </Panel>

            <Panel title="06 / Calibration">
              {!calibrationEditing ? (
                <button
                  type="button"
                  onClick={
                    showCalibration
                  }
                  className="hoodwall-button w-full"
                >
                  {calibrated
                    ? "Edit calibration"
                    : "Show calibration"}
                </button>
              ) : (
                <>
                  <div className="hoodwall-inverse p-3">
                    <p className="font-mono text-[8px] uppercase leading-relaxed tracking-[0.11em]">
                      Live alignment.
                      Drawing stays on.
                      Drag TL / TR /
                      BR / BL until
                      preview matches
                      projection.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      applyCalibration
                    }
                    className="hoodwall-button hoodwall-button-active mt-2 w-full"
                  >
                    Apply
                    calibration
                  </button>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={
                        resetCalibration
                      }
                      className="hoodwall-button"
                    >
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={
                        cancelCalibration
                      }
                      className="hoodwall-button"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </Panel>

            <Panel title="07 / Clear field">
              <button
                type="button"
                onClick={
                  toggleClearField
                }
                className={`hoodwall-button w-full ${
                  clearFieldVisible
                    ? "hoodwall-button-active"
                    : ""
                }`}
              >
                Clear field{" "}
                {clearFieldVisible
                  ? "VISIBLE"
                  : "HIDDEN"}
              </button>

              <p className="mt-3 font-mono text-[8px] uppercase leading-relaxed tracking-[0.1em] opacity-60">
                Drag clear field
                in camera view.
                Hold laser inside
                for 650ms.
              </p>

              {clearProgress > 0 && (
                <div className="mt-3 h-2 border border-[var(--hood-fg)]">
                  <div
                    className="h-full bg-[var(--hood-fg)]"
                    style={{
                      width:
                        `${clearProgress * 100}%`,
                    }}
                  />
                </div>
              )}
            </Panel>

            <Panel title="08 / Wall">
              <button
                type="button"
                onClick={
                  toggleTracking
                }
                className={`hoodwall-button w-full ${
                  trackingEnabled
                    ? "hoodwall-button-active"
                    : ""
                }`}
              >
                Tracking{" "}
                {trackingEnabled
                  ? "ON"
                  : "OFF"}
              </button>

              <button
                type="button"
                onClick={
                  clearWall
                }
                className="hoodwall-button mt-2 w-full"
              >
                Clear now
              </button>
            </Panel>

            {cameraError && (
              <div className="hoodwall-inverse p-3 font-mono text-[9px] leading-relaxed">
                {cameraError}
              </div>
            )}
          </aside>
        </div>
      </section>

      <style jsx global>{`
        .hoodwall-button {
          border: 1px solid var(--hood-fg);
          background: var(--hood-bg);
          color: var(--hood-fg);
          padding: 12px 14px;
          font-family: monospace;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          transition:
            background 100ms linear,
            color 100ms linear;
        }

        .hoodwall-button:hover,
        .hoodwall-button-active {
          background: var(--hood-fg);
          color: var(--hood-bg);
        }

        .hoodwall-mode-button {
          border: 1px solid var(--hood-fg);
          background: var(--hood-bg);
          color: var(--hood-fg);
          padding: 9px 12px;
          font-family: monospace;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
        }

        .hoodwall-mode-button:hover {
          background: var(--hood-fg);
          color: var(--hood-bg);
        }

        .hoodwall-preset {
          min-width: 0;
          border: 1px solid var(--hood-fg);
          padding: 6px 1px;
          font-family: monospace;
          font-size: 7px;
        }

        .hoodwall-preset-active {
          background: var(--hood-fg);
          color: var(--hood-bg);
        }

        .hoodwall-inverse {
          border: 1px solid var(--hood-fg);
          background: var(--hood-fg);
          color: var(--hood-bg);
        }

        .hoodwall-slider {
          width: 100%;
          height: 18px;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }

        .hoodwall-slider::-webkit-slider-runnable-track {
          height: 4px;
          background: var(--hood-fg);
        }

        .hoodwall-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 24px;
          margin-top: -10px;
          border: 0;
          border-radius: 0;
          background: var(--hood-fg);
        }

        .hoodwall-slider::-moz-range-track {
          height: 4px;
          background: var(--hood-fg);
        }

        .hoodwall-slider::-moz-range-thumb {
          width: 16px;
          height: 24px;
          border: 0;
          border-radius: 0;
          background: var(--hood-fg);
        }
      `}</style>
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[var(--hood-fg)] p-3">
      <p className="mb-3 font-mono text-[8px] uppercase tracking-[0.16em] opacity-60">
        {title}
      </p>

      {children}
    </section>
  );
}

function StatusCell({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex min-w-[130px] items-center justify-between gap-4 border-b border-r border-[var(--hood-fg)] px-3 py-2">
      <span>
        {label}
      </span>

      <span>
        {active
          ? "●"
          : "○"}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-[var(--hood-fg)] p-3 font-mono text-[8px] uppercase tracking-[0.12em] xl:border-b-0 xl:border-r xl:last:border-r-0">
      <p className="opacity-50">
        {label}
      </p>

      <p className="mt-1 text-[10px]">
        {value}
      </p>
    </div>
  );
}