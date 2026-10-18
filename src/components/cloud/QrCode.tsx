import React from 'react';
import qrcode from 'qrcode-generator';

// A plain black-and-white QR code drawn as squares, so it scans well off a laptop screen
const QrCode: React.FC<{ text: string; size?: number; label: string }> = ({ text, size = 220, label }) => {
  const cells = React.useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const dark: string[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push(`M${c + 4} ${r + 4}h1v1h-1z`);
    }
    return { n, path: dark.join('') };
  }, [text]);
  const box = cells.n + 8; // 4 squares of white border all round
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${box} ${box}`} shapeRendering="crispEdges" className="bg-white">
      <rect width={box} height={box} fill="#fff" />
      <path d={cells.path} fill="#000" />
    </svg>
  );
};

export default QrCode;
