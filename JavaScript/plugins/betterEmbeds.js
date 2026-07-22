/**
 * Better Embeds Plugin
 * Always expand embeds and improve their rendering
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'betterEmbeds',
        name: 'Better Embeds',
        description: 'Auto-expand embeds and improve link preview rendering',
        author: 'VencordIOS',
        version: '1.0.0',

        _observer: null,

        start: function() {
            const self = this;

            // CSS improvements
            Vencord.UI.injectCSS('betterEmbeds', `
                .vc-embed-expanded .embed {
                    max-height: none !important;
                    overflow: visible !important;
                }
                .embed-wrapper {
                    max-width: 520px !important;
                }
                .vc-embed-image {
                    max-height: 400px !important;
                    object-fit: contain !important;
                }
            `);

            // Auto-expand embeds
            this._observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) {
                            self._expandEmbeds(node);
                        }
                    });
                });
            });

            if (document.querySelector('[class*="messages"]')) {
                this._observer.observe(document.querySelector('[class*="messages"]'), {
                    childList: true,
                    subtree: true
                });
            }

            // Initial expand
            this._expandAllEmbeds();

            Vencord.Logger.log('BetterEmbeds', 'Embed auto-expand enabled');
        },

        _expandEmbeds: function(container) {
            const embeds = container.querySelectorAll ? 
                container.querySelectorAll('.embed-wrapper, [class*="embed"]') : [];

            embeds.forEach(function(embed) {
                embed.classList.add('vc-embed-expanded');
            });
        },

        _expandAllEmbeds: function() {
            const embeds = document.querySelectorAll('.embed-wrapper, [class*="embed"]');
            embeds.forEach(function(embed) {
                embed.classList.add('vc-embed-expanded');
            });
        },

        stop: function() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            Vencord.UI.removeCSS('betterEmbeds');

            // Remove expanded class
            document.querySelectorAll('.vc-embed-expanded').forEach(function(el) {
                el.classList.remove('vc-embed-expanded');
            });

            Vencord.Logger.log('BetterEmbeds', 'Plugin stopped');
        }
    });
})();
