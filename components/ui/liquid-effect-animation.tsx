"use client"

import { useEffect, useRef } from "react"

interface LiquidEffectAnimationProps {
  /** Image reflected by the metallic liquid plane. Swap for any large image you like. */
  imageUrl?: string
  className?: string
}

// Default reflection texture — a stable Unsplash image (abstract/colourful works best
// for the metallic liquid). Replace via the `imageUrl` prop.
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1557672172-298e090bd0f1?auto=format&fit=crop&w=1920&q=80"

export function LiquidEffectAnimation({
  imageUrl = DEFAULT_IMAGE,
  className,
}: LiquidEffectAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // The threejs-components liquid background is published as an ESM bundle on a
    // CDN. We load it as a module script at runtime and hand it our canvas.
    const script = document.createElement("script")
    script.type = "module"
    script.textContent = `
      import LiquidBackground from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.22/build/backgrounds/liquid1.min.js';

      const canvas = document.getElementById('liquid-canvas');
      if (canvas) {
        try {
          const app = LiquidBackground(canvas);
          app.loadImage(${JSON.stringify(imageUrl)});
          app.liquidPlane.material.metalness = 0.75;
          app.liquidPlane.material.roughness = 0.25;
          app.liquidPlane.uniforms.displacementScale.value = 5;
          app.setRain(false);
          window.__liquidApp = app;
        } catch (e) {
          console.warn('Liquid background failed to initialise:', e);
        }
      }
    `
    document.body.appendChild(script)

    return () => {
      try {
        if (window.__liquidApp && window.__liquidApp.dispose) {
          window.__liquidApp.dispose()
        }
      } catch {
        /* ignore */
      }
      window.__liquidApp = undefined
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [imageUrl])

  return (
    <div
      className={className ?? "fixed inset-0 -z-10 m-0 h-full w-full touch-none overflow-hidden"}
    >
      <canvas ref={canvasRef} id="liquid-canvas" className="absolute inset-0 h-full w-full" />
    </div>
  )
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __liquidApp?: any
  }
}
