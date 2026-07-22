# Vencord iOS

A Vencord-inspired client modification for Discord iOS.

## Features

### Built-in Plugins

| Plugin | Description |
|--------|-------------|
| **No Track** | Blocks Discord analytics and tracking |
| **Silent Typing** | Hides typing indicators |
| **Message Logger** | Tracks deleted and edited messages |
| **Better Embeds** | Auto-expand embeds and improve rendering |
| **No Reply Timeout** | Prevents reply chains from collapsing |
| **Show Hidden Servers** | Reveals hidden servers |
| **Blur NSFW** | Blurs NSFW images until clicked |
| **Better Status** | Enhanced status options |
| **Emoji Utilities** | Copy emojis and view info |
| **Theme Loader** | Load custom CSS themes |
| **Multi Account Switcher** | Switch accounts without logging out |
| **Voice Chat Optimizer** | Reduces lag and improves voice call performance |
| **Unlimited Servers** | Bypass Discord's 500/1000 server join limit |

## Requirements

- macOS (for building)
- [Theos](https://github.com/theos/theos) installed
- Xcode with iOS SDK
- SideStore installed on your iPhone
- A decrypted Discord IPA

## Installation

### 1. Build the Tweak

```bash
cd VencordIOS
chmod +x build.sh
./build.sh
```

Or manually:
```bash
export THEOS=~/theos
make package
```

### 2. Get Discord IPA

```bash
# Using ipatool
brew install ipatool
ipatool auth login -e your@email.com
ipatool download -b com.hammerandchisel.discord -o Discord.ipa
```

### 3. Prepare the IPA

```bash
# Extract
unzip Discord.ipa -d Discord_extracted/

# Copy the built dylib
cp .theos/obj/VencordIOS.dylib Discord_extracted/Payload/Discord.app/

# Also copy JavaScript files (optional, for plugin loading)
cp -r JavaScript/ Discord_extracted/Payload/Discord.app/VencordJS/
```

### 4. Inject the Dylib

Use `optool` or similar tool:

```bash
# Install optool
brew install optool

# Inject
optool install -c load -p @executable_path/VencordIOS.dylib -t Discord_extracted/Payload/Discord.app/Discord
```

### 5. Re-sign

```bash
# Using codesign (requires Apple Developer account)
codesign -f -s "iPhone Distribution: YOUR CERTIFICATE" Discord_extracted/Payload/Discord.app
```

Or use `ios-deploy` or SideStore's signing.

### 6. Install via SideStore

1. Open SideStore on your iPhone
2. Connect your iPhone to your computer
3. Use SideStore to install the modified IPA

## Adding Custom Plugins

Create a new JavaScript file in `JavaScript/plugins/`:

```javascript
(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'myPlugin',
        name: 'My Custom Plugin',
        description: 'Description of what it does',
        author: 'Your Name',
        version: '1.0.0',

        start: function() {
            // Plugin initialization code
            console.log('My plugin started!');
            
            // Add your modifications here
        },

        stop: function() {
            // Cleanup code
            console.log('My plugin stopped!');
        }
    });
})();
```

## Plugin API

### Vencord.registerPlugin(config)
Register a new plugin with the given configuration.

### Vencord.startPlugin(id) / stopPlugin(id)
Start or stop a plugin by ID.

### Vencord.UI.showToast(message, type)
Show a toast notification. Types: 'info', 'success', 'warning', 'error'.

### Vencord.UI.injectCSS(id, css)
Inject custom CSS with an ID for easy removal.

### Vencord.UI.removeCSS(id)
Remove injected CSS by ID.

### Vencord.Logger.log(tag, message)
Log a message with a tag prefix.

### Vencord.Utils.sleep(ms)
Async sleep utility.

### Vencord.Utils.waitForElement(selector, timeout)
Wait for a DOM element to appear.

## Troubleshooting

### App crashes on launch
- Ensure the dylib was injected correctly
- Check that the binary is re-signed properly
- Verify the bundle ID matches

### Plugins not loading
- Ensure JavaScript files are in the correct location
- Check the console logs for errors
- Make sure the plugin files are valid JavaScript

### App won't install via SideStore
- Verify your Apple ID is set up in SideStore
- Check that the app is properly signed
- Try using a different signing certificate

## Disclaimer

This is a third-party modification and is not affiliated with Discord. Use at your own risk. Discord's Terms of Service prohibit client modifications.

## License

GPL-3.0
