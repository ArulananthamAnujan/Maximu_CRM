// Render the existing Maximus vector emblem into platform icon sizes.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const logo = await readFile(path.join(root, "../public/maximus-logo.svg"), "utf8");
const mark = logo.match(/<g id="Group_4833"[^>]*>([\s\S]*?)<\/g>/)?.[1];
if (!mark) throw new Error("The existing Maximus emblem was not found.");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="white"/><g transform="translate(176 272) scale(12)">${mark}</g></svg>`;
await mkdir(path.join(root, "assets"), { recursive: true });
await writeFile(path.join(root, "assets/app-icon.svg"), svg);
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(path.join(root, "assets/app-icon.png"), png);
await writeFile(path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"), png);
async function files(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(items.map(item => item.isDirectory() ? files(path.join(dir, item.name)) : [path.join(dir, item.name)]))).flat();
}
const images = [...await files(path.join(root, "android/app/src/main/res")), ...await files(path.join(root, "ios/App/App/Assets.xcassets/Splash.imageset"))];
for (const file of images.filter(file => file.endsWith(".png"))) {
  const { width, height } = await sharp(file).metadata();
  let output;
  if (file.includes("ic_launcher_foreground")) {
    const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><g transform="translate(225 305) scale(10)">${mark}</g></svg>`;
    output = await sharp(Buffer.from(foreground)).resize(width, height).png().toBuffer();
  } else if (file.includes("ic_launcher")) {
    output = await sharp(png).resize(width, height).png().toBuffer();
  } else if (file.includes("splash")) {
    const size = Math.round(Math.min(width, height) * .24);
    const icon = await sharp(png).resize(size, size).png().toBuffer();
    output = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite([{ input: icon, gravity: "centre" }]).png().toBuffer();
  }
  if (output) await writeFile(file, output);
}
console.log("Rendered native icons and splash screens from the existing Maximus emblem.");
