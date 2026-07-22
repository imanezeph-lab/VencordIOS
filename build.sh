#!/bin/bash
# Vencord iOS - Build Script
# Run this on macOS with Theos installed

set -e

echo "=== Vencord iOS Builder ==="
echo ""

# Check for Theos
if [ ! -d "$THEOS" ]; then
    echo "Error: Theos not found. Install it first:"
    echo "  git clone --recursive https://github.com/theos/theos.git ~/theos"
    echo "  export THEOS=~/theos"
    echo ""
    exit 1
fi

echo "Building Vencord iOS tweak..."
cd "$(dirname "$0")"

# Build the tweak
make package

echo ""
echo "=== Build Complete ==="
echo ""
echo "Next steps:"
echo "1. Decrypt your Discord IPA using ipatool:"
echo "   ipatool download -b com.hammerandchisel.discord -o Discord.ipa"
echo ""
echo "2. Extract the IPA:"
echo "   unzip Discord.ipa -d Discord_extracted/"
echo ""
echo "3. Copy the built dylib to the app:"
echo "   cp .theos/obj/VencordIOS.dylib Discord_extracted/Payload/Discord.app/"
echo ""
echo "4. Inject the dylib into the Discord binary:"
echo "   Insert dylib into Discord binary using optool or similar"
echo ""
echo "5. Re-sign the app with your certificate"
echo ""
echo "6. Install via SideStore"
echo ""
