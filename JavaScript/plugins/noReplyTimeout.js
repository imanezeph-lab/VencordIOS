/**
 * No Reply Timeout Plugin
 * Reply chains never get automatically collapsed
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'noReplyTimeout',
        name: 'No Reply Timeout',
        description: 'Prevents reply threads from collapsing automatically',
        author: 'VencordIOS',
        version: '1.0.0',

        _observer: null,

        start: function() {
            const self = this;

            // CSS to prevent collapse
            Vencord.UI.injectCSS('noReplyTimeout', `
                [class*="reply"] [class*="header"] {
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                }
                [class*="thread"] [class*="header"] {
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                }
            `);

            // Observer to prevent collapse animations
            this._observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
                        const target = mutation.target;
                        if (target.classList && 
                            (target.classList.contains('collapsed') || 
                             target.classList.contains('hidden'))) {
                            target.classList.remove('collapsed', 'hidden');
                        }
                    }
                });
            });

            if (document.querySelector('[class*="messages"]')) {
                this._observer.observe(document.querySelector('[class*="messages"]'), {
                    attributes: true,
                    attributeFilter: ['class', 'style'],
                    subtree: true
                });
            }

            Vencord.Logger.log('NoReplyTimeout', 'Reply collapse prevention enabled');
        },

        stop: function() {
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }
            Vencord.UI.removeCSS('noReplyTimeout');
            Vencord.Logger.log('NoReplyTimeout', 'Plugin stopped');
        }
    });
})();
