(function() {
    'use strict';
    window.__vencordShowSettings = false;
    if (window.Vencord) {
        window.Vencord._settingsRequested = false;
        window.Vencord.requestSettings = function() {
            window.__vencordShowSettings = true;
        };
    }
})();
