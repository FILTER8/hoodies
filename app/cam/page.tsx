"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const BLACK = [0x00, 0x00, 0x00];
const GREEN = [0xcc, 0xff, 0x00];

const WIDTH = 720;
const HEIGHT = 720;

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type FacingMode = "environment" | "user";

export default function HoodieCam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const gifFramesRef = useRef<ImageData[]>([]);
  const gifTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gifStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exposureRef = useRef(1);
  const pixelSizeRef = useRef(6);
  const ditherStrengthRef = useRef(1);
  const facingModeRef = useRef<FacingMode>("environment");
  const swappedRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingGif, setRecordingGif] = useState(false);
  const [exposure, setExposure] = useState(1);
  const [pixelSize, setPixelSize] = useState(6);
  const [ditherStrength, setDitherStrength] = useState(1);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [swapped, setSwapped] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingFilename, setPendingFilename] = useState("");

  function updateExposure(value: number) {
    exposureRef.current = value;
    setExposure(value);
  }

  function updatePixelSize(value: number) {
    pixelSizeRef.current = value;
    setPixelSize(value);
  }

  function updateDitherStrength(value: number) {
    ditherStrengthRef.current = value;
    setDitherStrength(value);
  }

  function toggleSwapColors() {
    swappedRef.current = !swappedRef.current;
    setSwapped(swappedRef.current);
  }

  function drawCover(
    source: HTMLVideoElement,
    ctx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number
  ) {
    const videoW = source.videoWidth || targetW;
    const videoH = source.videoHeight || targetH;
    const videoRatio = videoW / videoH;
    const targetRatio = targetW / targetH;

    let drawW = targetW;
    let drawH = targetH;
    let x = 0;
    let y = 0;

    if (videoRatio > targetRatio) {
      drawH = targetH;
      drawW = drawH * videoRatio;
      x = (targetW - drawW) / 2;
    } else {
      drawW = targetW;
      drawH = drawW / videoRatio;
      y = (targetH - drawH) / 2;
    }

    ctx.drawImage(source, x, y, drawW, drawH);
  }

  function drawFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const currentPixelSize = pixelSizeRef.current;
    const smallW = Math.floor(WIDTH / currentPixelSize);
    const smallH = Math.floor(HEIGHT / currentPixelSize);

    const temp = document.createElement("canvas");
    temp.width = smallW;
    temp.height = smallH;

    const tctx = temp.getContext("2d", { willReadFrequently: true });
    if (!tctx) return;

    drawCover(video, tctx, smallW, smallH);

    const image = tctx.getImageData(0, 0, smallW, smallH);
    const data = image.data;

    const dark = swappedRef.current ? GREEN : BLACK;
    const light = swappedRef.current ? BLACK : GREEN;

    for (let y = 0; y < smallH; y++) {
      for (let x = 0; x < smallW; x++) {
        const i = (y * smallW + x) * 4;

        let gray =
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        gray *= exposureRef.current;

        let threshold = ((BAYER_4[y % 4][x % 4] + 0.5) / 16) * 255;
        threshold = 128 + (threshold - 128) * ditherStrengthRef.current;

        const color = gray > threshold ? light : dark;

        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
    }

    tctx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(temp, 0, 0, WIDTH, HEIGHT);

    animationRef.current = requestAnimationFrame(drawFrame);
  }

  function stopCameraStream() {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  }

  async function startCamera(mode: FacingMode = facingModeRef.current) {
    try {
      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await video.play();

      facingModeRef.current = mode;
      setFacingMode(mode);
      setCameraReady(true);

      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      drawFrame();
    } catch (error) {
      console.error(error);
      alert("Camera permission is needed.");
    }
  }

  async function switchCamera() {
    const nextMode =
      facingModeRef.current === "environment" ? "user" : "environment";

    await startCamera(nextMode);
  }

  function prepareSave(blob: Blob, filename: string) {
    setPendingBlob(blob);
    setPendingFilename(filename);
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function savePendingBlob() {
    if (!pendingBlob) return;

    const blob = pendingBlob;
    const filename = pendingFilename;

    setPendingBlob(null);
    setPendingFilename("");

    try {
      const file = new File([blob], filename, {
        type: blob.type || "application/octet-stream",
      });

      const shareData: ShareData = {
        files: [file],
        title: "Hoodie Cam",
      };

      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        downloadBlob(blob, filename);
      }
    } catch {
      downloadBlob(blob, filename);
    }
  }

  function cancelPendingSave() {
    setPendingBlob(null);
    setPendingFilename("");
  }

  function takePhoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (blob) prepareSave(blob, `hoodie-cam-${Date.now()}.png`);
      },
      "image/png",
      1
    );
  }

  function getBestMimeType() {
    if (typeof MediaRecorder === "undefined") return "";

    const types = [
      "video/mp4;codecs=h264",
      "video/mp4",
      "video/webm;codecs=vp8",
      "video/webm",
    ];

    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function startRecording() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (typeof MediaRecorder === "undefined") {
      alert("Video recording is not supported in this browser.");
      return;
    }

    if (recorderRef.current?.state === "recording") return;

    chunksRef.current = [];
    setPendingBlob(null);
    setPendingFilename("");

    const stream = canvas.captureStream(30);
    const mimeType = getBestMimeType();

    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 10_000_000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/mp4";
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });

      prepareSave(blob, `hoodie-cam-${Date.now()}.${ext}`);
    };

    recorderRef.current = recorder;
    recorder.start();

    setRecording(true);
    maxRecordTimerRef.current = setTimeout(stopRecording, 30_000);
  }

  function stopRecording() {
    if (maxRecordTimerRef.current) {
      clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }

    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    setRecording(false);
  }

  function toggleVideo() {
    if (recording) stopRecording();
    else startRecording();
  }

  function startGif() {
    const canvas = canvasRef.current;
    if (!canvas || recordingGif) return;

    gifFramesRef.current = [];
    setPendingBlob(null);
    setPendingFilename("");
    setRecordingGif(true);

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = 480;
    captureCanvas.height = 480;

    const captureCtx = captureCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!captureCtx) {
      setRecordingGif(false);
      return;
    }

    gifTimerRef.current = setInterval(() => {
      captureCtx.imageSmoothingEnabled = false;
      captureCtx.drawImage(canvas, 0, 0, 480, 480);

      const frame = captureCtx.getImageData(0, 0, 480, 480);
      gifFramesRef.current.push(frame);
    }, 120);

    gifStopTimerRef.current = setTimeout(stopGif, 6000);
  }

  function stopGif() {
    if (gifTimerRef.current) {
      clearInterval(gifTimerRef.current);
      gifTimerRef.current = null;
    }

    if (gifStopTimerRef.current) {
      clearTimeout(gifStopTimerRef.current);
      gifStopTimerRef.current = null;
    }

    setRecordingGif(false);

    const frames = gifFramesRef.current;
    if (!frames.length) return;

    const gif = new GIFEncoder();

    for (const frame of frames) {
      const palette = quantize(frame.data, 256);
      const index = applyPalette(frame.data, palette);

      gif.writeFrame(index, frame.width, frame.height, {
        palette,
        delay: 120,
      });
    }

    gif.finish();

    const gifBytes = gif.bytes();
    const gifBuffer = gifBytes.buffer.slice(
      gifBytes.byteOffset,
      gifBytes.byteOffset + gifBytes.byteLength
    ) as ArrayBuffer;

    const blob = new Blob([gifBuffer], {
      type: "image/gif",
    });

    prepareSave(blob, `hoodie-cam-${Date.now()}.gif`);
    gifFramesRef.current = [];
  }

  function toggleGif() {
    if (recordingGif) stopGif();
    else startGif();
  }

  function stopTouch(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
  }

  useEffect(() => {
    const video = videoRef.current;

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (gifTimerRef.current) clearInterval(gifTimerRef.current);
      if (gifStopTimerRef.current) clearTimeout(gifStopTimerRef.current);
      if (maxRecordTimerRef.current) clearTimeout(maxRecordTimerRef.current);

      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
  <main
    className="fixed inset-0 overflow-hidden bg-[#ccff00] text-black select-none"
    style={{
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    }}
  >
    <style jsx global>{`
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        overscroll-behavior: none;
        background: #ccff00;
        touch-action: none;
      }

      body {
        position: fixed;
        inset: 0;
      }

      * {
        box-sizing: border-box;
      }

      .pixel-slider {
        accent-color: #000000;
        touch-action: pan-x;
      }

      .pixel-button {
        background: #ccff00;
        border: 4px solid #000000;
        box-shadow: 5px 5px 0 #000000;
        color: #000000;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 900;
      }

      .pixel-button:active,
      .pixel-button.active {
        background: #000000;
        color: #ccff00;
        box-shadow: none;
        transform: translate(5px, 5px);
      }

      .pixel-label {
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 10px;
        font-weight: 900;
      }
    `}</style>

    <video ref={videoRef} className="hidden" playsInline muted autoPlay />

    <div className="flex h-full w-full flex-col items-center px-4 py-4">
      <header className="w-full max-w-[560px]">
        <div className="flex items-center justify-between">
          <div className="text-sm tracking-[0.28em]">HOODIE CAM</div>

          <div className="text-xs tracking-[0.18em]">
            {cameraReady ? "READY" : "OFF"}
          </div>
        </div>

        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] opacity-70">
          What's up in your hood?
        </p>
      </header>

      <section className="mt-6 w-full max-w-[560px]">
        <div className="mb-3 grid grid-cols-3 gap-3">
          <ControlSlider
            label="Light"
            value={exposure}
            min={0.45}
            max={2}
            step={0.01}
            onChange={updateExposure}
          />

          <ControlSlider
            label="Dither"
            value={ditherStrength}
            min={0.35}
            max={2}
            step={0.01}
            onChange={updateDitherStrength}
          />

          <ControlSlider
            label="Pixel"
            value={pixelSize}
            min={2}
            max={20}
            step={1}
            onChange={updatePixelSize}
          />
        </div>

        <div className="relative aspect-square w-full border-[6px] border-black bg-black p-2 shadow-[10px_10px_0_#000]">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="image-render-pixel h-full w-full bg-[#ccff00]"
          />

          {!cameraReady && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                startCamera();
              }}
              className="pixel-button absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 px-6 py-4 text-sm"
            >
              Start Cam
            </button>
          )}

          {(recording || recordingGif) && (
            <div className="absolute right-4 top-4 h-5 w-5 animate-pulse bg-[#ccff00]" />
          )}
        </div>
      </section>

      <section
        onPointerDown={stopTouch}
        onPointerUp={stopTouch}
        className="mt-6 grid w-full max-w-[560px] grid-cols-3 gap-3"
      >
        <button
          onClick={toggleGif}
          className={`pixel-button px-3 py-4 text-xs ${
            recordingGif ? "active" : ""
          }`}
        >
          {recordingGif ? "Stop GIF" : "GIF"}
        </button>

        <button
          onClick={takePhoto}
          className="pixel-button px-3 py-4 text-xs"
        >
          Image
        </button>

        <button
          onClick={toggleVideo}
          className={`pixel-button px-3 py-4 text-xs ${
            recording ? "active" : ""
          }`}
        >
          {recording ? "Stop Vid" : "Vid"}
        </button>

        <button
          onClick={switchCamera}
          className="pixel-button px-3 py-4 text-xs"
        >
          {facingMode === "environment" ? "Back" : "Front"}
        </button>

        <button
          onClick={toggleSwapColors}
          className={`pixel-button px-3 py-4 text-xs ${
            swapped ? "active" : ""
          }`}
        >
          Swap
        </button>

        <Link
          href="/"
          className="flex items-center justify-center border-4 border-black bg-black px-3 py-4 text-center text-xs uppercase tracking-[0.12em] text-[#ccff00] shadow-[5px_5px_0_#000] transition-all hover:bg-[#ccff00] hover:text-black"
        >
          Home
        </Link>
      </section>
    </div>

    {pendingBlob && (
      <div
        onPointerDown={stopTouch}
        onPointerUp={stopTouch}
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 px-6"
      >
        <div className="w-full max-w-sm border-[6px] border-[#ccff00] bg-black p-5 text-center text-[#ccff00]">
          <p className="mb-5 text-sm uppercase tracking-[0.18em]">
            File ready
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={savePendingBlob}
              className="border-4 border-[#ccff00] px-4 py-3 text-xs uppercase tracking-[0.16em]"
            >
              Save
            </button>

            <button
              onClick={cancelPendingSave}
              className="border-4 border-[#ccff00] px-4 py-3 text-xs uppercase tracking-[0.16em]"
            >
              Clear
            </button>
          </div>

          <p className="mt-4 break-all text-[10px] opacity-70">
            {pendingFilename}
          </p>
        </div>
      </div>
    )}
  </main>
);
}