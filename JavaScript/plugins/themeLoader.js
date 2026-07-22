/**
 * Theme Loader Plugin
 * Load and apply custom CSS themes
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'themeLoader',
        name: 'Theme Loader',
        description: 'Load and apply custom CSS themes',
        author: 'VencordIOS',
        version: '1.0.0',

        _currentTheme: null,

        start: function() {
            this._loadSavedTheme();
            Vencord.Logger.log('ThemeLoader', 'Theme system ready');
        },

        applyTheme: function(css) {
            if (this._currentTheme) {
                this._currentTheme.remove();
            }

            this._currentTheme = document.createElement('style');
            this._currentTheme.id = 'vencord-custom-theme';
            this._currentTheme.textContent = css;
            document.head.appendChild(this._currentTheme);

            localStorage.setItem('vencord_theme', css);
            Vencord.Logger.log('ThemeLoader', 'Theme applied');
        },

        removeTheme: function() {
            if (this._currentTheme) {
                this._currentTheme.remove();
                this._currentTheme = null;
            }
            localStorage.removeItem('vencord_theme');
            Vencord.Logger.log('ThemeLoader', 'Theme removed');
        },

        _loadSavedTheme: function() {
            const saved = localStorage.getItem('vencord_theme');
            if (saved) {
                this.applyTheme(saved);
            }
        },

        stop: function() {
            this.removeTheme();
            Vencord.Logger.log('ThemeLoader', 'Plugin stopped');
        }
    });
})();
