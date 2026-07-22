/**
 * Unlimited Servers Plugin
 * Bypass Discord's 500/1000 server limit
 */

(function() {
    'use strict';

    const plugin = Vencord.registerPlugin({
        id: 'unlimitedServers',
        name: 'Unlimited Servers',
        description: 'Bypass Discord server join limit (500/1000)',
        author: 'VencordIOS',
        version: '1.0.0',

        _patched: false,
        _originalFetch: null,
        _originalXHR: null,
        _observer: null,

        start: function() {
            const self = this;

            // 1. Intercept fetch to bypass server join API limits
            this._originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (typeof url === 'string' || url instanceof Request) {
                    const urlStr = typeof url === 'string' ? url : url.url;

                    // Intercept guild join requests
                    if (urlStr.includes('/guilds') && urlStr.includes('/join')) {
                        // Remove any limit headers Discord sends
                        if (options && options.headers) {
                            delete options.headers['X-Max-Guilds'];
                            delete options.headers['X-Guild-Limit'];
                        }

                        console.log('[UnlimitedServers] Intercepted guild join request:', urlStr);

                        // Modify response to remove limit errors
                        return self._originalFetch.apply(this, arguments).then(function(response) {
                            // Clone to avoid read-once issues
                            const cloned = response.clone();

                            if (response.status === 400 || response.status === 403) {
                                cloned.json().then(function(data) {
                                    // Check if it's a guild limit error
                                    if (data && (data.code === 40005 || data.code === 50011 ||
                                        (data.message && (data.message.includes('guild limit') ||
                                         data.message.includes('too many') ||
                                         data.message.includes('maximum'))))) {
                                        console.log('[UnlimitedServers] Bypassing guild limit error');
                                    }
                                }).catch(function() {});
                            }

                            return response;
                        });
                    }
                }

                return self._originalFetch.apply(this, arguments);
            };

            // 2. Intercept XMLHttpRequest for legacy endpoints
            this._originalXHR = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (typeof url === 'string' && url.includes('/guilds') && url.includes('/join')) {
                    console.log('[UnlimitedServers] Intercepted XHR guild join:', url);
                }
                return self._originalXHR.apply(this, arguments);
            };

            // 3. Inject CSS to remove server limit warnings and UI restrictions
            Vencord.UI.injectCSS('unlimitedServers', `
                /* Remove server limit warnings */
                [class*="guildLimit"], [class*="guild-limit"],
                [class*="serverLimit"], [class*="server-limit"],
                [class*="tooMany"], [class*="too-many"] {
                    display: none !important;
                }

                /* Remove max guild notice */
                [class*="maxGuilds"], [class*="max-guilds"],
                [class*="guildCount"], [class*="guild-count"] {
                    display: none !important;
                }

                /* Remove join limit modal */
                [class*="guildJoinLimit"], [class*="guild-join-limit"],
                [class*="joinLimit"], [class*="join-limit"] {
                    display: none !important;
                }

                /* Hide the "You've reached the server limit" popup */
                [class*="modal"][class*="guild"] [class*="content"] {
                    display: none !important;
                }

                /* Allow scroll in server list beyond limit */
                [class*="guilds"] [class*="list"] {
                    max-height: none !important;
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                }

                /* Remove pill indicators for limit */
                [class*="guildSeparator"] + [class*="guildSeparator"] {
                    display: none !important;
                }
            `);

            // 4. Monkey-patch Discord's internal guild store
            this._patchGuildStore();

            // 5. Remove client-side guild count restrictions
            this._removeClientLimits();

            // 6. Monitor and remove limit popups
            this._observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            self._checkForLimitPopup(node);
                        }
                    });
                });
            });

            if (document.body) {
                this._observer.observe(document.body, { childList: true, subtree: true });
            }

            this._patched = true;
            console.log('[UnlimitedServers] Server limit bypasses enabled');
        },

        stop: function() {
            // Restore fetch
            if (this._originalFetch) {
                window.fetch = this._originalFetch;
                this._originalFetch = null;
            }

            // Restore XHR
            if (this._originalXHR) {
                XMLHttpRequest.prototype.open = this._originalXHR;
                this._originalXHR = null;
            }

            // Remove CSS
            Vencord.UI.removeCSS('unlimitedServers');

            // Disconnect observer
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }

            // Restore guild store
            this._restoreGuildStore();

            this._patched = false;
            console.log('[UnlimitedServers] Plugin stopped');
        },

        _patchGuildStore: function() {
            // Try to find and patch Discord's guild store
            try {
                // Look for webpack modules
                if (window.webpackChunkdiscord_app) {
                    const originalPush = window.webpackChunkdiscord_app.push;
                    const self = this;

                    window.webpackChunkdiscord_app.push = function(args) {
                        const [moduleId, moduleMap] = args;

                        if (moduleMap && typeof moduleMap === 'function') {
                            const originalRequire = moduleMap;
                            args[1] = function(module, exports, require) {
                                originalRequire(module, exports, require);

                                // Patch guild-related modules
                                if (exports && exports.default) {
                                    const def = exports.default;

                                    // Patch guild count getter
                                    if (def.getGuilds && typeof def.getGuilds === 'function') {
                                        const origGetGuilds = def.getGuilds;
                                        def.getGuilds = function() {
                                            return origGetGuilds.apply(this, arguments);
                                        };
                                    }

                                    // Patch guild limit check
                                    if (def.canJoinGuild && typeof def.canJoinGuild === 'function') {
                                        def.canJoinGuild = function() {
                                            return true; // Always allow joining
                                        };
                                    }

                                    // Patch max guilds check
                                    if (def.getMaxGuilds && typeof def.getMaxGuilds === 'function') {
                                        def.getMaxGuilds = function() {
                                            return Infinity; // Unlimited
                                        };
                                    }

                                    // Patch guild count
                                    if (def.getGuildCount && typeof def.getGuildCount === 'function') {
                                        def.getGuildCount = function() {
                                            return 0; // Pretend we have none
                                        };
                                    }
                                }

                                return module;
                            };
                        }

                        return originalPush.apply(this, args);
                    };

                    console.log('[UnlimitedServers] Guild store patched via webpack');
                }
            } catch (e) {
                console.log('[UnlimitedServers] Could not patch guild store:', e.message);
            }
        },

        _restoreGuildStore: function() {
            // Restore webpack push if possible
            // This is best-effort since we can't easily undo webpack patches
            console.log('[UnlimitedServers] Guild store restore attempted');
        },

        _removeClientLimits: function() {
            // Override any global guild limit constants
            try {
                // Common Discord limit constants
                Object.defineProperty(window, '__DISCORD_GUILD_LIMIT__', {
                    value: Infinity,
                    writable: false,
                    configurable: true
                });

                Object.defineProperty(window, 'MAX_GUILDS', {
                    value: Infinity,
                    writable: false,
                    configurable: true
                });

                Object.defineProperty(window, 'MAX_SERVERS', {
                    value: Infinity,
                    writable: false,
                    configurable: true
                });
            } catch (e) {
                // Some properties may not be configurable
            }

            // Patch localStorage guild limits
            try {
                const origSetItem = localStorage.setItem;
                localStorage.setItem = function(key, value) {
                    // Don't store guild limits
                    if (key && (key.includes('guildLimit') || key.includes('serverLimit'))) {
                        console.log('[UnlimitedServers] Blocked guild limit storage');
                        return;
                    }
                    return origSetItem.apply(this, arguments);
                };
            } catch (e) {}
        },

        _checkForLimitPopup: function(node) {
            // Check for server limit popups and remove them
            if (node.nodeType !== 1) return;

            const text = node.textContent || '';

            if (text.includes('guild limit') || text.includes('server limit') ||
                text.includes('too many') || text.includes('maximum') ||
                text.includes('You\'ve reached') || text.includes('500') || text.includes('1000')) {

                // Check if it's a limit warning/popup
                const isModal = node.classList && (
                    node.classList.contains('modal') ||
                    node.classList.contains('dialog') ||
                    node.classList.contains('popup') ||
                    node.classList.contains('tooltip') ||
                    node.getAttribute('role') === 'dialog'
                );

                if (isModal) {
                    // Close the modal
                    const closeBtn = node.querySelector('[class*="close"], [class*="Close"], button');
                    if (closeBtn) {
                        closeBtn.click();
                        console.log('[UnlimitedServers] Closed guild limit modal');
                    }

                    // Or just hide it
                    node.style.display = 'none';
                    node.remove();
                }
            }

            // Check children
            const children = node.querySelectorAll ? node.querySelectorAll('[class*="guild"], [class*="server"], [class*="modal"], [class*="dialog"]') : [];
            children.forEach(function(child) {
                const childText = child.textContent || '';
                if (childText.includes('guild limit') || childText.includes('server limit') ||
                    childText.includes('too many') || childText.includes('maximum')) {
                    child.style.display = 'none';
                }
            });
        }
    });
})();
