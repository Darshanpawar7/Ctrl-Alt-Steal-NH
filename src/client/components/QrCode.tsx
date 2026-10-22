import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ text, size = 240, className = "", dark = "#07060b", light = "#f4efe4" }: { text: string; size?: number; className?: string; dark?: string; light?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark, light }, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [text, size, dark, light]);
  return src ? <img src={src} width={size} height={size} alt={`QR code for ${text}`} className={className} /> : <div style={{ width: size, height: size }} className={className} />;
}
