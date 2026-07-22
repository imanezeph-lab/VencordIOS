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
