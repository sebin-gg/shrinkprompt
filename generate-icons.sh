#!/bin/bash
# Icon generation script - Convert SVG to PNG at different sizes
# Requires ImageMagick to be installed: https://imagemagick.org/

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick not installed. Please install it from: https://imagemagick.org/"
    echo "Or use an online SVG to PNG converter like: https://cloudconvert.com/svg-to-png"
    exit 1
fi

# Create PNG icons from SVG
convert -background none -density 384 -resize 16x16 icons/icon.svg icons/icon-16.png
convert -background none -density 384 -resize 48x48 icons/icon.svg icons/icon-48.png
convert -background none -density 384 -resize 128x128 icons/icon.svg icons/icon-128.png

echo "✓ Icons generated successfully:"
echo "  - icons/icon-16.png"
echo "  - icons/icon-48.png"
echo "  - icons/icon-128.png"
