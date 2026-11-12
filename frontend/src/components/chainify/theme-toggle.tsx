"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";

  const toggleTheme = () => {
    const switchTheme = () => {
      // Commit the class change inside the browser's snapshot callback.
      flushSync(() => setTheme(isDark ? "light" : "dark"));
    };

    if (
      reduceMotion ||
      typeof document.startViewTransition !== "function"
    ) {
      switchTheme();
      return;
    }
    document.startViewTransition(switchTheme);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="rounded-full p-[5px] hover:bg-muted"
      aria-label={isDark ? "Use light theme" : "Use dark theme"}
      title={isDark ? "Use light theme" : "Use dark theme"}
      onClick={toggleTheme}
    >
      <svg
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="size-5 overflow-visible rounded-full bg-black"
      >
        <motion.g
          animate={{ rotate: isDark ? -180 : 0 }}
          transition={{ ease: "easeInOut", duration: reduceMotion ? 0 : 0.5 }}
          style={{ transformOrigin: "center" }}
        >
          <path
            d="M120 67.5C149.25 67.5 172.5 90.75 172.5 120C172.5 149.25 149.25 172.5 120 172.5"
            fill="white"
          />
          <path
            d="M120 67.5C90.75 67.5 67.5 90.75 67.5 120C67.5 149.25 90.75 172.5 120 172.5"
            fill="black"
          />
        </motion.g>
        <motion.path
          animate={{ rotate: isDark ? 180 : 0 }}
          transition={{ ease: "easeInOut", duration: reduceMotion ? 0 : 0.5 }}
          style={{ transformOrigin: "center" }}
          d="M120 3.75C55.5 3.75 3.75 55.5 3.75 120C3.75 184.5 55.5 236.25 120 236.25C184.5 236.25 236.25 184.5 236.25 120C236.25 55.5 184.5 3.75 120 3.75ZM120 214.5V172.5C90.75 172.5 67.5 149.25 67.5 120C67.5 90.75 90.75 67.5 120 67.5V25.5C172.5 25.5 214.5 67.5 214.5 120C214.5 172.5 172.5 214.5 120 214.5Z"
          fill="white"
        />
      </svg>
    </Button>
  );
}

/**
 * Skiper26 Theme_buttons_002 — rotating SVG and circular View Transition reveal.
 * Adapted from https://skiper-ui.com/v1/skiper26 (circle / top-right variant).
 * Original concept: rudrodip, https://github.com/rudrodip/theme-toggle-effect
 * Author: @gurvinder-singh02 · https://gxuri.me
 * Free-version attribution: Skiper UI, https://skiper-ui.com
 */
