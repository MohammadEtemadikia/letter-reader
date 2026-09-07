import os from "os";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

export async function GET() {
  const port = Number(process.env.LETTER_READER_UPLOAD_PORT || 8934);
  const url = `http://${getLocalIp()}:${port}/`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });
  return Response.json(
    { url, qrDataUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}
