"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SignatureValue = { dataUrl: string; method: "drawn" | "typed"; typedName: string };

const PAD_HEIGHT = 180;
const TYPED_FONT = 'italic 42px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';

/**
 * A signature box: draw with a finger, stylus or mouse, or type a name instead (drawn into the box
 * so every record holds an image). Reports the current signature, or an empty dataUrl when blank.
 */
export default function SignaturePad({
  onChange,
  namePlaceholder,
  disabled = false,
}: {
  onChange: (value: SignatureValue) => void;
  namePlaceholder?: string;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"drawn" | "typed">("drawn");
  const [hasInk, setHasInk] = useState(false);
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Size the canvas to its box at the device's pixel density so lines stay crisp.
  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.clientWidth;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(PAD_HEIGHT * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, PAD_HEIGHT);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#111827";
  }, []);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas, mode]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "drawn" || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const next = point(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    last.current = next;
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setHasInk(true);
    onChange({ dataUrl: e.currentTarget.toDataURL("image/png"), method: "drawn", typedName: "" });
  }

  function clear() {
    resetCanvas();
    setHasInk(false);
    onChange({ dataUrl: "", method: "drawn", typedName: "" });
  }

  function renderTyped(name: string) {
    setTypedName(name);
    resetCanvas();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !name.trim()) {
      onChange({ dataUrl: "", method: "typed", typedName: name });
      return;
    }
    ctx.font = TYPED_FONT;
    ctx.textBaseline = "middle";
    ctx.fillText(name.trim(), 16, PAD_HEIGHT / 2, canvas.clientWidth - 32);
    onChange({ dataUrl: canvas.toDataURL("image/png"), method: "typed", typedName: name });
  }

  function switchMode(next: "drawn" | "typed") {
    setMode(next);
    setHasInk(false);
    setTypedName("");
    onChange({ dataUrl: "", method: next, typedName: "" });
  }

  return (
    <div>
      {mode === "typed" && (
        <>
          <label htmlFor="typed-name">
            Type your full name <span className="hint">It appears below as your signature.</span>
          </label>
          <input
            id="typed-name"
            type="text"
            autoComplete="off"
            placeholder={namePlaceholder}
            value={typedName}
            disabled={disabled}
            onChange={(e) => renderTyped(e.target.value)}
          />
        </>
      )}
      <div className="signature-label" id="signature-label">
        {mode === "drawn" ? "Sign in the box" : "Your signature"}
      </div>
      <canvas
        ref={canvasRef}
        className={`signature-pad${mode === "typed" ? " typed" : ""}`}
        style={{ height: PAD_HEIGHT }}
        role="img"
        aria-labelledby="signature-label"
        aria-describedby="signature-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="actions" style={{ marginTop: 8 }}>
        {mode === "drawn" ? (
          <>
            <button type="button" className="secondary" onClick={clear} disabled={!hasInk || disabled}>
              Clear
            </button>
            <button type="button" className="link-button" onClick={() => switchMode("typed")} disabled={disabled}>
              Can&apos;t draw? Type your name instead
            </button>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => switchMode("drawn")} disabled={disabled}>
            Draw my signature instead
          </button>
        )}
      </div>
      <p id="signature-help" className="hint">
        {mode === "drawn"
          ? "Use your finger, a stylus or your mouse."
          : "Typing your name counts as your signature, and the record shows it was typed."}
      </p>
    </div>
  );
}
