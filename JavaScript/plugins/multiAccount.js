/**
 * Multi Account Switcher Plugin
 * Switch between Discord accounts without logging out
 */

(function() {
    'use strict';

    Vencord.registerPlugin({
        id: 'multiAccount',
        name: 'Multi Account Switcher',
        description: 'Switch between accounts without logging out',
        author: 'VencordIOS',
        version: '1.0.0',

        _accounts: [],
        _currentAccount: null,
        _storageKey: 'vencord_accounts',
        _active: false,

        start: function() {
            this._loadAccounts();
            this._injectUI();

            Vencord.Logger.log('MultiAccount', `Loaded ${this._accounts.length} accounts`);
        },

        stop: function() {
            this._removeUI();
            Vencord.Logger.log('MultiAccount', 'Plugin stopped');
        },

        // ============ Account Storage ============

        _loadAccounts: function() {
            try {
                const data = localStorage.getItem(this._storageKey);
                if (data) {
                    this._accounts = JSON.parse(data);
                }
            } catch (e) {
                this._accounts = [];
            }
        },

        _saveAccounts: function() {
            try {
                localStorage.setItem(this._storageKey, JSON.stringify(this._accounts));
            } catch (e) {
                Vencord.Logger.error('MultiAccount', 'Failed to save accounts:', e);
            }
        },

        _getCurrentToken: function() {
            try {
                const token = localStorage.getItem('token');
                return token ? token.replace(/"/g, '') : null;
            } catch (e) {
                return null;
            }
        },

        _getAccountId: function() {
            try {
                const user = window._vc_currentUser || {};
                return user.id || user.username || 'unknown';
            } catch (e) {
                return 'unknown';
            }
        },

        _getUsername: function() {
            try {
                const user = window._vc_currentUser || {};
                return user.username || 'Unknown';
            } catch (e) {
                return 'Unknown';
            }
        },

        _getAvatar: function() {
            try {
                const user = window._vc_currentUser || {};
                if (user.avatar) {
                    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
                }
                return null;
            } catch (e) {
                return null;
            }
        },

        // ============ Account Management ============

        saveCurrentAccount: function(label) {
            const token = this._getCurrentToken();
            const accountId = this._getAccountId();
            const username = this._getUsername();
            const avatar = this._getAvatar();

            if (!token) {
                Vencord.UI.showToast('No token found to save', 'error');
                return false;
            }

            // Check if account already saved
            const existing = this._accounts.find(function(a) { return a.id === accountId; });

            if (existing) {
                existing.token = token;
                existing.username = username;
                existing.avatar = avatar;
                existing.label = label || username;
                existing.lastUsed = Date.now();
            } else {
                this._accounts.push({
                    id: accountId,
                    token: token,
                    username: username,
                    avatar: avatar,
                    label: label || username,
                    savedAt: Date.now(),
                    lastUsed: Date.now()
                });
            }

            this._saveAccounts();
            this._refreshPanel();

            Vencord.UI.showToast(`Saved account: ${username}`, 'success');
            Vencord.Logger.log('MultiAccount', `Saved account: ${username} (${accountId})`);
            return true;
        },

        removeAccount: function(accountId) {
            const index = this._accounts.findIndex(function(a) { return a.id === accountId; });
            if (index !== -1) {
                const removed = this._accounts.splice(index, 1)[0];
                this._saveAccounts();
                this._refreshPanel();
                Vencord.UI.showToast(`Removed: ${removed.username}`, 'info');
                Vencord.Logger.log('MultiAccount', `Removed account: ${removed.username}`);
            }
        },

        switchToAccount: function(accountId) {
            const account = this._accounts.find(function(a) { return a.id === accountId; });
            if (!account) {
                Vencord.UI.showToast('Account not found', 'error');
                return;
            }

            // Store the target token
            const targetToken = account.token;

            // Show loading state
            Vencord.UI.showToast(`Switching to ${account.username}...`, 'info');

            // Clear current token and set new one
            try {
                localStorage.setItem('token', JSON.stringify(targetToken));

                // Update last used
                account.lastUsed = Date.now();
                this._saveAccounts();

                // Reload Discord to apply new token
                setTimeout(function() {
                    location.reload();
                }, 500);

            } catch (e) {
                Vencord.UI.showToast('Failed to switch account', 'error');
                Vencord.Logger.error('MultiAccount', 'Switch failed:', e);
            }
        },

        exportAccounts: function() {
            const data = JSON.stringify(this._accounts, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'vencord_accounts_' + Date.now() + '.json';
            a.click();

            URL.revokeObjectURL(url);
            Vencord.UI.showToast('Accounts exported', 'success');
        },

        importAccounts: function(jsonString) {
            try {
                const imported = JSON.parse(jsonString);
                if (Array.isArray(imported)) {
                    imported.forEach(function(account) {
                        if (account.token && account.username) {
                            const existing = this._accounts.find(function(a) { return a.id === account.id; });
                            if (!existing) {
                                this._accounts.push(account);
                            }
                        }
                    }.bind(this));

                    this._saveAccounts();
                    this._refreshPanel();
                    Vencord.UI.showToast(`Imported ${imported.length} accounts`, 'success');
                }
            } catch (e) {
                Vencord.UI.showToast('Invalid import data', 'error');
            }
        },

        // ============ UI ============

        _injectUI: function() {
            const self = this;

            // Add CSS
            Vencord.UI.injectCSS('multiAccount', `
                #vc-account-switcher {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 100002;
                    display: none;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                #vc-account-switcher.active {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                #vc-account-switcher-bg {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.7);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }

                #vc-account-switcher-panel {
                    position: relative;
                    background: #36393f;
                    border-radius: 16px;
                    width: 90vw;
                    max-width: 400px;
                    max-height: 80vh;
                    overflow: hidden;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                }

                #vc-account-switcher-header {
                    background: linear-gradient(135deg, #5865F2, #EB459E);
                    padding: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                #vc-account-switcher-header h2 {
                    margin: 0;
                    color: white;
                    font-size: 18px;
                    font-weight: 600;
                }

                #vc-account-switcher-header p {
                    margin: 4px 0 0;
                    color: rgba(255,255,255,0.8);
                    font-size: 12px;
                }

                .vc-as-close {
                    width: 32px;
                    height: 32px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: white;
                    font-size: 18px;
                    border: none;
                    transition: background 0.2s;
                }

                .vc-as-close:hover {
                    background: rgba(255,255,255,0.3);
                }

                #vc-account-switcher-body {
                    overflow-y: auto;
                    flex: 1;
                    padding: 12px;
                }

                #vc-account-switcher-current {
                    padding: 16px;
                    background: #2f3136;
                    border-radius: 12px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                #vc-account-switcher-current .avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: #5865F2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 20px;
                    font-weight: 600;
                    flex-shrink: 0;
                    overflow: hidden;
                }

                #vc-account-switcher-current .avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                #vc-account-switcher-current .info {
                    flex: 1;
                    min-width: 0;
                }

                #vc-account-switcher-current .info .label {
                    font-size: 10px;
                    color: #5865F2;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }

                #vc-account-switcher-current .info .name {
                    font-size: 16px;
                    color: #fff;
                    font-weight: 600;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .vc-as-section-title {
                    font-size: 12px;
                    color: #999;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    padding: 8px 4px;
                    margin-top: 8px;
                }

                .vc-as-account-card {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #2f3136;
                    border-radius: 12px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: background 0.2s, transform 0.1s;
                    border: 2px solid transparent;
                }

                .vc-as-account-card:hover {
                    background: #36393f;
                }

                .vc-as-account-card:active {
                    transform: scale(0.98);
                }

                .vc-as-account-card.active {
                    border-color: #5865F2;
                    background: rgba(88,101,242,0.1);
                }

                .vc-as-account-card .avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: #5865F2;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                    flex-shrink: 0;
                    overflow: hidden;
                }

                .vc-as-account-card .avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .vc-as-account-card .details {
                    flex: 1;
                    min-width: 0;
                }

                .vc-as-account-card .details .username {
                    font-size: 14px;
                    color: #fff;
                    font-weight: 600;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .vc-as-account-card .details .subtitle {
                    font-size: 11px;
                    color: #999;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .vc-as-account-card .actions {
                    display: flex;
                    gap: 4px;
                    flex-shrink: 0;
                }

                .vc-as-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s, transform 0.1s;
                }

                .vc-as-btn:active {
                    transform: scale(0.95);
                }

                .vc-as-btn-primary {
                    background: #5865F2;
                    color: white;
                }

                .vc-as-btn-primary:hover {
                    background: #4752c4;
                }

                .vc-as-btn-danger {
                    background: #ED4245;
                    color: white;
                }

                .vc-as-btn-danger:hover {
                    background: #c03537;
                }

                .vc-as-btn-secondary {
                    background: #4f545c;
                    color: white;
                }

                .vc-as-btn-secondary:hover {
                    background: #5d6269;
                }

                #vc-account-switcher-footer {
                    padding: 12px 16px;
                    background: #2f3136;
                    display: flex;
                    gap: 8px;
                    border-top: 1px solid #202225;
                }

                #vc-account-switcher-footer .vc-as-btn {
                    flex: 1;
                    padding: 12px;
                    text-align: center;
                }

                .vc-as-empty {
                    text-align: center;
                    padding: 40px 20px;
                    color: #999;
                }

                .vc-as-empty .icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                }

                .vc-as-empty p {
                    margin: 0;
                    font-size: 14px;
                }
            `);

            // Create main container
            const container = document.createElement('div');
            container.id = 'vc-account-switcher';
            container.innerHTML = `
                <div id="vc-account-switcher-bg"></div>
                <div id="vc-account-switcher-panel">
                    <div id="vc-account-switcher-header">
                        <div>
                            <h2>Account Switcher</h2>
                            <p id="vc-as-account-count">0 accounts saved</p>
                        </div>
                        <button class="vc-as-close" id="vc-as-close-btn">✕</button>
                    </div>
                    <div id="vc-account-switcher-body"></div>
                    <div id="vc-account-switcher-footer">
                        <button class="vc-as-btn vc-as-btn-primary" id="vc-as-save-btn">Save Current</button>
                        <button class="vc-as-btn vc-as-btn-secondary" id="vc-as-export-btn">Export</button>
                        <button class="vc-as-btn vc-as-btn-secondary" id="vc-as-import-btn">Import</button>
                    </div>
                </div>
            `;
            document.body.appendChild(container);

            // Create floating button
            const fab = document.createElement('div');
            fab.id = 'vc-account-fab';
            fab.style.cssText = `
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 100001;
                width: 44px;
                height: 44px;
                background: linear-gradient(135deg, #5865F2, #EB459E);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(88,101,242,0.4);
                cursor: pointer;
                transition: transform 0.2s;
                user-select: none;
                -webkit-user-select: none;
            `;
            fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
            document.body.appendChild(fab);

            // Event listeners
            fab.addEventListener('click', function() {
                self._open();
            });

            document.getElementById('vc-as-close-btn').addEventListener('click', function() {
                self._close();
            });

            document.getElementById('vc-account-switcher-bg').addEventListener('click', function() {
                self._close();
            });

            document.getElementById('vc-as-save-btn').addEventListener('click', function() {
                const label = prompt('Enter a label for this account (optional):');
                self.saveCurrentAccount(label || undefined);
            });

            document.getElementById('vc-as-export-btn').addEventListener('click', function() {
                self.exportAccounts();
            });

            document.getElementById('vc-as-import-btn').addEventListener('click', function() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(ev) {
                            self.importAccounts(ev.target.result);
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            });

            this._refreshPanel();
        },

        _removeUI: function() {
            const container = document.getElementById('vc-account-switcher');
            if (container) container.remove();

            const fab = document.getElementById('vc-account-fab');
            if (fab) fab.remove();

            Vencord.UI.removeCSS('multiAccount');
        },

        _open: function() {
            const container = document.getElementById('vc-account-switcher');
            if (container) {
                this._refreshPanel();
                container.classList.add('active');
            }
        },

        _close: function() {
            const container = document.getElementById('vc-account-switcher');
            if (container) {
                container.classList.remove('active');
            }
        },

        _refreshPanel: function() {
            const body = document.getElementById('vc-account-switcher-body');
            const countEl = document.getElementById('vc-as-account-count');
            if (!body) return;

            const currentUsername = this._getUsername();
            const currentAvatar = this._getAvatar();

            let html = '';

            // Current account
            html += '<div id="vc-account-switcher-current">';
            html += '<div class="avatar">';
            if (currentAvatar) {
                html += `<img src="${currentAvatar}" alt="">`;
            } else {
                html += currentUsername.charAt(0).toUpperCase();
            }
            html += '</div>';
            html += '<div class="info">';
            html += '<div class="label">Current Account</div>';
            html += `<div class="name">${this._escapeHtml(currentUsername)}</div>`;
            html += '</div>';
            html += '</div>';

            // Saved accounts
            if (this._accounts.length > 0) {
                html += '<div class="vc-as-section-title">Saved Accounts</div>';

                this._accounts.forEach(function(account) {
                    const isCurrent = account.username === currentUsername;
                    const lastUsed = account.lastUsed ? 
                        new Date(account.lastUsed).toLocaleDateString() : 'Never';
                    const initial = account.username ? account.username.charAt(0).toUpperCase() : '?';

                    html += `<div class="vc-as-account-card ${isCurrent ? 'active' : ''}" data-account-id="${account.id}">`;
                    html += '<div class="avatar">';
                    if (account.avatar) {
                        html += `<img src="${account.avatar}" alt="">`;
                    } else {
                        html += initial;
                    }
                    html += '</div>';
                    html += '<div class="details">';
                    html += `<div class="username">${self._escapeHtml(account.label || account.username)}</div>`;
                    html += `<div class="subtitle">${self._escapeHtml(account.username)} · Last used: ${lastUsed}</div>`;
                    html += '</div>';
                    html += '<div class="actions">';
                    if (!isCurrent) {
                        html += `<button class="vc-as-btn vc-as-btn-primary vc-as-switch" data-id="${account.id}">Switch</button>`;
                    } else {
                        html += '<button class="vc-as-btn vc-as-btn-secondary" disabled>Saved</button>';
                    }
                    html += `<button class="vc-as-btn vc-as-btn-danger vc-as-remove" data-id="${account.id}">✕</button>`;
                    html += '</div>';
                    html += '</div>';
                }.bind({self: this}));
            } else {
                html += '<div class="vc-as-empty">';
                html += '<div class="icon">👤</div>';
                html += '<p>No saved accounts yet.</p>';
                html += '<p style="margin-top:8px;font-size:12px;color:#666;">Click "Save Current" to save this account</p>';
                html += '</div>';
            }

            body.innerHTML = html;

            // Update count
            if (countEl) {
                countEl.textContent = `${this._accounts.length} account${this._accounts.length !== 1 ? 's' : ''} saved`;
            }

            // Bind events
            body.querySelectorAll('.vc-as-switch').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-id');
                    self._switchWithConfirm(id);
                });
            });

            body.querySelectorAll('.vc-as-remove').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const id = this.getAttribute('data-id');
                    if (confirm('Remove this saved account?')) {
                        self.removeAccount(id);
                    }
                });
            });
        },

        _switchWithConfirm: function(accountId) {
            const account = this._accounts.find(function(a) { return a.id === accountId; });
            if (!account) return;

            if (confirm(`Switch to ${account.username}? The app will reload.`)) {
                this.switchToAccount(accountId);
            }
        },

        _escapeHtml: function(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    });
})();
