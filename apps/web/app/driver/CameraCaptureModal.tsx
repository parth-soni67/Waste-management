"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCw, Check, X, AlertCircle } from "lucide-react";

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoCaptured: (file: File, previewUrl: string) => void;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onPhotoCaptured,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Stop camera media tracks cleanly
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start real browser camera
  const startCameraStream = useCallback(async (mode: "environment" | "user") => {
    stopCameraStream();
    setIsInitializing(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.");
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsInitializing(false);
    } catch (err: unknown) {
      console.warn("Camera init error:", err);
      const errMsg = err instanceof Error ? err.message : "Unable to access device camera.";
      setCameraError(errMsg);
      setIsInitializing(false);
    }
  }, [stopCameraStream]);

  // Lifecycle when modal opens / closes
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      timer = setTimeout(() => {
        setCapturedBlob(null);
        setPreviewUrl(null);
        void startCameraStream(facingMode);
      }, 0);
    } else {
      stopCameraStream();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }

    return () => {
      clearTimeout(timer);
      stopCameraStream();
    };
  }, [isOpen, startCameraStream, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Capture frame from video to canvas
  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw the current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          stopCameraStream();
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // Retake photo
  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCapturedBlob(null);
    setPreviewUrl(null);
    void startCameraStream(facingMode);
  };

  // Use captured photo
  const handleConfirmPhoto = () => {
    if (!capturedBlob || !previewUrl) return;
    const fileName = `driver_proof_${Date.now()}.jpg`;
    const file = new File([capturedBlob], fileName, { type: "image/jpeg" });
    onPhotoCaptured(file, previewUrl);
    onClose();
  };

  // Toggle rear / front camera
  const handleToggleFacing = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    void startCameraStream(nextMode);
  };

  // Fallback file input if camera permission denied
  const handleFallbackFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      onPhotoCaptured(file, url);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-extrabold tracking-wide text-white">
              {previewUrl ? "Review Collection Proof Photo" : "Live Camera Viewfinder"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Captured Preview Area */}
        <div className="relative flex-1 bg-black min-h-[340px] flex items-center justify-center overflow-hidden">
          {/* Live Video View */}
          {!previewUrl && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover min-h-[340px] max-h-[500px]"
              />

              {/* Viewfinder HUD Overlays */}
              {!cameraError && !isInitializing && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {/* Focus Brackets */}
                  <div className="w-48 h-48 sm:w-64 sm:h-64 border-2 border-dashed border-emerald-400/60 rounded-3xl relative flex items-center justify-center">
                    <div className="w-6 h-6 border-t-2 border-l-2 border-emerald-400 absolute top-0 left-0 -mt-1 -ml-1 rounded-tl-lg" />
                    <div className="w-6 h-6 border-t-2 border-r-2 border-emerald-400 absolute top-0 right-0 -mt-1 -mr-1 rounded-tr-lg" />
                    <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 absolute bottom-0 left-0 -mb-1 -ml-1 rounded-bl-lg" />
                    <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 absolute bottom-0 right-0 -mb-1 -mr-1 rounded-br-lg" />
                    <span className="text-[10px] font-bold text-emerald-300/80 bg-slate-950/60 px-2 py-0.5 rounded-md">
                      Cleaned Site Target
                    </span>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {isInitializing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-slate-300 gap-2">
                  <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
                  <span className="text-xs font-semibold">Initializing device camera...</span>
                </div>
              )}

              {/* Camera Error / Permission Fallback */}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-900 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-700/60 flex items-center justify-center text-red-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">Camera Access Blocked / Unavailable</h4>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {cameraError}
                    </p>
                  </div>
                  <label className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors cursor-pointer inline-flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    <span>Select Photo from Device</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFallbackFileInput}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </>
          )}

          {/* Captured Image Preview */}
          {previewUrl && (
            <div className="relative w-full h-full min-h-[340px] max-h-[500px] flex items-center justify-center bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Captured proof"
                className="w-full h-full object-contain max-h-[500px]"
              />
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 text-emerald-400 text-xs font-bold border border-emerald-500/40 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                Photo Captured
              </div>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          {!previewUrl ? (
            <>
              <button
                type="button"
                onClick={handleToggleFacing}
                disabled={isInitializing || !!cameraError}
                className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-30 cursor-pointer flex items-center gap-2 text-xs font-semibold"
                title="Switch Camera"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">{facingMode === "environment" ? "Rear" : "Front"}</span>
              </button>

              <button
                type="button"
                onClick={handleCaptureFrame}
                disabled={isInitializing || !!cameraError}
                className="flex-1 py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-4 h-4 rounded-full bg-white animate-ping" />
                <Camera className="w-4 h-4" />
                <span>CAPTURE PHOTO</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retake Photo</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmPhoto}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Use This Photo</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
