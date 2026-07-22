# Quick Start Guide

## Push to GitHub

1. Create a new repo on [github.com/new](https://github.com/new)
   - Name: `VencordIOS`
   - Public or Private (your choice)
   - **Do NOT** initialize with README

2. Run these commands on your computer:

```bash
cd C:\Users\omara\OneDrive\Documents\discord\VencordIOS
git remote add origin https://github.com/YOUR_USERNAME/VencordIOS.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Build IPA on Mac

### Prerequisites
- Mac with macOS 12+ 
- Xcode (from App Store)
- Apple ID (free account works)

### Step 1: Install Theos

```bash
# Open Terminal on your Mac
git clone --recursive https://github.com/theos/theos.git ~/theos
export THEOS=~/theos
echo 'export THEOS=~/theos' >> ~/.zshrc
```

### Step 2: Install tools

```bash
brew install ldid dpkg optool
```

### Step 3: Clone and build

```bash
git clone https://github.com/YOUR_USERNAME/VencordIOS.git
cd VencordIOS
chmod +x build.sh
./build.sh
```

### Step 4: Get Discord IPA

```bash
# Install ipatool
brew install ipatool

# Login with your Apple ID
ipatool auth login -e your@email.com

# Download Discord
ipatool download -b com.hammerandchisel.discord -o Discord.ipa
```

### Step 5: Inject & Package

```bash
# Extract IPA
unzip Discord.ipa -d Discord_extracted/

# Copy tweak files
cp .theos/obj/VencordIOS.dylib Discord_extracted/Payload/Discord.app/
cp -r JavaScript/ Discord_extracted/Payload/Discord.app/VencordJS/

# Inject dylib into binary
optool install -c load -p @executable_path/VencordIOS.dylib \
  -t Discord_extracted/Payload/Discord.app/Discord

# Re-package as IPA
cd Discord_extracted
zip -r ../VencordDiscord.ipa Payload/
cd ..

# Re-sign (use your Apple ID certificate)
codesign -f -s "Apple Development" Discord_extracted/Payload/Discord.app
```

### Step 6: Install via SideStore

1. Open SideStore on your iPhone
2. Connect iPhone to Mac via USB
3. In SideStore, tap "+" and select `VencordDiscord.ipa`
4. Wait for installation to complete
5. Trust the certificate in Settings > General > VPN & Device Management

---

## What You Get

- **127 plugins** including all Vencord features
- **Multi Account Switcher** - switch accounts without logout
- **Voice Chat Optimizer** - reduced lag
- **Unlimited Servers** - bypass 500 server limit
- **Fake Nitro** - emojis, stickers, themes, streaming
- **Spotify Controls** - music player in Discord
- **Message Logger** - see deleted messages
- **And 100+ more features**

---

## Need Help?

- Join Vencord Discord: https://discord.gg/vencord
- GitHub Issues: Create an issue on the repo
- SideStore Discord: https://discord.gg/sidestore
