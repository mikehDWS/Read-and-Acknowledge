"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/statement";
import { acknowledge, type AcknowledgeState } from "./actions";

const PAD_HEIGHT = 180;
const TYPED_FONT = 'italic 42px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';

export default function SignForm({ token, signerName }: { token: string; signerName: string }) {
  const [state, action, pending] = useActionState<AcknowledgeState, FormData>(acknowledge, {});
  const [mode, setMode] = useState<"drawn" | "typed">("drawn");
  const [hasInk, setHasInk] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [dataUrl, setDataUrl] = useState("");
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
    if (mode !== "drawn") return;
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
    setDataUrl(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    resetCanvas();
    setHasInk(false);
    setDataUrl("");
  }

  // A typed signature is drawn into the same box, so every record holds an image.
  function renderTyped(name: string) {
    setTypedName(name);
    resetCanvas();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !name.trim()) {
      setDataUrl("");
      return;
    }
    ctx.font = TYPED_FONT;
    ctx.textBaseline = "middle";
    ctx.fillText(name.trim(), 16, PAD_HEIGHT / 2, canvas.clientWidth - 32);
    setDataUrl(canvas.toDataURL("image/png"));
  }

  function switchMode(next: "drawn" | "typed") {
    setMode(next);
    setHasInk(false);
    setTypedName("");
    setDataUrl("");
  }

  const ready = mode === "drawn" ? hasInk && !!dataUrl : !!typedName.trim() && !!dataUrl;

  return (
    <form action={action}>
      {state.error && (
        <p className="notice bad" role="alert">
          {state.error}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signature" value={dataUrl} />
      <input type="hidden" name="signature_method" value={mode} />
      <input type="hidden" name="typed_name" value={mode === "typed" ? typedName : ""} />

      <p className="statement">{ACKNOWLEDGEMENT_STATEMENT}</p>

      {mode === "typed" && (
        <>
          <label htmlFor="typed-name">
            Type your full name <span className="hint">It appears below as your signature.</span>
          </label>
          <input
            id="typed-name"
            type="text"
            autoComplete="name"
            placeholder={signerName}
            value={typedName}
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
            <button type="button" className="secondary" onClick={clear} disabled={!hasInk || pending}>
              Clear
            </button>
            <button type="button" className="link-button" onClick={() => switchMode("typed")}>
              Can&apos;t draw? Type your name instead
            </button>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => switchMode("drawn")}>
            Draw my signature instead
          </button>
        )}
      </div>
      <p id="signature-help" className="hint">
        {mode === "drawn"
          ? "Use your finger, a stylus or your mouse."
          : "Typing your name counts as your signature, and the record shows it was typed."}
      </p>

      <div className="actions">
        <button type="submit" disabled={!ready || pending} aria-describedby="confirm-hint">
          {pending ? "Confirming…" : "Confirm"}
        </button>
      </div>
      <p id="confirm-hint" className="hint">
        Your signature, name, the date and time are recorded when you confirm. You can&apos;t undo this yourself.
      </p>
    </form>
  );
}
