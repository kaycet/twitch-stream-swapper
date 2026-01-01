Chrome Web Store promo tiles

Files:
- small-promo.svg (440x280)
- marquee-promo.svg (1400x560)

Export notes:
- Store requires JPEG or 24-bit PNG with NO alpha.
- Both SVGs have a solid background rect, so exported PNGs should be opaque.

Inkscape example exports:
- inkscape small-promo.svg --export-type=png --export-filename=small-promo.png -w 440 -h 280 --export-background=#0e0e10 --export-background-opacity=1
- inkscape marquee-promo.svg --export-type=png --export-filename=marquee-promo.png -w 1400 -h 560 --export-background=#0e0e10 --export-background-opacity=1

If you need JPEG instead:
- Export PNG, then convert to JPEG in any editor ensuring RGB (no alpha).
