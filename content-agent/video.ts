import { spawn } from "node:child_process";

function escapeDrawtext(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/\n/g, " ");
}

export async function renderVerticalVideo(audioPath: string, destination: string, hook: string, callToAction: string) {
  const headline = escapeDrawtext(hook);
  const cta = escapeDrawtext(callToAction);
  const filter = [
    "drawbox=x=70:y=190:w=940:h=1500:color=0x071A2B@0.94:t=fill",
    "drawbox=x=70:y=190:w=18:h=1500:color=0x35C6A5:t=fill",
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='DIABEATS':fontcolor=0x35C6A5:fontsize=74:x=130:y=275`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${headline}':fontcolor=white:fontsize=58:x=130:y=500:box=0:line_spacing=18`,
    `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='${cta}':fontcolor=0xDCEBE8:fontsize=40:x=130:y=1430`,
    "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Education only â€¢ Individual responses vary':fontcolor=0x91AAA5:fontsize=25:x=130:y=1570",
  ].join(",");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x0E3852:s=1080x1920:r=30", "-i", audioPath, "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", destination], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
}
