"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Phone-camera barcode / QR scanner. Uses the browser's built-in BarcodeDetector (Android Chrome) and falls back to
 * the ZXing library (iPhone Safari). Calls onScan once per code, then stops.
 */
export function Scanner({ onScan, label = "Scan barcode" }: { onScan: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingStop: (() => void) | null = null;

    const finish = (code: string) => {
      if (stopped) return;
      stopped = true;
      navigator.vibrate?.(80);
      onScan(code);
      setOpen(false);
    };

    (async () => {
      try {
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"] });
          const tick = async () => {
            if (stopped) return;
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]?.rawValue) finish(codes[0].rawValue);
            else requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
            if (result) finish(result.getText());
          });
          zxingStop = () => controls.stop();
        }
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser settings." : "Couldn't start the camera on this device.");
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      zxingStop?.();
    };
  }, [open, onScan]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => { setError(""); setOpen(true); }}>
        <ScanLine className="size-4" aria-hidden /> {label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-label="Scanner">
          <video ref={videoRef} className="w-full max-w-md rounded-lg" muted playsInline />
          {error ? <p className="text-center text-sm text-white">{error}</p> : <p className="text-sm text-white/80">Point the camera at the barcode</p>}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </div>
      )}
    </>
  );
}
