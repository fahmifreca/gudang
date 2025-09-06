import React, { useEffect, useRef } from "react";
import LEGACY_HTML from "./legacy.html?raw";
export default function Legacy() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = LEGACY_HTML;
    const inject = (file: string, type: "module" | "text/javascript" = "module") =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.type = type;
        s.src = file;
        if (type !== "module") s.defer = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.body.appendChild(s);
      });
    // Load helpers (XLSX wrapper) then legacy module app
    // 1) muat pagination lebih dulu (tipe biasa)
inject("pagination-v15-port.js", "text/javascript")
  // 2) lanjut helper
  .then(()=>inject("legacy-helpers.js","text/javascript"))
  // 3) terakhir legacy-app.js (module)
  .then(()=>inject("legacy-app.js","module"))
  .catch((e)=>console.error("Gagal memuat skrip warisan", e));
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, []);
  return <div ref={ref} />;
}
