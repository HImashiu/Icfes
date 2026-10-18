import { useMemo } from "react";
import QRCode from "qrcode";

// A QR code on a white tile (dark modules on light, with a quiet zone) so it scans on the dark theme and reads from the back of a room.
export default function LiveQr({ value, size = 280 }) {
  const qr = useMemo(() => QRCode.create(value, { errorCorrectionLevel: "M" }), [value]);
  const n = qr.modules.size;
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.data[y * n + x]) cells.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return (
    <svg className="live-qr" role="img" aria-label={`Código QR para entrar: ${value}`} width={size} height={size}
      viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={cells.join("")} fill="#0b0f0a" />
    </svg>
  );
}
