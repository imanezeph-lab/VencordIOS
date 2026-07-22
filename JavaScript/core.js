/**
 * Vencord iOS - Core Module
 * Essential utilities and Discord API access
 */

(function() {
    'use strict';

    if (!window._vencordReady) {
        console.error('[Vencord:Core] Loader not ready');
        return;
    }

    // Discord module finder
    window.Vencord.Discord = {
        _modules: {},
        _initialized: false,

        initialize: function() {
            if (this._initialized) return;

            // Try to find Discord's internal modules
            const webpackChunks = window.webpackChunkdiscord_app || window.webpackChunkdiscord || [];
            const require = window.webpackChunkdiscord_app;

            this._initialized = true;
            Vencord.Logger.log('Discord', 'Discord module finder initialized');
        },

        getModule: function(filter) {
            // Placeholder for webpack module finder
            return null;
        },

        getAllModules: function(filter) {
            return [];
        }
    };

    // Message utilities
    window.Vencord.Messages = {
        _cache: [],

        cacheMessage: function(message) {
            this._cache.push({
                id: message.id,
                content: message.content,
                author: message.author,
                timestamp: message.timestamp,
                edited: message.editedTimestamp !== null
            });

            // Keep cache size manageable
            if (this._cache.length > 1000) {
                this._cache = this._cache.slice(-500);
            }
        },

        getEditedMessages: function() {
            return this._cache.filter(function(m) { return m.edited; });
        },

        findMessage: function(id) {
            return this._cache.find(function(m) { return m.id === id; });
        },

        clearCache: function() {
            this._cache = [];
        }
    };

    // UI utilities
    window.Vencord.UI = {
        showToast: function(message, type) {
            type = type || 'info';
            const colors = {
                info: '#5865F2',
                success: '#57F287',
                warning: '#FEE75C',
                error: '#ED4245'
            };

            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 50px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 100001;
                background: ${colors[type] || colors.info};
                color: ${type === 'warning' ? '#000' : '#fff'};
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: vencord-toast-in 0.3s ease;
                font-family: -apple-system, sans-serif;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);

            setTimeout(function() {
                toast.style.animation = 'vencord-toast-out 0.3s ease';
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        },

        addStyles: function(css) {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
            return style;
        },

        injectCSS: function(id, css) {
            // Remove existing
            const existing = document.getElementById('vencord-css-' + id);
            if (existing) existing.remove();

            const style = document.createElement('style');
            style.id = 'vencord-css-' + id;
            style.textContent = css;
            document.head.appendChild(style);
            return style;
        },

        removeCSS: function(id) {
            const existing = document.getElementById('vencord-css-' + id);
            if (existing) existing.remove();
        }
    };

    // Toast animation CSS
    Vencord.UI.addStyles(`
        @keyframes vencord-toast-in {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes vencord-toast-out {
            from { opacity: 1; transform: translateX(-50%) translateY(0); }
            to { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
    `);

    // Event system
    window.Vencord.Events = {
        _listeners: {},

        on: function(event, callback) {
            if (!this._listeners[event]) this._listeners[event] = [];
            this._listeners[event].push(callback);
        },

        off: function(event, callback) {
            if (!this._listeners[event]) return;
            this._listeners[event] = this._listeners[event].filter(function(cb) {
                return cb !== callback;
            });
        },

        emit: function(event, data) {
            if (!this._listeners[event]) return;
            this._listeners[event].forEach(function(callback) {
                try {
                    callback(data);
                } catch (e) {
                    Vencord.Logger.error('Events', `Error in ${event} handler:`, e);
                }
            });
        }
    };

    Vencord.Logger.log('Core', 'Core module loaded');
})();
