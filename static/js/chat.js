/**
 * Nexus Chat Web - Chat JavaScript
 * WebSocket messaging with JWT auth, presence system, typing indicators,
 * emoji picker, media upload with progress
 */

(function () {
    'use strict';

    const app = document.getElementById('chatApp');
    if (!app) return;

    const username = app.dataset.user;
    const userId = app.dataset.userId;
    const conversationId = app.dataset.conversationId;
    const messagesArea = document.getElementById('messagesArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    let chatSocket = null;
    let presenceSocket = null;
    let typingTimeout = null;
    let jwtToken = null;
    let currentUploadXHR = null;

    // ──── JWT Token Fetch ────────────────────────────────────────────
    async function fetchJWT() {
        try {
            const resp = await fetch('/accounts/token/');
            if (resp.ok) {
                const data = await resp.json();
                jwtToken = data.token;
            }
        } catch (e) {
            console.warn('[Nexus] JWT fetch failed, using session auth');
        }
    }

    // ──── WebSocket Connection (Chat) ────────────────────────────────
    function connectWebSocket() {
        if (!conversationId) return;
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${wsProtocol}//${location.host}/ws/chat/${conversationId}/`;
        if (jwtToken) wsUrl += `?token=${jwtToken}`;
        chatSocket = new WebSocket(wsUrl);

        chatSocket.onopen = () => {
            console.log('[Nexus] Chat WebSocket connected');
        };

        chatSocket.onmessage = (e) => {
            const data = JSON.parse(e.data);
            handleSocketMessage(data);
        };

        chatSocket.onclose = (e) => {
            console.log('[Nexus] Chat WebSocket closed, reconnecting in 3s...');
            setTimeout(connectWebSocket, 3000);
        };

        chatSocket.onerror = (err) => {
            console.error('[Nexus] Chat WebSocket error:', err);
        };
    }

    function handleSocketMessage(data) {
        switch (data.type) {
            case 'message':
                appendMessage(data.message);
                scrollToBottom();
                if (data.message.sender !== username) {
                    showNotification(data.message.sender, data.message.content);
                }
                break;
            case 'typing':
                showTyping(data.username);
                break;
            case 'read_receipt':
                markMessagesRead(data);
                break;
            case 'reaction':
                updateReaction(data);
                break;
            case 'edited':
                editMessageDOM(data);
                break;
            case 'deleted':
                deleteMessageDOM(data);
                break;
            case 'status':
                updateUserStatus(data);
                break;
        }
    }

    // ──── WebSocket Connection (Presence) ────────────────────────────
    function connectPresenceSocket() {
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${wsProtocol}//${location.host}/ws/presence/`;
        if (jwtToken) wsUrl += `?token=${jwtToken}`;
        presenceSocket = new WebSocket(wsUrl);

        presenceSocket.onopen = () => {
            console.log('[Nexus] Presence WebSocket connected');
        };

        presenceSocket.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'presence_update') {
                renderNearbyDevices(data.users);
            }
        };

        presenceSocket.onclose = () => {
            console.log('[Nexus] Presence WebSocket closed, reconnecting in 5s...');
            setTimeout(connectPresenceSocket, 5000);
        };

        presenceSocket.onerror = (err) => {
            console.error('[Nexus] Presence WebSocket error:', err);
        };

        // Heartbeat every 30 seconds
        setInterval(() => {
            if (presenceSocket && presenceSocket.readyState === WebSocket.OPEN) {
                presenceSocket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000);
    }

    // ──── Nearby Devices Rendering ───────────────────────────────────
    function renderNearbyDevices(users) {
        const list = document.getElementById('nearbyDeviceList');
        const badge = document.getElementById('nearbyCountBadge');
        if (!list) return;

        if (users && users.length > 0) {
            list.innerHTML = '';
            users.forEach(d => {
                const card = document.createElement('div');
                card.className = 'nearby-device-card';
                card.innerHTML = `
                    <img src="${d.avatar}" class="nearby-avatar" alt="">
                    <div class="nearby-device-info">
                        <h4>${escapeHtml(d.username)}</h4>
                        <span class="nearby-ip">${d.ip}</span>
                    </div>
                    <a href="/chat/start/${d.user_id}/" class="btn btn-primary btn-sm nearby-chat-btn">
                        <span class="material-icons-round">chat</span>
                    </a>
                `;
                list.appendChild(card);
            });

            if (badge) {
                badge.textContent = users.length;
                badge.style.display = 'inline-flex';
            }
        } else {
            list.innerHTML = `
                <div class="empty-state nearby-empty">
                    <span class="material-icons-round">radar</span>
                    <p>No nearby devices found</p>
                </div>
            `;
            if (badge) badge.style.display = 'none';
        }
    }

    window.toggleNearbyPanel = function () {
        const body = document.getElementById('nearbyPanelBody');
        const icon = document.getElementById('nearbyToggleIcon');
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (icon) icon.textContent = isOpen ? 'expand_more' : 'expand_less';
    };

    // ──── Message Display ────────────────────────────────────────────
    function appendMessage(data) {
        if (!messagesArea) return;
        const emptyState = messagesArea.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        // Check for duplicate message (from upload broadcast)
        if (messagesArea.querySelector(`[data-msg-id="${data.id}"]`)) return;

        const isSent = data.sender === username;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.dataset.msgId = data.id;
        div.dataset.sender = data.sender;

        let contentHtml = '';
        if (data.message_type === 'image' && data.media_url) {
            contentHtml = `<div class="msg-media"><img src="${data.media_url}" alt="Image" loading="lazy" onclick="openMediaViewer(this.src)"></div>`;
        } else if (data.message_type === 'video' && data.media_url) {
            contentHtml = `<div class="msg-media"><video src="${data.media_url}" controls></video></div>`;
        } else if (data.message_type === 'document' && data.media_url) {
            contentHtml = `<a href="${data.media_url}" class="msg-document" target="_blank"><span class="material-icons-round">description</span> ${escapeHtml(data.content || 'Document')}</a>`;
        } else if (data.message_type === 'system') {
            contentHtml = `<p class="msg-system">${escapeHtml(data.content)}</p>`;
        } else {
            contentHtml = `<p class="msg-text">${escapeHtml(data.content)}</p>`;
        }

        const time = new Date(data.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const statusHtml = isSent
            ? `<span class="msg-status"><span class="material-icons-round">done</span></span>`
            : '';

        div.innerHTML = `
            ${!isSent && data.sender_avatar ? `<img src="${data.sender_avatar}" alt="" class="msg-avatar">` : ''}
            <div class="msg-bubble">
                ${contentHtml}
                <div class="msg-meta">
                    <span class="msg-time">${time}</span>
                    ${statusHtml}
                </div>
            </div>
        `;

        messagesArea.appendChild(div);
    }

    // ──── Send Message ───────────────────────────────────────────────
    window.sendMessage = function () {
        if (!chatSocket || !messageInput) return;
        const content = messageInput.value.trim();
        if (!content) return;

        chatSocket.send(JSON.stringify({
            type: 'message',
            content: content,
        }));

        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
    };

    window.handleKeyDown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // ──── Typing Indicator ───────────────────────────────────────────
    window.handleTyping = function () {
        if (!chatSocket) return;
        chatSocket.send(JSON.stringify({ type: 'typing' }));

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { }, 3000);
    };

    function showTyping(sender) {
        if (sender === username) return;
        const indicator = document.getElementById('typingIndicator');
        const nameEl = document.getElementById('typingUser');
        if (indicator && nameEl) {
            nameEl.textContent = sender;
            indicator.style.display = 'flex';
            setTimeout(() => { indicator.style.display = 'none'; }, 3000);
        }
    }

    // ──── Message Actions ────────────────────────────────────────────
    window.reactToMessage = function (msgId, emoji) {
        if (!chatSocket) return;
        emoji = emoji || prompt('Enter an emoji:');
        if (!emoji) return;
        chatSocket.send(JSON.stringify({
            type: 'reaction',
            message_id: msgId,
            emoji: emoji,
        }));
    };

    window.editMessage = function (msgId) {
        if (!chatSocket) return;
        const msgEl = document.querySelector(`[data-msg-id="${msgId}"] .msg-text`);
        if (!msgEl) return;
        const newContent = prompt('Edit message:', msgEl.textContent);
        if (newContent !== null && newContent.trim()) {
            chatSocket.send(JSON.stringify({
                type: 'edit',
                message_id: msgId,
                content: newContent.trim(),
            }));
        }
    };

    window.deleteMessage = function (msgId) {
        if (!chatSocket) return;
        if (confirm('Delete this message?')) {
            chatSocket.send(JSON.stringify({
                type: 'delete',
                message_id: msgId,
            }));
        }
    };

    // ──── DOM Updates ────────────────────────────────────────────────
    function markMessagesRead(data) {
        document.querySelectorAll('.message.sent .msg-status .material-icons-round').forEach(el => {
            el.textContent = 'done_all';
            el.classList.add('read');
        });
    }

    function updateReaction(data) {
        const msgEl = document.querySelector(`[data-msg-id="${data.message_id}"]`);
        if (!msgEl) return;
        let reactionsDiv = msgEl.querySelector('.msg-reactions');
        if (!reactionsDiv) {
            reactionsDiv = document.createElement('div');
            reactionsDiv.className = 'msg-reactions';
            msgEl.querySelector('.msg-bubble').appendChild(reactionsDiv);
        }
        reactionsDiv.innerHTML = '';
        if (data.reactions) {
            for (const [emoji, users] of Object.entries(data.reactions)) {
                const chip = document.createElement('span');
                chip.className = 'reaction-chip';
                chip.textContent = `${emoji} ${users.length}`;
                chip.onclick = () => reactToMessage(data.message_id, emoji);
                reactionsDiv.appendChild(chip);
            }
        }
    }

    function editMessageDOM(data) {
        const msgEl = document.querySelector(`[data-msg-id="${data.message_id}"] .msg-text`);
        if (msgEl) {
            msgEl.textContent = data.content;
            const bubble = msgEl.closest('.msg-bubble');
            if (!bubble.querySelector('.msg-edited-tag')) {
                const tag = document.createElement('span');
                tag.className = 'msg-edited-tag';
                tag.textContent = 'edited';
                bubble.appendChild(tag);
            }
        }
    }

    function deleteMessageDOM(data) {
        const msgEl = document.querySelector(`[data-msg-id="${data.message_id}"]`);
        if (msgEl) {
            msgEl.classList.add('deleted');
            const bubble = msgEl.querySelector('.msg-bubble');
            bubble.innerHTML = '<p class="msg-deleted"><span class="material-icons-round">block</span> This message was deleted</p>';
        }
    }

    function updateUserStatus(data) {
        const dot = document.getElementById('headerStatusDot');
        const status = document.getElementById('chatHeaderStatus');
        if (dot) dot.className = `status-dot ${data.is_online ? 'online' : ''}`;
        if (status) status.textContent = data.is_online ? 'Online' : 'Offline';
    }

    // ──── Notifications ──────────────────────────────────────────────
    function showNotification(sender, content) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`${sender}`, { body: content || 'New message', icon: '/static/img/default-avatar.svg' });
        }
    }

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // ──── Emoji Picker ───────────────────────────────────────────────
    const emojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '👎', '❤️', '🔥', '🎉', '😢', '😡', '🤣', '✨', '💯', '🙏', '👋', '💪', '🤝', '😊', '🥺', '😤', '🤩', '😴', '🤮', '👀', '💀', '🫡', '🎶'];

    window.toggleEmojiPicker = function () {
        const picker = document.getElementById('emojiPicker');
        if (!picker) return;
        picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
        if (picker.style.display === 'flex' && !picker.dataset.loaded) {
            const grid = document.getElementById('emojiGrid');
            emojis.forEach(e => {
                const btn = document.createElement('button');
                btn.className = 'emoji-item';
                btn.textContent = e;
                btn.onclick = () => {
                    messageInput.value += e;
                    messageInput.focus();
                };
                grid.appendChild(btn);
            });
            picker.dataset.loaded = 'true';
        }
    };

    // ──── Message Search ─────────────────────────────────────────────
    window.toggleMessageSearch = function () {
        const bar = document.getElementById('messageSearchBar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
            if (bar.style.display === 'flex') bar.querySelector('input').focus();
        }
    };

    // ──── Media Upload with Progress ─────────────────────────────────
    window.uploadMedia = function (input) {
        if (!input.files.length || !conversationId) return;

        const file = input.files[0];
        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (file.size > maxSize) {
            alert('File too large. Maximum size is 10 MB.');
            input.value = '';
            return;
        }

        const formData = new FormData();
        formData.append('media', file);

        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value
            || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';

        // Show progress bar
        const progressBar = document.getElementById('uploadProgressBar');
        const progressFill = document.getElementById('uploadProgressFill');
        const progressPercent = document.getElementById('uploadProgressPercent');
        const fileName = document.getElementById('uploadFileName');

        if (progressBar) progressBar.style.display = 'flex';
        if (fileName) fileName.textContent = `Uploading: ${file.name}`;
        if (progressFill) progressFill.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';

        const xhr = new XMLHttpRequest();
        currentUploadXHR = xhr;

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                if (progressFill) progressFill.style.width = pct + '%';
                if (progressPercent) progressPercent.textContent = pct + '%';
            }
        });

        xhr.addEventListener('load', () => {
            currentUploadXHR = null;
            if (progressBar) progressBar.style.display = 'none';

            if (xhr.status >= 200 && xhr.status < 300) {
                // Message will arrive via WebSocket broadcast — no need to append here
                console.log('[Nexus] File uploaded successfully');
            } else {
                try {
                    const errData = JSON.parse(xhr.responseText);
                    alert(errData.error || 'Upload failed');
                } catch (_) {
                    alert('Upload failed');
                }
            }
        });

        xhr.addEventListener('error', () => {
            currentUploadXHR = null;
            if (progressBar) progressBar.style.display = 'none';
            alert('Upload failed. Please try again.');
        });

        xhr.open('POST', `/chat/${conversationId}/upload/`);
        xhr.setRequestHeader('X-CSRFToken', csrfToken);
        xhr.send(formData);

        input.value = '';
    };

    window.cancelUpload = function () {
        if (currentUploadXHR) {
            currentUploadXHR.abort();
            currentUploadXHR = null;
        }
        const progressBar = document.getElementById('uploadProgressBar');
        if (progressBar) progressBar.style.display = 'none';
    };

    // ──── Utilities ──────────────────────────────────────────────────
    function scrollToBottom() {
        if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ──── Media Viewer ───────────────────────────────────────────────
    window.openMediaViewer = function (src) {
        const viewer = document.getElementById('mediaViewer');
        const img = document.getElementById('mediaViewerImg');
        if (viewer && img) {
            img.src = src;
            viewer.style.display = 'flex';
        }
    };

    window.closeMediaViewer = function () {
        const viewer = document.getElementById('mediaViewer');
        if (viewer) viewer.style.display = 'none';
    };

    // ──── Mobile helpers ─────────────────────────────────────────────
    window.closeChatMobile = function () {
        const sidebar = document.getElementById('sidebar');
        const main = document.getElementById('chatMain');
        if (sidebar) sidebar.style.display = 'flex';
        if (main) main.style.display = 'none';
    };

    window.toggleDropdown = function (btn) {
        const menu = btn.nextElementSibling;
        if (menu) menu.classList.toggle('show');
    };

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            if (!menu.parentElement.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    });

    // ──── Init ───────────────────────────────────────────────────────
    async function init() {
        scrollToBottom();
        await fetchJWT();
        connectWebSocket();
        connectPresenceSocket();
    }

    init();

})();
