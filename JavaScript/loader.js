/**
 * Vencord iOS - Main Loader
 * Injects the Vencord framework into Discord's React Native runtime
 */

(function() {
    'use strict';

    if (window._vencordLoaded) return;
    window._vencordLoaded = true;

    console.log('[Vencord] Loader executing...');

    // Core framework
    window.Vencord = window.Vencord || {};
    window.Vencord.version = '1.0.0-iOS';
    window.Vencord.platform = 'ios';
    window.Vencord.buildDate = new Date().toISOString();

    // Plugin registry
    window.Vencord.Plugins = {};
    window.Vencord.pluginOrder = [];

    // Settings
    window.Vencord.Settings = {
        noTrack: true,
        silentTyping: false,
        showHiddenServers: true,
        forceDarkMode: false,
        noReplyTimeout: true,
        alwaysExpandEmbeds: true,
        blurNSFW: false,
        messageLogger: false,
        emojiUtilities: true,
        betterStatus: true,
        customCSS: ''
    };

    // Logger utility
    window.Vencord.Logger = {
        log: function(tag, ...args) {
            console.log(`[Vencord:${tag}]`, ...args);
        },
        warn: function(tag, ...args) {
            console.warn(`[Vencord:${tag}]`, ...args);
        },
        error: function(tag, ...args) {
            console.error(`[Vencord:${tag}]`, ...args);
        }
    };

    // Plugin registration
    window.Vencord.registerPlugin = function(config) {
        if (typeof config === 'string') {
            // Legacy format
            config = {
                id: arguments[0],
                name: arguments[1],
                description: arguments[2],
                author: arguments[3],
                version: arguments[4]
            };
        }

        if (!config.id) throw new Error('Plugin must have an id');

        const plugin = {
            id: config.id,
            name: config.name || config.id,
            description: config.description || '',
            author: config.author || 'Unknown',
            version: config.version || '1.0.0',
            settings: config.settings || {},
            patches: config.patches || [],
            enabled: config.enabled !== false,
            start: config.start || function() {},
            stop: config.stop || function() {},
            requires: config.requires || [],
            dependencies: config.dependencies || []
        };

        window.Vencord.Plugins[config.id] = plugin;
        window.Vencord.pluginOrder.push(config.id);

        window.Vencord.Logger.log('Registry', `Registered: ${plugin.name} (${plugin.id})`);
        return plugin;
    };

    // Plugin lifecycle
    window.Vencord.startPlugin = function(id) {
        const plugin = window.Vencord.Plugins[id];
        if (!plugin) {
            window.Vencord.Logger.warn('Lifecycle', `Plugin ${id} not found`);
            return false;
        }

        if (!plugin.enabled) return false;

        try {
            plugin.start();
            window.Vencord.Logger.log('Lifecycle', `Started: ${plugin.name}`);
            return true;
        } catch (e) {
            window.Vencord.Logger.error('Lifecycle', `Failed to start ${plugin.name}:`, e);
            return false;
        }
    };

    window.Vencord.stopPlugin = function(id) {
        const plugin = window.Vencord.Plugins[id];
        if (!plugin) return false;

        try {
            plugin.stop();
            window.Vencord.Logger.log('Lifecycle', `Stopped: ${plugin.name}`);
            return true;
        } catch (e) {
            window.Vencord.Logger.error('Lifecycle', `Failed to stop ${plugin.name}:`, e);
            return false;
        }
    };

    window.Vencord.togglePlugin = function(id) {
        const plugin = window.Vencord.Plugins[id];
        if (!plugin) return;

        plugin.enabled = !plugin.enabled;

        if (plugin.enabled) {
            window.Vencord.startPlugin(id);
        } else {
            window.Vencord.stopPlugin(id);
        }

        window.Vencord.Logger.log('Lifecycle', `Toggled ${plugin.name}: ${plugin.enabled ? 'ON' : 'OFF'}`);
    };

    // Patch system
    window.Vencord.createPatch = function(id, target, replacement, description) {
        return {
            pluginId: id,
            target: target,
            replacement: replacement,
            description: description || '',
            active: false
        };
    };

    window.Vencord.applyPatches = function() {
        let patchCount = 0;

        window.Vencord.pluginOrder.forEach(function(id) {
            const plugin = window.Vencord.Plugins[id];
            if (!plugin || !plugin.enabled || !plugin.patches) return;

            plugin.patches.forEach(function(patch) {
                try {
                    if (typeof patch.replacement === 'function') {
                        patch.active = true;
                        patchCount++;
                    }
                } catch (e) {
                    window.Vencord.Logger.error('Patches', `Failed in ${plugin.name}:`, e);
                }
            });
        });

        window.Vencord.Logger.log('Patches', `Applied ${patchCount} patches`);
    };

    // Settings management
    window.Vencord.getSetting = function(key) {
        return window.Vencord.Settings[key];
    };

    window.Vencord.updateSetting = function(key, value) {
        window.Vencord.Settings[key] = value;
        window.Vencord.Logger.log('Settings', `${key} = ${value}`);
        window.Vencord.saveSettings();
    };

    window.Vencord.saveSettings = function() {
        try {
            const data = JSON.stringify(window.Vencord.Settings);
            localStorage.setItem('vencord_settings', data);
        } catch (e) {
            window.Vencord.Logger.error('Settings', 'Failed to save:', e);
        }
    };

    window.Vencord.loadSettings = function() {
        try {
            const data = localStorage.getItem('vencord_settings');
            if (data) {
                Object.assign(window.Vencord.Settings, JSON.parse(data));
            }
        } catch (e) {
            window.Vencord.Logger.error('Settings', 'Failed to load:', e);
        }
    };

    // Utility functions
    window.Vencord.Utils = {
        sleep: function(ms) {
            return new Promise(function(resolve) { setTimeout(resolve, ms); });
        },

        waitForElement: function(selector, timeout) {
            timeout = timeout || 10000;
            return new Promise(function(resolve, reject) {
                const el = document.querySelector(selector);
                if (el) return resolve(el);

                const observer = new MutationObserver(function() {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                setTimeout(function() {
                    observer.disconnect();
                    reject(new Error('Timeout waiting for: ' + selector));
                }, timeout);
            });
        },

        findAllElements: function(selector) {
            return Array.from(document.querySelectorAll(selector));
        },

        createElement: function(tag, attrs, text) {
            const el = document.createElement(tag);
            if (attrs) {
                Object.keys(attrs).forEach(function(key) {
                    el.setAttribute(key, attrs[key]);
                });
            }
            if (text) el.textContent = text;
            return el;
        }
    };

    // Initialize
    window.Vencord.loadSettings();
    window.Vencord.Logger.log('Init', `Vencord iOS ${window.Vencord.version} loaded`);

    window._vencordReady = true;
    window.dispatchEvent(new CustomEvent('vencord:ready'));
})();
