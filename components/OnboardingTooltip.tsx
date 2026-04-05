"use client";

import { useState, useEffect } from "react";

interface OnboardingTooltipProps {
  id: string;
  message: string;
  position?: "top" | "bottom" | "left" | "right";
  isSeen: boolean;
  onSeen: () => void;
  children: React.ReactNode;
}

export default function OnboardingTooltip({ id, message, position = "bottom", isSeen, onSeen, children }: OnboardingTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isSeen) return;
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [isSeen]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => { setVisible(false); onSeen(); }, 8000);
    return () => clearTimeout(timer);
  }, [visible, onSeen]);

  const handleDismiss = () => {
    setVisible(false);
    onSeen();
  };

  if (isSeen) return <>{children}</>;

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<string, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#1e3a5f] border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[#1e3a5f] border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#1e3a5f] border-y-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-[#1e3a5f] border-y-transparent border-l-transparent",
  };

  return (
    <div className="relative" data-tooltip-id={id}>
      {children}
      {visible && (
        <div className={`absolute z-50 ${positionClasses[position]} animate-fade-in`} style={{ width: "clamp(200px, 280px, 90vw)" }}>
          <div className="bg-[#1e3a5f] text-white rounded-xl px-4 py-3 shadow-lg relative">
            <p className="text-xs leading-relaxed">{message}</p>
            <button
              onClick={handleDismiss}
              className="mt-2 text-[10px] font-semibold text-white/70 hover:text-white underline transition-colors"
              style={{ minHeight: "auto" }}
            >
              Entendi
            </button>
            <div className={`absolute w-0 h-0 border-[6px] ${arrowClasses[position]}`} />
          </div>
        </div>
      )}
    </div>
  );
}
