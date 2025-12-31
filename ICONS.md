# Icon Generation Guide

The extension requires PNG icons in the following sizes:
- 16x16 pixels (icon-16.png)
- 48x48 pixels (icon-48.png)
- 128x128 pixels (icon-128.png)
- 512x512 pixels (icon-512.png)

## Automated Generation (Recommended)

The easiest way to generate all required icon sizes is using the included Node.js script.

### Prerequisites

1. **Install Node.js** (if not already installed):
   - Download from [nodejs.org](https://nodejs.org/)
   - Or use a package manager:
     ```bash
     # macOS (Homebrew)
     brew install node
     
     # Ubuntu/Debian
     sudo apt-get install nodejs npm
     
     # Windows
     # Download installer from nodejs.org
     ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```
   This will install `sharp`, the image processing library used by the script.

### Using the Generation Script

1. **Create your SVG source file**:
   - Create `icons/icon-source.svg` with your icon design
   - The SVG should be square (recommended: 512x512 viewBox)
   - Use a transparent background for best results
   - Design suggestions:
     - Use Twitch purple (#9147ff) as primary color
     - Include a rotation/cycle symbol or arrow
     - Keep it simple and recognizable at small sizes

2. **Run the generation script**:
   ```bash
   npm run generate-icons
   ```

3. **Verify output**:
   The script will generate all four PNG files in the `icons/` directory:
   - `icon-16.png`
   - `icon-48.png`
   - `icon-128.png`
   - `icon-512.png`

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

