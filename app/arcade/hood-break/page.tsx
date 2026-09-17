"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";

const GREEN = "#ccff00";
const BLACK = "#000000";

const W = 120;
const H = 120;

const BRICK_SCALE = 3;
const MAP_W = 20;
const MAP_H = 20;
const MAP_X = 30;
const MAP_Y = 8;

const PADDLE_W = 15;
const PADDLE_H = 1;
const PADDLE_Y = 117;

// Temporary traced 20x20 level.
// 1 = Robin brick, 0 = black / empty.
const SOURCE_ROWS = [
  "11111111111111111111",
  "11111111111111111111",
  "11111111111111111111",
  "11110000000000011111",
  "11100001111110001111",
  "11100011111111001111",
  "11100111101011100111",
  "11110111111111110111",
  "11101111100000000111",
  "11100111011110111111",
  "11110111000000111111",
  "11110111011111111111",
  "11110111000000111111",
  "11110111011110111111",
  "11110111100000011111",
  "11110011111111011111",
  "11111000011111011111",
  "11111000000000011111",
  "11111011001111111111",
  "11111011101111111111",
] as const;

type GameStatus = {
  state: string;
  lives: number;
  bricks: number;
};

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export default function HoodBreakPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftButtonRef = useRef<HTMLButtonElement | null>(null);
  const rightButtonRef = useRef<HTMLButtonElement | null>(null);
  const launchButtonRef = useRef<HTMLButtonElement | null>(null);

  const [status, setStatus] = useState<GameStatus>({
    state: "Ready",
    lives: 3,
    bricks: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const leftButton = leftButtonRef.current;
    const rightButton = rightButtonRef.current;
    const launchButton = launchButtonRef.current;

    if (!canvas || !leftButton || !rightButton || !launchButton) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const gameCanvas = canvas;
    const gameContext = context;
    const leftControl = leftButton;
    const rightControl = rightButton;
    const launchControl = launchButton;

    gameContext.imageSmoothingEnabled = false;

    let bricks: boolean[][] = [];
    let remaining = 0;
    let lives = 3;

    let paddleX = Math.floor((W - PADDLE_W) / 2);

    const ball: Ball = {
      x: paddleX + Math.floor(PADDLE_W / 2),
      y: PADDLE_Y - 2,
      vx: 0.55,
      vy: -0.72,
    };

    let running = false;
    let won = false;
    let lost = false;
    let frameId = 0;
    let lastTime = performance.now();
    let draggingCanvas = false;

    const keys = {
      left: false,
      right: false,
    };

    let audioContext: AudioContext | null = null;

    function publishStatus(state?: string) {
      setStatus((current) => ({
        state: state ?? current.state,
        lives,
        bricks: remaining,
      }));
    }

    function ensureAudio() {
      if (!audioContext) {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (AudioContextClass) {
          audioContext = new AudioContextClass();
        }
      }

      if (audioContext?.state === "suspended") {
        void audioContext.resume();
      }
    }

    function beep(
      frequency = 440,
      duration = 0.03,
      type: OscillatorType = "square",
      volume = 0.035
    ) {
      ensureAudio();
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.start(now);
      oscillator.stop(now + duration);
    }

    function resetBricks() {
      bricks = SOURCE_ROWS.map((row) =>
        row.split("").map((value) => value === "1")
      );
      remaining = bricks.flat().filter(Boolean).length;
    }

    function resetBall() {
      paddleX = Math.floor((W - PADDLE_W) / 2);
      ball.x = paddleX + Math.floor(PADDLE_W / 2);
      ball.y = PADDLE_Y - 2;
      ball.vx = 0.55;
      ball.vy = -0.72;
    }

    function restart() {
      running = false;
      won = false;
      lost = false;
      lives = 3;

      resetBricks();
      resetBall();
      publishStatus("Ready");
      draw();
    }

    function launch() {
      ensureAudio();

      if (running) return;

      if (won || (lost && lives <= 0)) {
        restart();
      }

      running = true;
      lost = false;
      publishStatus("Playing");
    }

    function brickAtScreen(x: number, y: number) {
      const localX = x - MAP_X;
      const localY = y - MAP_Y;

      if (localX < 0 || localY < 0) return null;

      const gridX = Math.floor(localX / BRICK_SCALE);
      const gridY = Math.floor(localY / BRICK_SCALE);

      if (
        gridX < 0 ||
        gridY < 0 ||
        gridX >= MAP_W ||
        gridY >= MAP_H ||
        !bricks[gridY]?.[gridX]
      ) {
        return null;
      }

      return { gridX, gridY };
    }

    function destroyBrick(gridX: number, gridY: number) {
      if (!bricks[gridY]?.[gridX]) return;

      bricks[gridY][gridX] = false;
      remaining -= 1;
      publishStatus();

      if (remaining <= 0) {
        running = false;
        won = true;
        publishStatus("Clear");
        beep(740, 0.05);

        window.setTimeout(() => {
          beep(980, 0.08);
        }, 55);
      }
    }

    function movePaddle(deltaTime: number) {
      const speed = 62;

      if (keys.left) paddleX -= speed * deltaTime;
      if (keys.right) paddleX += speed * deltaTime;

      paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));

      if (!running && !won && !lost) {
        ball.x = paddleX + Math.floor(PADDLE_W / 2);
        ball.y = PADDLE_Y - 2;
      }
    }

    function stepBall(deltaTime: number) {
      if (!running) return;

      const speed = Math.hypot(ball.vx, ball.vy);
      const distance = speed * 60 * deltaTime;
      const steps = Math.max(1, Math.ceil(distance / 0.35));
      const stepTime = deltaTime / steps;

      for (let step = 0; step < steps; step += 1) {
        const previousX = ball.x;
        const previousY = ball.y;

        let nextX = ball.x + ball.vx * 60 * stepTime;
        let nextY = ball.y + ball.vy * 60 * stepTime;

        if (nextX < 0) {
          nextX = -nextX;
          ball.vx = Math.abs(ball.vx);
          beep(180, 0.018);
        } else if (nextX >= W) {
          nextX = W - 1 - (nextX - (W - 1));
          ball.vx = -Math.abs(ball.vx);
          beep(180, 0.018);
        }

        if (nextY < 0) {
          nextY = -nextY;
          ball.vy = Math.abs(ball.vy);
          beep(210, 0.018);
        }

        const movingDown = ball.vy > 0;

        if (
          movingDown &&
          previousY < PADDLE_Y &&
          nextY >= PADDLE_Y &&
          nextX >= paddleX &&
          nextX < paddleX + PADDLE_W
        ) {
          const hitPosition = (nextX - paddleX) / PADDLE_W;
          const centered = (hitPosition - 0.5) * 2;

          ball.vx = centered * 0.95;
          ball.vy = -Math.max(0.48, 1.0 - Math.abs(centered) * 0.18);

          nextY = PADDLE_Y - 1;
          beep(120, 0.025);
        }

        const hitBrick = brickAtScreen(Math.floor(nextX), Math.floor(nextY));

        if (hitBrick) {
          destroyBrick(hitBrick.gridX, hitBrick.gridY);
          beep(520, 0.018);

          const brickLeft = MAP_X + hitBrick.gridX * BRICK_SCALE;
          const brickTop = MAP_Y + hitBrick.gridY * BRICK_SCALE;
          const brickRight = brickLeft + BRICK_SCALE;
          const brickBottom = brickTop + BRICK_SCALE;

          const cameFromLeft = previousX < brickLeft;
          const cameFromRight = previousX >= brickRight;
          const cameFromTop = previousY < brickTop;
          const cameFromBottom = previousY >= brickBottom;

          if (
            (cameFromLeft || cameFromRight) &&
            !(cameFromTop || cameFromBottom)
          ) {
            ball.vx *= -1;
          } else if (
            (cameFromTop || cameFromBottom) &&
            !(cameFromLeft || cameFromRight)
          ) {
            ball.vy *= -1;
          } else {
            const deltaX = Math.abs(nextX - previousX);
            const deltaY = Math.abs(nextY - previousY);

            if (deltaX > deltaY) ball.vx *= -1;
            else ball.vy *= -1;
          }

          nextX = previousX;
          nextY = previousY;
        }

        ball.x = nextX;
        ball.y = nextY;

        if (ball.y >= H) {
          running = false;
          lives -= 1;
          beep(80, 0.12, "square", 0.05);

          if (lives <= 0) {
            lives = 0;
            lost = true;
            publishStatus("Game over");
          } else {
            lost = false;
            resetBall();
            publishStatus(`Miss / ${lives} left`);
          }

          break;
        }

        if (won) break;
      }
    }

    function drawBricks() {
      gameContext.fillStyle = GREEN;

      for (let y = 0; y < MAP_H; y += 1) {
        for (let x = 0; x < MAP_W; x += 1) {
          if (!bricks[y]?.[x]) continue;

          gameContext.fillRect(
            MAP_X + x * BRICK_SCALE,
            MAP_Y + y * BRICK_SCALE,
            BRICK_SCALE,
            BRICK_SCALE
          );
        }
      }
    }

    function drawPaddle() {
      gameContext.fillStyle = GREEN;
      gameContext.fillRect(
        Math.round(paddleX),
        PADDLE_Y,
        PADDLE_W,
        PADDLE_H
      );
    }

    function drawBall() {
      gameContext.fillStyle = GREEN;
      gameContext.fillRect(Math.round(ball.x), Math.round(ball.y), 1, 1);
    }

    function draw() {
      gameContext.fillStyle = BLACK;
      gameContext.fillRect(0, 0, W, H);

      drawBricks();
      drawPaddle();
      drawBall();
    }

    function update(deltaTime: number) {
      movePaddle(deltaTime);
      stepBall(deltaTime);
    }

    function frame(now: number) {
      const rawDeltaTime = (now - lastTime) / 1000;
      const deltaTime = Math.min(rawDeltaTime, 1 / 30);
      lastTime = now;

      update(deltaTime);
      draw();

      frameId = requestAnimationFrame(frame);
    }

    function setKey(key: string, value: boolean) {
      const lowerKey = key.toLowerCase();

      if (key === "ArrowLeft" || lowerKey === "a") {
        keys.left = value;
      }

      if (key === "ArrowRight" || lowerKey === "d") {
        keys.right = value;
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }

      setKey(event.key, true);

      if (event.code === "Space" && !event.repeat) launch();
      if (event.key.toLowerCase() === "r" && !event.repeat) restart();
    }

    function handleKeyUp(event: KeyboardEvent) {
      setKey(event.key, false);
    }

    function movePaddleToPointer(event: PointerEvent) {
      const rect = gameCanvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * W;

      paddleX = x - PADDLE_W / 2;
      paddleX = Math.max(0, Math.min(W - PADDLE_W, paddleX));

      if (!running && !won && !lost) {
        ball.x = paddleX + Math.floor(PADDLE_W / 2);
        ball.y = PADDLE_Y - 2;
      }
    }

    function handleCanvasPointerDown(event: PointerEvent) {
      event.preventDefault();
      ensureAudio();

      draggingCanvas = true;
      gameCanvas.setPointerCapture(event.pointerId);
      movePaddleToPointer(event);
    }

    function handleCanvasPointerMove(event: PointerEvent) {
      if (!draggingCanvas) return;
      event.preventDefault();
      movePaddleToPointer(event);
    }

    function handleCanvasPointerUp(event: PointerEvent) {
      draggingCanvas = false;

      if (gameCanvas.hasPointerCapture(event.pointerId)) {
        gameCanvas.releasePointerCapture(event.pointerId);
      }
    }

    function bindHold(
      button: HTMLButtonElement,
      side: "left" | "right"
    ) {
      const down = (event: PointerEvent) => {
        event.preventDefault();
        ensureAudio();
        keys[side] = true;
        button.setPointerCapture(event.pointerId);
      };

      const up = (event: PointerEvent) => {
        event.preventDefault();
        keys[side] = false;

        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
      };

      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);

      return () => {
        button.removeEventListener("pointerdown", down);
        button.removeEventListener("pointerup", up);
        button.removeEventListener("pointercancel", up);
      };
    }

    const unbindLeft = bindHold(leftControl, "left");
    const unbindRight = bindHold(rightControl, "right");

    function handleLaunchPointerDown(event: PointerEvent) {
      event.preventDefault();
      launch();
    }

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);

    gameCanvas.addEventListener("pointerdown", handleCanvasPointerDown, {
      passive: false,
    });
    gameCanvas.addEventListener("pointermove", handleCanvasPointerMove, {
      passive: false,
    });
    gameCanvas.addEventListener("pointerup", handleCanvasPointerUp);
    gameCanvas.addEventListener("pointercancel", handleCanvasPointerUp);

    launchControl.addEventListener("pointerdown", handleLaunchPointerDown);

    restart();
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);

      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);

      gameCanvas.removeEventListener("pointerdown", handleCanvasPointerDown);
      gameCanvas.removeEventListener("pointermove", handleCanvasPointerMove);
      gameCanvas.removeEventListener("pointerup", handleCanvasPointerUp);
      gameCanvas.removeEventListener("pointercancel", handleCanvasPointerUp);

      launchControl.removeEventListener(
        "pointerdown",
        handleLaunchPointerDown
      );

      unbindLeft();
      unbindRight();

      if (audioContext) {
        void audioContext.close();
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-20 md:px-6 md:pt-24">
        <div className="flex items-end justify-between gap-5 border-b-2 border-black pb-3">
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.18em]">
              Arcade 01 / Prototype
            </p>

            <h1 className="text-[clamp(3rem,9vw,6rem)] leading-[0.78] tracking-[-0.07em]">
              HOOD
              <br />
              BREAK
            </h1>
          </div>

          <div className="pb-1 text-right text-[9px] uppercase leading-relaxed tracking-[0.17em] sm:text-[10px]">
            120×120
            <br />
            1-bit arcade V1
          </div>
        </div>

        <div className="mx-auto mt-5 w-full max-w-[600px]">
          <div className="aspect-square w-full overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              aria-label="Hood Break game"
              className="block h-full w-full select-none bg-black [image-rendering:pixelated] touch-none"
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              ref={leftButtonRef}
              type="button"
              className="min-h-12 touch-none border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00]"
              aria-label="Move paddle left"
            >
              ← Left
            </button>

            <button
              ref={rightButtonRef}
              type="button"
              className="min-h-12 touch-none border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00]"
              aria-label="Move paddle right"
            >
              Right →
            </button>

            <button
              ref={launchButtonRef}
              type="button"
              className="col-span-2 min-h-12 touch-manipulation border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00] sm:col-span-1"
            >
              Launch
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t-2 border-black pt-2 text-[8px] uppercase tracking-[0.12em] sm:text-[9px]">
            <span className="truncate">{status.state}</span>
            <span className="text-center">Lives {status.lives}</span>
            <span className="text-right">{status.bricks} bricks</span>
          </div>

          <p className="mt-3 text-[10px] leading-relaxed opacity-70">
            Desktop: A/D or arrow keys. Space launches. R restarts. Mobile:
            drag directly across the game screen to position the paddle, or hold
            the left/right buttons. Tap Launch to serve the ball.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-[600px] justify-between border-t border-black pt-3 text-[9px] uppercase tracking-[0.14em]">
          <span>Black = space / Robin = matter</span>
          <Link href="/" className="underline underline-offset-4">
            Back to Hood
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
