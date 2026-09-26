# MORPH — pull any picture into 3D

Drop any picture. Morph works out the depth of every pixel with AI, then turns it into 3D:
your subject climbs out of a comic panel, dissolves into dust, becomes a hologram, and more.
It also opens a "case file": who or what is in the picture, colors, vibe, and file details.

Theme: Miles Morales / Spider-Verse palette (ink black, spider red, caption yellow, cyan misprint).
Not affiliated with Marvel or DC.

## How to run it

1. Double-click **`start.bat`** (needs Node.js).
2. Your browser opens **http://localhost:5173**.
3. Keep the black window open while using the site. `Ctrl+C` stops it.

The first picture downloads two AI models (depth + recognition). After that they're cached and load instantly.

## Change the name

Edit `siteName` and `tagline` in `js/config.js`, and the `<title>` in `index.html`.

## The 6 styles

| Style | What it does |
|---|---|
| Pop-out | Background becomes a halftone comic panel; the subject steps out of it with an ink outline |
| 3D Photo | Real depth. The surface tears at object edges instead of stretching |
| Comic | Spider-Verse look: halftone dots, ink lines, misprinted color plates |
| Particles | ~130k dots. The **Snap** button turns them to dust and back |
| Hologram | Glowing scanline shader |
| Blocks | Minecraft-style blocks whose height = depth |

Extras: **Sway** (gentle 3D-photo motion), mouse/phone-tilt look-around, **Depth x-ray** (shows the depth map as colors), **Flip depth**, **Pop-out cut** slider.

## Exports

- **Comic cover** (1080×1440 PNG): a sharp render from a fixed angle, never cropped
- **Sticker** (1024×1024 PNG): subject cut out by AI, white die-cut border, soft shadow
- **Screenshot** (high-res PNG) and **Video clip** (6s)
- **3D file (.glb)**: matches what you see, including the comic panel, halftone, ink outline and caption.
  Opens in Blender, Windows 3D Viewer and online glTF viewers.

The subject cut-out uses the **RMBG-1.4** background-removal AI by BRIA AI
(free for personal / non-commercial use; check their license before using Morph commercially).
If it can't load, Morph falls back to cutting by depth; the **Pop-out cut** slider controls that.

## "Who's that?"

- **Free, in your browser:** the CLIP AI compares the picture with ~160 descriptions in `js/characters.js`
  (Marvel & DC heroes, other famous characters, animals, food, landmarks, objects).
  Marvel/DC characters get a case file: alias, first appearance, creators, powers.
  If it isn't confident, it says "Unknown" instead of guessing.
- **Deep file (optional):** Claude reads the picture and returns identity, facts, fun facts, captions
  and hashtags. Needs an API key from https://console.anthropic.com (paste it in Settings).
- Morph never names real people from their face, in either mode.

Add your own characters by adding entries to `js/characters.js`.

## Files

| File | Job |
|---|---|
| `index.html` / `css/style.css` | Layout and the comic-book design |
| `js/main.js` | Connects everything: uploads, buttons, case file |
| `js/viewer.js` | The 3D engine (Three.js + custom shaders for every style) |
| `js/depth.js` | AI depth (Depth Anything V2), quick depth, auto subject cut |
| `js/analyze.js` | Colors, vibe, file info, CLIP "who's that?" |
| `js/characters.js` | Everything the free recognizer knows, plus character files |
| `js/claude.js` | Optional Claude deep file |
| `js/exports.js` | Comic cover and sticker makers |
| `js/samples.js` | The 3 sample pictures, drawn with code |

## Putting it online

It's a static site: upload the folder to Netlify, Vercel or GitHub Pages.
Before going public, move the Claude call to a small backend so your API key stays secret.
