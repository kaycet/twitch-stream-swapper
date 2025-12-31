# Icon Generation Guide

## Icon Source

The master icon source file is located at `icons/icon-source.svg`. This SVG file contains the vector graphics design that should be used to generate all PNG icon sizes. The design features:
- Purple (#9147ff) background circle representing Twitch branding
- White play button in the center (streaming symbol)
- Rotating circular arrow around the play button (rotation symbol)
- Optimized for scalability from 16px to 512px

To generate PNG icons from the SVG source, you can use tools like:
- [Inkscape](https://inkscape.org/) (command-line: `inkscape --export-filename=icon-16.png --export-width=16 --export-height=16 icon-source.svg`)
- [ImageMagick](https://imagemagick.org) (with rsvg or inkscape delegate)
- Online SVG to PNG converters
- Design tools like Figma or Adobe Illustrator

## Required PNG Icons

The extension requires PNG icons in the following sizes:
- 16x16 pixels (icon-16.png)
- 48x48 pixels (icon-48.png)
- 128x128 pixels (icon-128.png)
- 512x512 pixels (icon-512.png)

## Quick Generation

You can use any image editor or online tool to create these icons. The icons should represent the extension's purpose (Twitch stream rotation).

### Recommended Tools:
- [Figma](https://www.figma.com) - Free design tool
- [Canva](https://www.canva.com) - Online design tool
- [GIMP](https://www.gimp.org) - Free image editor
- [ImageMagick](https://imagemagick.org) - Command-line tool

### Design Suggestions:
- Use Twitch purple (#9147ff) as primary color
- Include a rotation/cycle symbol or arrow
- Keep it simple and recognizable at small sizes
- Use a transparent or dark background

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

