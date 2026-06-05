"use client";

import * as React from "react";
import { Camera, X, RotateCcw, Check, Loader2 } from "lucide-react";

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  /** Receives the captured photo as a Blob (image/jpeg). */
  onCapture: (blob: Blob) => void;
}

// A lightweight camera modal: opens the device camera via getUserMedia, lets the
// user snap a frame, preview it, and confirm. Works on mobile, tablet, and any
// PC with a webcam. The captured frame is handed back as a JPEG Blob (caller
// typically runs OCR on it).
export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<string | null>(null);
  const [snapBlob, setSnapBlob] = React.useState<Blob | null>(null);
  const [starting, setStarting] = React.useState(false);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    setSnapshot(null);
    setSnapBlob(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // rear camera on phones
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError("Camera unavailable or permission denied.");
    } finally {
      setStarting(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) start();
    return () => stop();
  }, [open, start, stop]);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setSnapBlob(blob);
          setSnapshot(URL.createObjectURL(blob));
          stop();
        }
      },
      "image/jpeg",
      0.92
    );
  }

  function confirm() {
    if (snapBlob) {
      onCapture(snapBlob);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-bg-300 bg-bg-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-bg-300 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-200">
            <Camera className="h-4 w-4" />
            Capture document
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-400 hover:bg-bg-200 hover:text-text-200"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[3/4] w-full bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-400">
              {error}
            </div>
          ) : snapshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot} alt="Captured" className="h-full w-full object-contain" />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 p-4">
          {snapshot ? (
            <>
              <button
                onClick={start}
                className="inline-flex items-center gap-2 rounded-lg border border-bg-300 px-4 py-2 text-sm font-medium text-text-300 hover:bg-bg-200"
              >
                <RotateCcw className="h-4 w-4" />
                Retake
              </button>
              <button
                onClick={confirm}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-bg-0 hover:bg-accent-hover"
              >
                <Check className="h-4 w-4" />
                Use photo
              </button>
            </>
          ) : (
            <button
              onClick={snap}
              disabled={!!error || starting}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg-0 shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              aria-label="Take photo"
            >
              <Camera className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
