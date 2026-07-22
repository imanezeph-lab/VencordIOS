/**
 * Show Hidden Servers Plugin
 * Reveals servers that are hidden from the server list
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'showHiddenServers',
        name: 'Show Hidden Servers',
        description: 'Shows servers hidden from the server list',
        author: 'VencordIOS',
        version: '1.0.0',

        start: function() {
            // CSS to show hidden elements
            Vencord.UI.injectCSS('showHiddenServers', `
                [class*="guild"] {
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                    position: relative !important;
                }
                [class*="sidebar"] [class*="list"] {
                    overflow: visible !important;
                    max-height: none !important;
                }
                [class*="pill"] {
                    display: block !important;
                }
            `);

            Vencord.Logger.log('ShowHiddenServers', 'Hidden servers will be revealed');
        },

        stop: function() {
            Vencord.UI.removeCSS('showHiddenServers');
            Vencord.Logger.log('ShowHiddenServers', 'Plugin stopped');
        }
    });
})();
