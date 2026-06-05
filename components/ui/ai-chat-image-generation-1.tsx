"use client"

import * as React from "react"
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

export interface ImageGenerationProps {
  children: React.ReactNode;
  /** Drive the overlay externally. When omitted, it self-animates over `duration`. */
  state?: "starting" | "generating" | "completed";
  /** Total ms for the self-driven progress sweep (ignored when `state` is controlled). */
  duration?: number;
  className?: string;
}

export const ImageGeneration: React.FC<ImageGenerationProps> = (
  ({ children, state: controlledState, duration = 30000, className }) => {
    const [progress, setProgress] = React.useState(0);
    const [loadingState, setLoadingState] = React.useState<
      "starting" | "generating" | "completed"
    >("starting");

    // Controlled mode: mirror the parent-provided state and snap progress.
    React.useEffect(() => {
      if (!controlledState) return;
      setLoadingState(controlledState);
      if (controlledState === "completed") setProgress(100);
      else if (controlledState === "starting") setProgress(0);
    }, [controlledState]);

    React.useEffect(() => {
      // Skip the self-driven timeline when the parent controls the state.
      if (controlledState) return;

      const startingTimeout = setTimeout(() => {
        setLoadingState("generating");

        const startTime = Date.now();

        const interval = setInterval(() => {
          const elapsedTime = Date.now() - startTime;
          const progressPercentage = Math.min(
            100,
            (elapsedTime / duration) * 100
          );

          setProgress(progressPercentage);

          if (progressPercentage >= 100) {
            clearInterval(interval);
            setLoadingState("completed");
          }
        }, 16);

        return () => clearInterval(interval);
      }, 3000);

      return () => clearTimeout(startingTimeout);
    }, [duration, controlledState]);

    // While generating in controlled mode, creep the blur upward so it feels alive
    // even though we don't know the true server-side progress.
    React.useEffect(() => {
      if (!controlledState || controlledState !== "generating") return;
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // Ease toward ~90% over ~25s; the final 10% snaps on "completed".
        const pct = Math.min(90, (elapsed / 25000) * 90);
        setProgress(pct);
      }, 100);
      return () => clearInterval(interval);
    }, [controlledState]);

    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <motion.span
          className="bg-[linear-gradient(110deg,var(--color-muted-foreground),35%,var(--color-foreground),50%,var(--color-muted-foreground),75%,var(--color-muted-foreground))] bg-[length:200%_100%] bg-clip-text text-transparent text-base font-medium"
          initial={{ backgroundPosition: "200% 0" }}
          animate={{
            backgroundPosition:
              loadingState === "completed" ? "0% 0" : "-200% 0",
          }}
          transition={{
            repeat: loadingState === "completed" ? 0 : Infinity,
            duration: 3,
            ease: "linear",
          }}
        >
          {loadingState === "starting" && "Getting started."}
          {loadingState === "generating" && "Creating image. May take a moment."}
          {loadingState === "completed" && "Image created."}
        </motion.span>
        <div className="relative rounded-xl border bg-card max-w-md overflow-hidden">
            {children}
          <motion.div
            className="absolute w-full h-[125%] -top-[25%] pointer-events-none backdrop-blur-3xl"
            initial={false}
            animate={{
              clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
              opacity: loadingState === "completed" ? 0 : 1,
            }}
            style={{
              clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
              maskImage:
                progress === 0
                  ? "linear-gradient(to bottom, black -5%, black 100%)"
                  : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
              WebkitMaskImage:
                progress === 0
                  ? "linear-gradient(to bottom, black -5%, black 100%)"
                  : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
            }}
          />
        </div>
      </div>
    );
  }
);

ImageGeneration.displayName = "ImageGeneration";
