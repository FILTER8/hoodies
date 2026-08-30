"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CALIBRATION_MARGIN,
  HOODWALL_CHANNEL,
  HoodWallMessage,
} from "../types";

const GREEN = "#ccff00";
const BLACK = "#000000";

const DEFAULT_PIXEL_SIZE = 14;

/*
 * This is literal projector/screen pixels.
 * It never changes with brush size.
 */
/*
 * Always TWO HoodWall drip pixels wide.
 * One drip pixel is fixed at 4 projector pixels.
 * Brush size never affects this.
 */
const DRIP_PIXEL_SIZE_PX = 4;
const DRIP_WIDTH_PIXELS = 2;
const DRIP_WIDTH_PX = DRIP_PIXEL_SIZE_PX * DRIP_WIDTH_PIXELS;

type GridCell = {
  x: number;
  y: number;
};

type ClearField = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  progress: number;
};

const DEFAULT_CLEAR_FIELD: ClearField = {
  x: 0.82,
  y: 0.84,
  width: 0.12,
  height: 0.08,
  visible: true,
  progress: 0,
};

function drawPixelLine(
  context:
    CanvasRenderingContext2D,
  from: GridCell,
  to: GridCell,
  gridSize: number
) {
  let x0 = from.x;
  let y0 = from.y;

  const x1 = to.x;
  const y1 = to.y;

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
    context.fillRect(
      x0 * gridSize,
      y0 * gridSize,
      gridSize,
      gridSize
    );

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
}

function normalizedToProjector(
  x: number,
  y: number
) {
  const width =
    window.innerWidth;

  const height =
    window.innerHeight;

  return {
    x:
      CALIBRATION_MARGIN *
        width +
      x *
        width *
        (
          1 -
          CALIBRATION_MARGIN *
            2
        ),

    y:
      CALIBRATION_MARGIN *
        height +
      y *
        height *
        (
          1 -
          CALIBRATION_MARGIN *
            2
        ),
  };
}

export default function HoodWallProjectorPage() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const channelRef =
    useRef<BroadcastChannel | null>(
      null
    );

  const previousCellRef =
    useRef<GridCell | null>(
      null
    );

  const pixelSizeRef =
    useRef(
      DEFAULT_PIXEL_SIZE
    );

  const calibrationVisibleRef =
    useRef(false);

  const clearFieldRef =
    useRef<ClearField>({
      ...DEFAULT_CLEAR_FIELD,
    });

  /*
   * Stores how long each drip has
   * already been rendered.
   */
  const dripLengthMapRef =
    useRef<Map<string, number>>(
      new Map()
    );

  const [
    calibrationVisible,
    setCalibrationVisible,
  ] = useState(false);

  const [
    isFullscreen,
    setIsFullscreen,
  ] = useState(false);

  const [
    clearField,
    setClearField,
  ] = useState<ClearField>({
    ...DEFAULT_CLEAR_FIELD,
  });

  const clearCanvas =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return;
      }

      const context =
        canvas.getContext(
          "2d"
        );

      if (!context) {
        return;
      }

      context.save();

      context.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
      );

      context.fillStyle =
        BLACK;

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      context.restore();

      previousCellRef.current =
        null;

      dripLengthMapRef.current.clear();
    }, []);

  const resizeCanvas =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return;
      }

      const dpr =
        window.devicePixelRatio ||
        1;

      const width =
        window.innerWidth;

      const height =
        window.innerHeight;

      canvas.width =
        Math.round(
          width * dpr
        );

      canvas.height =
        Math.round(
          height * dpr
        );

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      const context =
        canvas.getContext(
          "2d"
        );

      if (!context) {
        return;
      }

      context.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      context.fillStyle =
        BLACK;

      context.fillRect(
        0,
        0,
        width,
        height
      );

      previousCellRef.current =
        null;

      dripLengthMapRef.current.clear();
    }, []);

  const drawPoint =
    useCallback(
      (
        normalizedX: number,
        normalizedY: number
      ) => {
        if (
          calibrationVisibleRef.current
        ) {
          return;
        }

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return;
        }

        const context =
          canvas.getContext(
            "2d"
          );

        if (!context) {
          return;
        }

        const projectorPoint =
          normalizedToProjector(
            normalizedX,
            normalizedY
          );

        const pixelSize =
          pixelSizeRef.current;

        const cell: GridCell = {
          x:
            Math.floor(
              projectorPoint.x /
              pixelSize
            ),

          y:
            Math.floor(
              projectorPoint.y /
              pixelSize
            ),
        };

        context.fillStyle =
          GREEN;

        const previous =
          previousCellRef.current;

        if (previous) {
          drawPixelLine(
            context,
            previous,
            cell,
            pixelSize
          );
        } else {
          context.fillRect(
            cell.x *
              pixelSize,

            cell.y *
              pixelSize,

            pixelSize,
            pixelSize
          );
        }

        previousCellRef.current =
          cell;
      },
      []
    );

  /*
   * DRIP
   *
   * No pixelSizeRef here.
   * No brush-cell calculations.
   *
   * Laser position -> 2px vertical drip.
   */
  const drawDrip =
    useCallback(
      (
        normalizedX: number,
        normalizedY: number,
        length: number
      ) => {
        if (
          calibrationVisibleRef.current
        ) {
          return;
        }

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return;
        }

        const context =
          canvas.getContext(
            "2d"
          );

        if (!context) {
          return;
        }

        const projected =
          normalizedToProjector(
            normalizedX,
            normalizedY
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

        const key =
          `${startX}:${startY}`;

        const previousLength =
          dripLengthMapRef.current.get(
            key
          ) ?? 0;

        if (
          length <=
          previousLength
        ) {
          return;
        }

        context.fillStyle =
          GREEN;

        context.fillRect(
          startX,
          startY +
            previousLength,
          DRIP_WIDTH_PX,
          length -
            previousLength
        );

        dripLengthMapRef.current.set(
          key,
          length
        );
      },
      []
    );

useEffect(() => {
  function reportProjectorSize() {
    resizeCanvas();

    channelRef.current?.postMessage({
      type: "PROJECTOR_READY",
      width: window.innerWidth,
      height: window.innerHeight,
    } satisfies HoodWallMessage);

    channelRef.current?.postMessage({
      type: "PROJECTOR_STATUS",
      width: window.innerWidth,
      height: window.innerHeight,
      fullscreen: Boolean(document.fullscreenElement),
    } satisfies HoodWallMessage);
  }

  reportProjectorSize();

  window.addEventListener(
    "resize",
    reportProjectorSize
  );

  document.addEventListener(
    "fullscreenchange",
    reportProjectorSize
  );

  return () => {
    window.removeEventListener(
      "resize",
      reportProjectorSize
    );

    document.removeEventListener(
      "fullscreenchange",
      reportProjectorSize
    );
  };
}, [resizeCanvas]);

  useEffect(() => {
    if (
      typeof BroadcastChannel ===
      "undefined"
    ) {
      return;
    }

    const channel =
      new BroadcastChannel(
        HOODWALL_CHANNEL
      );

    channelRef.current =
      channel;

    const sendReady =
      () => {
        channel.postMessage({
          type:
            "PROJECTOR_READY",

          width:
            window.innerWidth,

          height:
            window.innerHeight,
        } satisfies HoodWallMessage);

        channel.postMessage({
          type:
            "PROJECTOR_STATUS",

          width:
            window.innerWidth,

          height:
            window.innerHeight,

          fullscreen:
            Boolean(document.fullscreenElement),
        } satisfies HoodWallMessage);
      };

    sendReady();

    channel.onmessage = (
      event:
        MessageEvent<HoodWallMessage>
    ) => {
      const message =
        event.data;

      switch (
        message.type
      ) {
        case "PING": {
          sendReady();
          break;
        }

        case "POINT": {
          drawPoint(
            message.x,
            message.y
          );

          break;
        }

        case "POINT_END": {
          previousCellRef.current =
            null;

          break;
        }

        case "DRIP": {
          drawDrip(
            message.x,
            message.y,
            message.length
          );

          break;
        }

        case "PIXEL_SIZE": {
          /*
           * Only the brush changes.
           * Drip width remains 2px.
           */
          pixelSizeRef.current =
            Math.max(
              1,
              message.value
            );

          previousCellRef.current =
            null;

          break;
        }

        case "CLEAR": {
          clearCanvas();
          break;
        }

        case "CLEAR_FIELD": {
          const next: ClearField = {
            x: message.x,
            y: message.y,

            width:
              message.width,

            height:
              message.height,

            visible:
              message.visible,

            progress:
              message.progress,
          };

          clearFieldRef.current =
            next;

          setClearField(next);

          break;
        }

        case "CALIBRATION_SHOW": {
          // LIVE ALIGNMENT MODE:
          // keep the existing artwork visible.
          // Calibration is edited only on the control/camera screen.
          previousCellRef.current = null;
          calibrationVisibleRef.current = false;
          setCalibrationVisible(false);
          break;
        }

        case "CALIBRATION_HIDE": {
          // IMPORTANT: applying/cancelling calibration must NEVER clear artwork.
          previousCellRef.current = null;
          calibrationVisibleRef.current = false;
          setCalibrationVisible(false);
          break;
        }
      }
    };

    return () => {
      channel.close();

      channelRef.current =
        null;
    };
  }, [
    clearCanvas,
    drawDrip,
    drawPoint,
  ]);

  const enterFullscreen =
    useCallback(async () => {
      try {
        if (document.fullscreenElement) {
          return;
        }

        await document.documentElement.requestFullscreen({
          navigationUI: "hide",
        });
      } catch (error) {
        console.error(
          "HoodWall fullscreen failed:",
          error
        );
      }
    }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreen = Boolean(document.fullscreenElement);

      setIsFullscreen(fullscreen);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resizeCanvas();

          channelRef.current?.postMessage({
            type: "PROJECTOR_STATUS",
            width: window.innerWidth,
            height: window.innerHeight,
            fullscreen,
          } satisfies HoodWallMessage);

          channelRef.current?.postMessage({
            type: "PROJECTOR_READY",
            width: window.innerWidth,
            height: window.innerHeight,
          } satisfies HoodWallMessage);
        });
      });
    };

    handleFullscreenChange();

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, [resizeCanvas]);

  useEffect(() => {
    async function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key.toLowerCase() !==
        "f"
      ) {
        return;
      }

      event.preventDefault();

      try {
        if (
          !document.fullscreenElement
        ) {
          await enterFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch {
        // ignore
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
  }, [enterFullscreen]);

  useEffect(() => {
    function handleBeforeUnload() {
      channelRef.current?.postMessage({
        type: "PROJECTOR_CLOSING",
      } satisfies HoodWallMessage);

      try {
        window.opener?.focus();
      } catch {
        // ignore
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (
        !document.fullscreenElement
      ) {
        await enterFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }

  return (
    <main
      className="relative h-screen w-screen cursor-none overflow-hidden bg-black"
      onDoubleClick={() =>
        void toggleFullscreen()
      }
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${
          calibrationVisible
            ? "invisible"
            : "visible"
        }`}
      />

      {!calibrationVisible &&
        clearField.visible && (
          <ClearFieldOverlay
            field={
              clearField
            }
          />
        )}

      {calibrationVisible && (
        <CalibrationScreen />
      )}

      {!calibrationVisible && (
        <div className="pointer-events-none fixed bottom-3 left-4 font-mono text-[7px] uppercase tracking-[0.22em] text-[#ccff00]/15">
          HoodWall /
          OnChainHoodies
        </div>
      )}

      {!isFullscreen && (
        <button
          type="button"
          onClick={() =>
            void enterFullscreen()
          }
          className="fixed inset-0 z-[9999] flex cursor-pointer items-center justify-center bg-black text-[#ccff00]"
        >
          <div className="w-[min(850px,82vw)] border-[10px] border-[#ccff00] px-12 py-20 text-center font-mono uppercase">
            <div className="text-5xl tracking-[0.16em] md:text-7xl">
              Fullscreen
            </div>

            <div className="mt-8 text-[12px] tracking-[0.24em] opacity-70">
              Click to start HoodWall
            </div>

            <div className="mt-5 text-[9px] tracking-[0.18em] opacity-40">
              Or press F
            </div>
          </div>
        </button>
      )}
    </main>
  );
}

function ClearFieldOverlay({
  field,
}: {
  field: ClearField;
}) {
  const drawableWidth =
    1 -
    CALIBRATION_MARGIN *
      2;

  const drawableHeight =
    1 -
    CALIBRATION_MARGIN *
      2;

  const left =
    (
      CALIBRATION_MARGIN +
      field.x *
        drawableWidth
    ) *
    100;

  const top =
    (
      CALIBRATION_MARGIN +
      field.y *
        drawableHeight
    ) *
    100;

  const width =
    field.width *
    drawableWidth *
    100;

  const height =
    field.height *
    drawableHeight *
    100;

  return (
    <div
      className="pointer-events-none absolute border-2 border-[#ccff00]"
      style={{
        left:
          `${left}%`,

        top:
          `${top}%`,

        width:
          `${width}%`,

        height:
          `${height}%`,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-[#ccff00]/25"
        style={{
          width:
            `${field.progress * 100}%`,
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-black px-2 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[#ccff00]">
          Clear
        </span>
      </div>
    </div>
  );
}

function CalibrationScreen() {
  return (
    <div className="absolute inset-0 bg-black">
      <div
        className="absolute border-4 border-[#ccff00]"
        style={{
          left:
            `${CALIBRATION_MARGIN * 100}%`,

          right:
            `${CALIBRATION_MARGIN * 100}%`,

          top:
            `${CALIBRATION_MARGIN * 100}%`,

          bottom:
            `${CALIBRATION_MARGIN * 100}%`,
        }}
      >
        <CalibrationCorner className="left-0 top-0 -translate-x-1/2 -translate-y-1/2" />

        <CalibrationCorner className="right-0 top-0 translate-x-1/2 -translate-y-1/2" />

        <CalibrationCorner className="bottom-0 right-0 translate-x-1/2 translate-y-1/2" />

        <CalibrationCorner className="bottom-0 left-0 -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.2em] text-[#ccff00]/60">
        HoodWall /
        Calibration
      </div>
    </div>
  );
}

function CalibrationCorner({
  className,
}: {
  className: string;
}) {
  return (
    <div
      className={`absolute h-8 w-8 bg-[#ccff00] ${className}`}
    >
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 bg-black" />
    </div>
  );
}