# Icon Generation Guide

The extension requires PNG icons in the following sizes:
- 16x16 pixels (icon-16.png)
- 48x48 pixels (icon-48.png)
- 128x128 pixels (icon-128.png)
- 512x512 pixels (icon-512.png)

## Automated Generation (Recommended — no dependencies)

This repo does **not** require Node/npm to run the extension, so icon generation is done with a small, dependency-free HTML tool.

### Using the icon generator

1. Ensure `icons/icon-source.svg` looks correct.
2. Open `icons/generate-icons.html` in Chrome.
3. Click **Generate & Download PNGs**.
4. Move the downloaded files into `icons/` (overwrite):
   - `icon-16.png`
   - `icon-48.png`
   - `icon-128.png`
   - `icon-512.png`

If downloads fail due to `file://` restrictions, run a local server from the repo root:

```bash
python -m http.server 8000
```

Then open:

- `http://localhost:8000/icons/generate-icons.html`

### Example SVG Structure

Here's a minimal example `icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#9147ff" rx="64"/>
  <circle cx="256" cy="256" r="120" fill="white" opacity="0.9"/>
  <path d="M 256 150 L 320 256 L 256 362 L 192 256 Z" fill="#9147ff"/>
</svg>
```

## Manual Generation

You can also use any image editor or online tool to create these icons manually.

### Recommended Tools:
- [Figma](https://www.figma.com) - Free design tool
- [Canva](https://www.canva.com) - Online design tool
- [GIMP](https://www.gimp.org) - Free image editor
- [ImageMagick](https://imagemagick.org) - Command-line tool

### Using ImageMagick (if installed):
```bash
# Create a simple icon from text (replace with your design)
convert -size 512x512 xc:#9147ff -pointsize 200 -fill white -gravity center -annotate +0+0 "TSR" icons/icon-512.png
convert icons/icon-512.png -resize 128x128 icons/icon-128.png
convert icons/icon-512.png -resize 48x48 icons/icon-48.png
convert icons/icon-512.png -resize 16x16 icons/icon-16.png
```

## Placeholder Icons

For development, you can use simple colored squares as placeholders, but these should be replaced before publishing to the Chrome Web Store.

