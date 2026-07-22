/**
 * No Track Plugin
 * Blocks Discord analytics, tracking, and telemetry
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'noTrack',
        name: 'No Track',
        description: 'Blocks Discord analytics and tracking requests',
        author: 'VencordIOS',
        version: '1.0.0',

        start: function() {
            // Block analytics endpoints
            const blockedPatterns = [
                '/analytics',
                '/tracking',
                '/telemetry',
                '/metrics',
                '/amplitude',
                '/sentry',
                'bugsnag',
                'segment.io',
                'mixpanel',
                'datadoghq'
            ];

            // Intercept fetch
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (typeof url === 'string') {
                    for (let i = 0; i < blockedPatterns.length; i++) {
                        if (url.includes(blockedPatterns[i])) {
                            Vencord.Logger.log('NoTrack', 'Blocked fetch:', url);
                            return Promise.resolve(new Response('{}'));
                        }
                    }
                }
                return originalFetch.apply(this, arguments);
            };

            // Intercept XMLHttpRequest
            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (typeof url === 'string') {
                    for (let i = 0; i < blockedPatterns.length; i++) {
                        if (url.includes(blockedPatterns[i])) {
                            Vencord.Logger.log('NoTrack', 'Blocked XHR:', url);
                            return;
                        }
                    }
                }
                return originalXHROpen.apply(this, arguments);
            };

            // Block image tracking pixels
            const originalImage = window.Image;
            window.Image = function() {
                const img = new originalImage();
                const originalSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

                Object.defineProperty(img, 'src', {
                    get: function() {
                        return originalSrc.get.call(this);
                    },
                    set: function(value) {
                        for (let i = 0; i < blockedPatterns.length; i++) {
                            if (value && value.includes(blockedPatterns[i])) {
                                Vencord.Logger.log('NoTrack', 'Blocked pixel:', value);
                                return;
                            }
                        }
                        originalSrc.set.call(this, value);
                    }
                });

                return img;
            };

            Vencord.Logger.log('NoTrack', 'Analytics blocking enabled');
        },

        stop: function() {
            Vencord.Logger.log('NoTrack', 'Plugin stopped (page refresh required for full reset)');
        }
    });
})();
