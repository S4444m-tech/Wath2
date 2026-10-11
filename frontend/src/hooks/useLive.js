import { useEffect, useRef } from "react";
import { API } from "@/lib/api";

// SSE with polling fallback. onChange is called on any relevant event or poll tick.
export function useLive(onChange, transactionId, pollMs = 10000) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let es;
    let open = false;
    const url = `${API}/events${transactionId ? `?transaction_id=${transactionId}` : ""}`;
    try {
      es = new EventSource(url, { withCredentials: true });
      es.onopen = () => (open = true);
      es.onmessage = () => cb.current();
      es.onerror = () => (open = false);
    } catch {
      open = false;
    }
    const t = setInterval(() => {
      if (!open) cb.current();
    }, pollMs);
    return () => {
      clearInterval(t);
      es && es.close();
    };
  }, [transactionId, pollMs]);
}
