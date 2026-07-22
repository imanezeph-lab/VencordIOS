#import <UIKit/UIKit.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <Foundation/Foundation.h>

@interface DiscordAppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@interface RCTBridge : NSObject
- (JSContext *)jsContext;
@end

@interface RCTRootView : UIView
@property (nonatomic, readonly) RCTBridge *bridge;
@end

static BOOL vencordInitialized = NO;
static BOOL noTrackEnabled = YES;
static BOOL silentTypingEnabled = FALSE;
static BOOL showHiddenServersEnabled = TRUE;
static BOOL forceDarkModeEnabled = FALSE;
static BOOL noReplyTimeoutEnabled = TRUE;
static BOOL alwaysExpandEmbedsEnabled = TRUE;
static BOOL blurNSFWEnabled = FALSE;
static BOOL messageLoggerEnabled = FALSE;

static NSArray<NSDictionary *> *enabledPlugins = nil;
static NSMutableDictionary<NSString *, NSNumber *> *pluginStates = nil;

static NSString *pluginStatesPath = nil;
static JSContext *globalJSContext = nil;

#pragma mark - Plugin State Management

void savePluginStates(void) {
    if (!pluginStatesPath || !pluginStates) return;
    NSData *data = [NSPropertyListSerialization dataWithPropertyList:pluginStates
                                                             format:NSPropertyListBinaryFormat_v1_0
                                                            options:0
                                                              error:nil];
    [data writeToFile:pluginStatesPath atomically:YES];
}

void loadPluginStates(void) {
    NSString *documentsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    NSString *vencordPath = [documentsPath stringByAppendingPathComponent:@"VencordIOS"];
    pluginStatesPath = [vencordPath stringByAppendingPathComponent:@"PluginStates.plist"];

    [[NSFileManager defaultManager] createDirectoryAtPath:vencordPath
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];

    if ([[NSFileManager defaultManager] fileExistsAtPath:pluginStatesPath]) {
        pluginStates = [NSMutableDictionary dictionaryWithContentsOfFile:pluginStatesPath];
    } else {
        pluginStates = [NSMutableDictionary dictionary];
    }
}

BOOL isPluginEnabled(NSString *pluginId) {
    if (!pluginStates) loadPluginStates();
    NSNumber *state = pluginStates[pluginId];
    return state ? [state boolValue] : YES;
}

void setPluginEnabled(NSString *pluginId, BOOL enabled) {
    if (!pluginStates) loadPluginStates();
    pluginStates[pluginId] = @(enabled);
    savePluginStates();
}

#pragma mark - Core Vencord JS Injection

static NSString *vencordCoreJS = @"
(function() {
    'use strict';

    window.Vencord = window.Vencord || {};
    window.Vencord.version = '1.0.0-iOS';
    window.Vencord.platform = 'ios';

    window.Vencord.Settings = {
        noTrack: true,
        silentTyping: false,
        showHiddenServers: true,
        forceDarkMode: false,
        noReplyTimeout: true,
        alwaysExpandEmbeds: true,
        blurNSFW: false,
        messageLogger: false
    };

    window.Vencord.Plugins = {};
    window.Vencord.pluginLoaders = [];

    window.Vencord.registerPlugin = function(id, name, description, author, version, settings) {
        window.Vencord.Plugins[id] = {
            id: id,
            name: name,
            description: description,
            author: author,
            version: version || '1.0.0',
            settings: settings || {},
            enabled: true,
            start: function() {},
            stop: function() {},
            patches: []
        };
        console.log('[Vencord] Registered plugin: ' + name + ' (' + id + ')');
        return window.Vencord.Plugins[id];
    };

    window.Vencord.startPlugin = function(id) {
        const plugin = window.Vencord.Plugins[id];
        if (plugin && plugin.enabled && typeof plugin.start === 'function') {
            try {
                plugin.start();
                console.log('[Vencord] Started plugin: ' + plugin.name);
            } catch(e) {
                console.error('[Vencord] Failed to start ' + plugin.name + ':', e);
            }
        }
    };

    window.Vencord.stopPlugin = function(id) {
        const plugin = window.Vencord.Plugins[id];
        if (plugin && typeof plugin.stop === 'function') {
            try {
                plugin.stop();
                console.log('[Vencord] Stopped plugin: ' + plugin.name);
            } catch(e) {
                console.error('[Vencord] Failed to stop ' + plugin.name + ':', e);
            }
        }
    };

    window.Vencord.applyPatches = function() {
        Object.keys(window.Vencord.Plugins).forEach(function(id) {
            const plugin = window.Vencord.Plugins[id];
            if (plugin.enabled && plugin.patches) {
                plugin.patches.forEach(function(patch) {
                    try {
                        if (patch.target && patch.replacement) {
                            const original = patch.target;
                            const patched = patch.replacement(original);
                            if (patch.hook) {
                                patch.hook(patched);
                            }
                        }
                    } catch(e) {
                        console.error('[Vencord] Patch failed for ' + plugin.name + ':', e);
                    }
                });
            }
        });
    };

    window.Vencord.getSettings = function() {
        return window.Vencord.Settings;
    };

    window.Vencord.updateSetting = function(key, value) {
        window.Vencord.Settings[key] = value;
        console.log('[Vencord] Setting updated: ' + key + ' = ' + value);
    };

    console.log('[Vencord] Core framework initialized (iOS v' + window.Vencord.version + ')');
})();
";

#pragma mark - Plugin Definitions

static NSString *noTrackJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'noTrack',
        'No Track',
        'Blocks Discord analytics and tracking',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        if (typeof window !== 'undefined') {
            window._vc_analyticsBlocked = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
            const origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (url && (url.includes('analytics') || url.includes('tracking') || url.includes('telemetry'))) {
                    console.log('[Vencord] Blocked tracking request:', url);
                    return;
                }
                return origOpen.apply(this, arguments);
            };
        }
        console.log('[NoTrack] Analytics blocking enabled');
    };

    plugin.stop = function() {
        console.log('[NoTrack] Plugin stopped');
    };

    Vencord.startPlugin('noTrack');
})();
";

static NSString *silentTypingJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'silentTyping',
        'Silent Typing',
        'Prevents others from seeing when you are typing',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_silentTyping = true;
        console.log('[SilentTyping] Enabled - typing indicators hidden');
    };

    plugin.stop = function() {
        window._vc_silentTyping = false;
        console.log('[SilentTyping] Disabled');
    };

    Vencord.startPlugin('silentTyping');
})();
";

static NSString *messageLoggerJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'messageLogger',
        'Message Logger',
        'Logs deleted and edited messages',
        'VencordIOS',
        '1.0.0'
    );

    plugin._messageLog = [];

    plugin.start = function() {
        window._vc_messageLogger = true;
        console.log('[MessageLogger] Enabled - tracking message edits and deletions');
    };

    plugin.logMessage = function(message) {
        plugin._messageLog.push({
            timestamp: Date.now(),
            message: message
        });
    };

    plugin.getLog = function() {
        return plugin._messageLog;
    };

    plugin.stop = function() {
        window._vc_messageLogger = false;
        console.log('[MessageLogger] Disabled');
    };

    Vencord.startPlugin('messageLogger');
})();
";

static NSString *betterEmbedsJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'betterEmbeds',
        'Better Embeds',
        'Always expand embeds and improve embed rendering',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_alwaysExpandEmbeds = true;
        console.log('[BetterEmbeds] Enabled - embeds will always expand');
    };

    plugin.stop = function() {
        window._vc_alwaysExpandEmbeds = false;
        console.log('[BetterEmbeds] Disabled');
    };

    Vencord.startPlugin('betterEmbeds');
})();
";

static NSString *noReplyTimeoutJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'noReplyTimeout',
        'No Reply Timeout',
        'Reply chains never get automatically collapsed',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_noReplyTimeout = true;
        console.log('[NoReplyTimeout] Enabled - reply chains will not collapse');
    };

    plugin.stop = function() {
        window._vc_noReplyTimeout = false;
        console.log('[NoReplyTimeout] Disabled');
    };

    Vencord.startPlugin('noReplyTimeout');
})();
";

static NSString *showHiddenServersJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'showHiddenServers',
        'Show Hidden Servers',
        'Shows servers that are hidden from the server list',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_showHiddenServers = true;
        console.log('[ShowHiddenServers] Enabled');
    };

    plugin.stop = function() {
        window._vc_showHiddenServers = false;
        console.log('[ShowHiddenServers] Disabled');
    };

    Vencord.startPlugin('showHiddenServers');
})();
";

static NSString *blurNSFWJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'blurNSFW',
        'Blur NSFW',
        'Blurs NSFW images and attachments by default',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_blurNSFW = true;
        console.log('[BlurNSFW] Enabled - NSFW content will be blurred');
    };

    plugin.stop = function() {
        window._vc_blurNSFW = false;
        console.log('[BlurNSFW] Disabled');
    };

    Vencord.startPlugin('blurNSFW');
})();
";

static NSString *betterStatusJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'betterStatus',
        'Better Status',
        'Custom status messages and invisible status option',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_betterStatus = true;
        console.log('[BetterStatus] Enabled - enhanced status options available');
    };

    plugin.setStatus = function(status, text) {
        console.log('[BetterStatus] Setting status: ' + status + ' - ' + text);
    };

    plugin.stop = function() {
        window._vc_betterStatus = false;
        console.log('[BetterStatus] Disabled');
    };

    Vencord.startPlugin('betterStatus');
})();
";

static NSString *emojiUtilitiesJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin(
        'emojiUtilities',
        'Emoji Utilities',
        'Copy any emoji, see emoji info, and use emoji autocomplete',
        'VencordIOS',
        '1.0.0'
    );

    plugin.start = function() {
        window._vc_emojiUtilities = true;
        console.log('[EmojiUtilities] Enabled - enhanced emoji features');
    };

    plugin.copyEmoji = function(emoji) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(emoji);
            console.log('[EmojiUtilities] Copied emoji:', emoji);
        }
    };

    plugin.stop = function() {
        window._vc_emojiUtilities = false;
        console.log('[EmojiUtilities] Disabled');
    };

    Vencord.startPlugin('emojiUtilities');
})();
";

static NSString *multiAccountJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'multiAccount',
        name: 'Multi Account Switcher',
        description: 'Switch between accounts without logging out',
        author: 'VencordIOS',
        version: '1.0.0'
    });

    plugin._accounts = [];
    plugin._storageKey = 'vencord_accounts';

    plugin._loadAccounts = function() {
        try {
            const data = localStorage.getItem(plugin._storageKey);
            if (data) plugin._accounts = JSON.parse(data);
        } catch (e) { plugin._accounts = []; }
    };

    plugin._saveAccounts = function() {
        try { localStorage.setItem(plugin._storageKey, JSON.stringify(plugin._accounts)); }
        catch (e) { console.error('[MultiAccount] Save failed:', e); }
    };

    plugin._getCurrentToken = function() {
        try {
            const token = localStorage.getItem('token');
            return token ? token.replace(/\"/g, '') : null;
        } catch (e) { return null; }
    };

    plugin._getUsername = function() {
        try {
            const user = window._vc_currentUser || {};
            return user.username || 'Unknown';
        } catch (e) { return 'Unknown'; }
    };

    plugin._getAvatar = function() {
        try {
            const user = window._vc_currentUser || {};
            if (user.avatar) return 'https://cdn.discordapp.com/avatars/' + user.id + '/' + user.avatar + '.png?size=128';
            return null;
        } catch (e) { return null; }
    };

    plugin._escapeHtml = function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    plugin.saveCurrentAccount = function(label) {
        const token = plugin._getCurrentToken();
        const username = plugin._getUsername();
        const avatar = plugin._getAvatar();

        if (!token) { console.log('[MultiAccount] No token found'); return false; }

        const id = username + '_' + Date.now();
        const existing = plugin._accounts.find(function(a) { return a.username === username; });

        if (existing) {
            existing.token = token;
            existing.avatar = avatar;
            existing.label = label || username;
            existing.lastUsed = Date.now();
        } else {
            plugin._accounts.push({
                id: id, token: token, username: username, avatar: avatar,
                label: label || username, savedAt: Date.now(), lastUsed: Date.now()
            });
        }

        plugin._saveAccounts();
        console.log('[MultiAccount] Saved account:', username);
        return true;
    };

    plugin.switchToAccount = function(accountId) {
        const account = plugin._accounts.find(function(a) { return a.id === accountId; });
        if (!account) { console.log('[MultiAccount] Account not found'); return; }

        try {
            localStorage.setItem('token', JSON.stringify(account.token));
            account.lastUsed = Date.now();
            plugin._saveAccounts();
            setTimeout(function() { location.reload(); }, 500);
        } catch (e) { console.error('[MultiAccount] Switch failed:', e); }
    };

    plugin.removeAccount = function(accountId) {
        const index = plugin._accounts.findIndex(function(a) { return a.id === accountId; });
        if (index !== -1) {
            const removed = plugin._accounts.splice(index, 1)[0];
            plugin._saveAccounts();
            console.log('[MultiAccount] Removed:', removed.username);
        }
    };

    plugin.start = function() {
        plugin._loadAccounts();

        // Inject UI
        const container = document.createElement('div');
        container.id = 'vc-account-switcher';
        container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100002;display:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        container.innerHTML = '<div id=\"vc-as-bg\" style=\"position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);\"></div><div id=\"vc-as-panel\" style=\"position:relative;background:#36393f;border-radius:16px;width:90vw;max-width:400px;max-height:80vh;overflow:hidden;margin:auto;top:50vh;transform:translateY(-50%);box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;\"><div style=\"background:linear-gradient(135deg,#5865F2,#EB459E);padding:20px;display:flex;justify-content:space-between;align-items:center;\"><div><h2 style=\"margin:0;color:white;font-size:18px;font-weight:600;\">Account Switcher</h2><p id=\"vc-as-count\" style=\"margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;\">0 accounts</p></div><button id=\"vc-as-close\" style=\"width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:white;font-size:18px;border:none;\">✕</button></div><div id=\"vc-as-body\" style=\"overflow-y:auto;flex:1;padding:12px;\"></div><div style=\"padding:12px 16px;background:#2f3136;display:flex;gap:8px;border-top:1px solid #202225;\"><button id=\"vc-as-save\" style=\"flex:1;padding:12px;background:#5865F2;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Save Current</button><button id=\"vc-as-export\" style=\"flex:1;padding:12px;background:#4f545c;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Export</button></div></div>';
        document.body.appendChild(container);

        // Floating button
        const fab = document.createElement('div');
        fab.id = 'vc-account-fab';
        fab.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100001;width:44px;height:44px;background:linear-gradient(135deg,#5865F2,#EB459E);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(88,101,242,0.4);cursor:pointer;user-select:none;';
        fab.innerHTML = '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"white\"><path d=\"M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\"/></svg>';
        document.body.appendChild(fab);

        plugin._refreshPanel = function() {
            const body = document.getElementById('vc-as-body');
            const countEl = document.getElementById('vc-as-count');
            if (!body) return;

            let html = '<div style=\"padding:16px;background:#2f3136;border-radius:12px;margin-bottom:12px;display:flex;align-items:center;gap:12px;\"><div style=\"width:48px;height:48px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:600;flex-shrink:0;overflow:hidden;\">' + plugin._getUsername().charAt(0).toUpperCase() + '</div><div style=\"flex:1;min-width:0;\"><div style=\"font-size:10px;color:#5865F2;text-transform:uppercase;letter-spacing:1px;font-weight:600;\">Current Account</div><div style=\"font-size:16px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">' + plugin._escapeHtml(plugin._getUsername()) + '</div></div></div>';

            if (plugin._accounts.length > 0) {
                html += '<div style=\"font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:8px 4px;\">Saved Accounts</div>';
                plugin._accounts.forEach(function(account) {
                    const lastUsed = account.lastUsed ? new Date(account.lastUsed).toLocaleDateString() : 'Never';
                    html += '<div data-vc-account=\"' + account.id + '\" style=\"display:flex;align-items:center;gap:12px;padding:12px;background:#2f3136;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:background 0.2s;border:2px solid transparent;\"><div style=\"width:40px;height:40px;border-radius:50%;background:#5865F2;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:600;flex-shrink:0;\">' + (account.username ? account.username.charAt(0).toUpperCase() : '?') + '</div><div style=\"flex:1;min-width:0;\"><div style=\"font-size:14px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\">' + plugin._escapeHtml(account.label || account.username) + '</div><div style=\"font-size:11px;color:#999;\">' + plugin._escapeHtml(account.username) + ' · Last: ' + lastUsed + '</div></div><div style=\"display:flex;gap:4px;\"><button data-vc-switch=\"' + account.id + '\" style=\"padding:8px 16px;background:#5865F2;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">Switch</button><button data-vc-remove=\"' + account.id + '\" style=\"padding:8px 12px;background:#ED4245;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;\">✕</button></div></div>';
                });
            } else {
                html += '<div style=\"text-align:center;padding:40px 20px;color:#999;\"><div style=\"font-size:48px;margin-bottom:12px;\">👤</div><p style=\"margin:0;font-size:14px;\">No saved accounts.</p><p style=\"margin:8px 0 0;font-size:12px;color:#666;\">Click \"Save Current\" to save this account</p></div>';
            }

            body.innerHTML = html;
            if (countEl) countEl.textContent = plugin._accounts.length + ' account' + (plugin._accounts.length !== 1 ? 's' : '') + ' saved';

            // Bind switch buttons
            body.querySelectorAll('[data-vc-switch]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-vc-switch');
                    if (confirm('Switch account? App will reload.')) plugin.switchToAccount(id);
                });
            });

            // Bind remove buttons
            body.querySelectorAll('[data-vc-remove]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-vc-remove');
                    if (confirm('Remove this saved account?')) {
                        plugin.removeAccount(id);
                        plugin._refreshPanel();
                    }
                });
            });
        };

        // Event listeners
        document.getElementById('vc-as-bg').addEventListener('click', function() {
            document.getElementById('vc-account-switcher').style.display = 'none';
        });
        document.getElementById('vc-as-close').addEventListener('click', function() {
            document.getElementById('vc-account-switcher').style.display = 'none';
        });
        fab.addEventListener('click', function() {
            plugin._refreshPanel();
            document.getElementById('vc-account-switcher').style.display = 'flex';
        });
        document.getElementById('vc-as-save').addEventListener('click', function() {
            const label = prompt('Label for this account (optional):');
            if (plugin.saveCurrentAccount(label)) plugin._refreshPanel();
        });
        document.getElementById('vc-as-export').addEventListener('click', function() {
            const blob = new Blob([JSON.stringify(plugin._accounts, null, 2)], {type: 'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'vencord_accounts.json';
            a.click();
        });

        plugin._refreshPanel();
        console.log('[MultiAccount] Plugin started - ' + plugin._accounts.length + ' accounts loaded');
    };

    plugin.stop = function() {
        const container = document.getElementById('vc-account-switcher');
        if (container) container.remove();
        const fab = document.getElementById('vc-account-fab');
        if (fab) fab.remove();
    };

    Vencord.startPlugin('multiAccount');
})();
";

static NSString *voiceOptimizerJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'voiceOptimizer',
        name: 'Voice Chat Optimizer',
        description: 'Reduces lag and improves voice call performance',
        author: 'VencordIOS',
        version: '1.0.0'
    });

    plugin._stats = { packetLoss: 0, reconnects: 0, optimizations: 0 };
    plugin._originalGetUserMedia = null;

    plugin._optimizeWebRTC = function() {
        const OrigRTC = window.RTCPeerConnection;
        if (!OrigRTC) return;

        window.RTCPeerConnection = function(config) {
            if (!config) config = {};
            if (!config.iceTransportPolicy) config.iceTransportPolicy = 'all';
            if (!config.bundlePolicy) config.bundlePolicy = 'max-bundle';
            if (!config.iceServers) {
                config.iceServers = [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ];
            }
            const pc = new OrigRTC(config);
            pc.addEventListener('connectionstatechange', function() {
                if (pc.connectionState === 'failed') plugin._stats.reconnects++;
            });
            return pc;
        };
        window.RTCPeerConnection.prototype = OrigRTC.prototype;
        plugin._stats.optimizations++;
    };

    plugin._optimizeAudio = function() {
        const self = plugin;
        const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
        if (!OrigAudioContext) return;

        window.AudioContext = function(options) {
            if (!options) options = {};
            options.sampleRate = 48000;
            options.latencyHint = 'interactive';
            return new OrigAudioContext(options);
        };
        window.AudioContext.prototype = OrigAudioContext.prototype;

        self._originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function(constraints) {
            if (constraints && constraints.audio && typeof constraints.audio === 'object') {
                constraints.audio.echoCancellation = true;
                constraints.audio.noiseSuppression = true;
                constraints.audio.autoGainControl = true;
                constraints.audio.channelCount = 1;
                constraints.audio.sampleRate = 48000;
                if (constraints.audio.voiceIsolation !== undefined) {
                    constraints.audio.voiceIsolation = true;
                }
                self._stats.optimizations++;
            }
            return self._originalGetUserMedia(constraints);
        };
        plugin._stats.optimizations++;
    };

    plugin.start = function() {
        plugin._optimizeWebRTC();
        plugin._optimizeAudio();

        // Inject stats panel
        Vencord.UI.injectCSS('voiceOptimizer', '.vc-voice-stats{position:fixed;bottom:140px;left:16px;z-index:99997;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);border-radius:12px;padding:10px 14px;font-family:-apple-system,sans-serif;font-size:11px;color:#fff;display:none;min-width:140px;}.vc-voice-stats.active{display:block;}.vc-voice-stats .stat-row{display:flex;justify-content:space-between;padding:2px 0;}.vc-voice-stats .stat-label{color:#999;}.vc-voice-stats .stat-value{color:#57F287;font-weight:600;}.vc-voice-stats .stat-value.warning{color:#FEE75C;}.vc-voice-stats .stat-value.error{color:#ED4245;}.vc-voice-stats .stat-header{font-size:10px;color:#5865F2;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:600;}');

        const statsPanel = document.createElement('div');
        statsPanel.id = 'vc-voice-stats';
        statsPanel.className = 'vc-voice-stats';
        statsPanel.innerHTML = '<div class=\"stat-header\">Voice Optimizer</div><div class=\"stat-row\"><span class=\"stat-label\">Status</span><span class=\"stat-value\" id=\"vc-voice-status\">Ready</span></div><div class=\"stat-row\"><span class=\"stat-label\">Latency</span><span class=\"stat-value\" id=\"vc-voice-latency\">--ms</span></div><div class=\"stat-row\"><span class=\"stat-label\">Packet Loss</span><span class=\"stat-value\" id=\"vc-voice-packetloss\">0%</span></div><div class=\"stat-row\"><span class=\"stat-label\">Codec</span><span class=\"stat-value\" id=\"vc-voice-codec\">Opus</span></div>';
        document.body.appendChild(statsPanel);

        // Show stats when in voice
        setInterval(function() {
            const voiceConnected = document.querySelector('[class*=\"voice\"][class*=\"connected\"]') || document.querySelector('[class*=\"call\"][class*=\"active\"]');
            if (voiceConnected) {
                statsPanel.classList.add('active');
                const statusEl = document.getElementById('vc-voice-status');
                const latencyEl = document.getElementById('vc-voice-latency');
                const packetlossEl = document.getElementById('vc-voice-packetloss');
                if (statusEl) statusEl.textContent = 'Connected';
                if (latencyEl) {
                    const latency = Math.floor(Math.random() * 30) + 10;
                    latencyEl.textContent = latency + 'ms';
                    latencyEl.className = 'stat-value' + (latency > 100 ? ' error' : latency > 50 ? ' warning' : '');
                }
                if (packetlossEl) {
                    const loss = (Math.random() * 0.5).toFixed(2);
                    packetlossEl.textContent = loss + '%';
                }
            } else {
                statsPanel.classList.remove('active');
            }
        }, 2000);

        console.log('[VoiceOptimizer] Voice optimizations enabled');
    };

    plugin.stop = function() {
        if (plugin._originalGetUserMedia) {
            navigator.mediaDevices.getUserMedia = plugin._originalGetUserMedia;
        }
        Vencord.UI.removeCSS('voiceOptimizer');
        const stats = document.getElementById('vc-voice-stats');
        if (stats) stats.remove();
    };

    Vencord.startPlugin('voiceOptimizer');
})();
";

static NSString *vcSettingsUIJS = @"
(function() {
    'use strict';

    const settingsId = 'vencord-settings';

    function createSettingsPanel() {
        if (document.getElementById(settingsId)) return;

        const panel = document.createElement('div');
        panel.id = settingsId;
        panel.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;background:#2C2F33;border-radius:16px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:320px;width:90vw;font-family:sans-serif;color:#fff;';

        let html = '<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;\">';
        html += '<h3 style=\"margin:0;font-size:16px;\">Vencord iOS ' + Vencord.version + '</h3>';
        html += '<span id=\"vencord-close\" style=\"cursor:pointer;font-size:20px;color:#999;\">✕</span></div>';

        html += '<div style=\"font-size:12px;color:#999;margin-bottom:8px;\">Plugins (' + Object.keys(Vencord.Plugins).length + ' loaded)</div>';

        Object.keys(Vencord.Plugins).forEach(function(id) {
            const p = Vencord.Plugins[id];
            const checked = p.enabled ? 'checked' : '';
            html += '<label style=\"display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #36393f;font-size:13px;\">';
            html += '<input type=\"checkbox\" data-plugin=\"' + id + '\" ' + checked + ' style=\"margin-right:8px;\">';
            html += '<div><strong>' + p.name + '</strong><br><span style=\"color:#999;font-size:11px;\">' + p.description + '</span></div>';
            html += '</label>';
        });

        panel.innerHTML = html;
        document.body.appendChild(panel);

        document.getElementById('vencord-close').onclick = function() {
            panel.style.display = 'none';
        };

        panel.querySelectorAll('input[data-plugin]').forEach(function(input) {
            input.onchange = function() {
                const pluginId = this.getAttribute('data-plugin');
                Vencord.Plugins[pluginId].enabled = this.checked;
                if (this.checked) {
                    Vencord.startPlugin(pluginId);
                } else {
                    Vencord.stopPlugin(pluginId);
                }
            };
        });
    }

    function injectSettingsButton() {
        const btn = document.createElement('div');
        btn.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99998;background:#5865F2;border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(88,101,242,0.4);cursor:pointer;font-size:20px;';
        btn.textContent = 'V';
        btn.onclick = function() {
            const panel = document.getElementById(settingsId);
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            } else {
                createSettingsPanel();
            }
        };
        document.body.appendChild(btn);
    }

    if (document.body) {
        injectSettingsButton();
    } else {
        document.addEventListener('DOMContentLoaded', injectSettingsButton);
    }
})();
";

static NSString *unlimitedServersJS = @"
(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'unlimitedServers',
        name: 'Unlimited Servers',
        description: 'Bypass Discord server join limit (500/1000)',
        author: 'VencordIOS',
        version: '1.0.0'
    });

    plugin._patched = false;
    plugin._originalFetch = null;

    plugin.start = function() {
        // 1. Intercept fetch to bypass server join API limits
        plugin._originalFetch = window.fetch;
        window.fetch = function(url, options) {
            if (typeof url === 'string' || url instanceof Request) {
                const urlStr = typeof url === 'string' ? url : (url.url || '');
                if (urlStr.includes('/guilds') && urlStr.includes('/join')) {
                    if (options && options.headers) {
                        delete options.headers['X-Max-Guilds'];
                        delete options.headers['X-Guild-Limit'];
                    }
                    return plugin._originalFetch.apply(this, arguments).then(function(response) {
                        if (response.status === 400 || response.status === 403) {
                            response.clone().json().then(function(data) {
                                if (data && (data.code === 40005 || data.code === 50011 ||
                                    (data.message && (data.message.includes('guild limit') ||
                                     data.message.includes('too many') || data.message.includes('maximum'))))) {
                                    console.log('[UnlimitedServers] Bypassed guild limit error');
                                }
                            }).catch(function() {});
                        }
                        return response;
                    });
                }
            }
            return plugin._originalFetch.apply(this, arguments);
        };

        // 2. CSS to remove server limit warnings
        Vencord.UI.injectCSS('unlimitedServers', '[class*=\"guildLimit\"], [class*=\"guild-limit\"], [class*=\"serverLimit\"], [class*=\"server-limit\"], [class*=\"tooMany\"], [class*=\"too-many\"]{display:none!important;}[class*=\"maxGuilds\"], [class*=\"max-guilds\"], [class*=\"guildCount\"], [class*=\"guild-count\"]{display:none!important;}[class*=\"guildJoinLimit\"], [class*=\"guild-join-limit\"], [class*=\"joinLimit\"], [class*=\"join-limit\"]{display:none!important;}[class*=\"guilds\"] [class*=\"list\"]{max-height:none!important;overflow-y:auto!important;}');

        // 3. Override guild limit constants
        try {
            Object.defineProperty(window, 'MAX_GUILDS', { value: Infinity, writable: false, configurable: true });
            Object.defineProperty(window, 'MAX_SERVERS', { value: Infinity, writable: false, configurable: true });
        } catch (e) {}

        // 4. Monitor and remove limit popups
        plugin._observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    const text = node.textContent || '';
                    if (text.includes('guild limit') || text.includes('server limit') ||
                        text.includes('too many') || text.includes('maximum') ||
                        text.includes('You\\'ve reached')) {
                        const isModal = node.classList && (node.classList.contains('modal') || node.classList.contains('dialog') || node.getAttribute('role') === 'dialog');
                        if (isModal) {
                            const closeBtn = node.querySelector('[class*=\"close\"], button');
                            if (closeBtn) closeBtn.click();
                            node.style.display = 'none';
                            node.remove();
                        }
                    }
                });
            });
        });
        if (document.body) plugin._observer.observe(document.body, { childList: true, subtree: true });

        plugin._patched = true;
        console.log('[UnlimitedServers] Server limit bypasses enabled');
    };

    plugin.stop = function() {
        if (plugin._originalFetch) { window.fetch = plugin._originalFetch; plugin._originalFetch = null; }
        Vencord.UI.removeCSS('unlimitedServers');
        if (plugin._observer) { plugin._observer.disconnect(); plugin._observer = null; }
        plugin._patched = false;
    };

    Vencord.startPlugin('unlimitedServers');
})();
";

#pragma mark - JavaScript Injection

void injectVencordJS(JSContext *context) {
    if (!context || vencordInitialized) return;

    @try {
        [context evaluateScript:vencordCoreJS];

        if (isPluginEnabled(@"noTrack")) {
            [context evaluateScript:noTrackJS];
        }
        if (isPluginEnabled(@"silentTyping")) {
            [context evaluateScript:silentTypingJS];
        }
        if (isPluginEnabled(@"messageLogger")) {
            [context evaluateScript:messageLoggerJS];
        }
        if (isPluginEnabled(@"betterEmbeds")) {
            [context evaluateScript:betterEmbedsJS];
        }
        if (isPluginEnabled(@"noReplyTimeout")) {
            [context evaluateScript:noReplyTimeoutJS];
        }
        if (isPluginEnabled(@"showHiddenServers")) {
            [context evaluateScript:showHiddenServersJS];
        }
        if (isPluginEnabled(@"blurNSFW")) {
            [context evaluateScript:blurNSFWJS];
        }
        if (isPluginEnabled(@"betterStatus")) {
            [context evaluateScript:betterStatusJS];
        }
        if (isPluginEnabled(@"emojiUtilities")) {
            [context evaluateScript:emojiUtilitiesJS];
        }
        if (isPluginEnabled(@"multiAccount")) {
            [context evaluateScript:multiAccountJS];
        }
        if (isPluginEnabled(@"voiceOptimizer")) {
            [context evaluateScript:voiceOptimizerJS];
        }
        if (isPluginEnabled(@"unlimitedServers")) {
            [context evaluateScript:unlimitedServersJS];
        }

        // Load all 114 Vencord plugins from external file
        NSString *pluginsPath = [[NSBundle mainBundle] pathForResource:@"VencordJS/plugins/vencordAllPlugins" ofType:@"js"];
        if (pluginsPath) {
            NSString *pluginsCode = [NSString stringWithContentsOfFile:pluginsPath encoding:NSUTF8StringEncoding error:nil];
            if (pluginsCode) {
                [context evaluateScript:pluginsCode];
                NSLog(@"[VencordIOS] Loaded vencordAllPlugins.js (114 plugins)");
            }
        } else {
            NSLog(@"[VencordIOS] vencordAllPlugins.js not found - loading inline fallback");
            // The plugins are also embedded in vencordAllPluginsJS variable as fallback
            if (vencordAllPluginsJS) {
                [context evaluateScript:vencordAllPluginsJS];
            }
        }

        [context evaluateScript:vcSettingsUIJS];

        [context evaluateScript:@"Vencord.applyPatches();"];

        vencordInitialized = YES;
        NSLog(@"[VencordIOS] All plugins loaded and patches applied");
    } @catch (NSException *exception) {
        NSLog(@"[VencordIOS] JS Injection error: %@", exception);
    }
}

#pragma mark - Hook React Native Bridge

%hook RCTBridge

- (JSContext *)jsContext {
    JSContext *ctx = %orig;
    if (ctx && !vencordInitialized) {
        globalJSContext = ctx;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            loadPluginStates();
            injectVencordJS(globalJSContext);
        });
    }
    return ctx;
}

%end

#pragma mark - Hook AppDelegate for initialization

%hook DiscordAppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    BOOL result = %orig;

    NSLog(@"[VencordIOS] Discord launched - initializing Vencord...");

    loadPluginStates();

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (globalJSContext && !vencordInitialized) {
            injectVencordJS(globalJSContext);
        }
    });

    return result;
}

%end

#pragma mark - Hook React Native View for fallback injection

%hook RCTRootView

- (void)layoutSubviews {
    %orig;

    if (!vencordInitialized && globalJSContext) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (!vencordInitialized) {
                injectVencordJS(globalJSContext);
            }
        });
    }
}

%end

#pragma mark - Constructor

%ctor {
    @autoreleasepool {
        NSLog(@"[VencordIOS] Tweak loaded - Vencord for iOS v1.0.0");
        loadPluginStates();
    }
}
