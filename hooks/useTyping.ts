/**
 * Hook useTyping - Indicateur de saisie intelligent
 *
 * Algorithme: Throttle + Debounce hybride
 * - Debounce (300ms): attendre la pause de frappe
 * - Throttle (3000ms): max 1 event toutes les 3 secondes
 *
 * Complexité: O(1) par appel
 */

"use client";

import { useRef, useCallback, useState } from "react";
import { useSocketContext } from "@/providers/SocketProvider";

interface UseTypingOptions {
  debounceMs?: number;
  throttleMs?: number;
}

interface UseTypingReturn {
  sendTyping: () => void;
  isThrottled: boolean;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_THROTTLE_MS = 3000;

export function useTyping(
  conversationId: string,
  options: UseTypingOptions = {},
): UseTypingReturn {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, throttleMs = DEFAULT_THROTTLE_MS } =
    options;
  const { emit } = useSocketContext();

  const lastSentAt = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isThrottled, setIsThrottled] = useState(false);

  const sendTyping = useCallback(() => {
    const now = Date.now();

    // Nettoyer le timer précédent
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Vérifier le throttle global
    const timeSinceLastSend = now - lastSentAt.current;

    if (timeSinceLastSend < throttleMs) {
      // On est dans la période throttle - debounce à la fin de la fenêtre
      const remainingThrottle = throttleMs - timeSinceLastSend;

      setIsThrottled(true);
      debounceTimerRef.current = setTimeout(() => {
        emit("typing", { conversationId });
        lastSentAt.current = Date.now();
        setIsThrottled(false);
      }, remainingThrottle + debounceMs);

      return;
    }

    // Debounce normal hors throttle
    setIsThrottled(false);
    debounceTimerRef.current = setTimeout(() => {
      emit("typing", { conversationId });
      lastSentAt.current = Date.now();
    }, debounceMs);
  }, [conversationId, emit, debounceMs, throttleMs]);

  return {
    sendTyping,
    isThrottled,
  };
}
