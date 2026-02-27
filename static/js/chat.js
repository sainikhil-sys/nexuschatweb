/**
 * Nexus Chat Web - Chat JavaScript
 * WebSocket messaging, typing indicators, emoji picker, media upload
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
    let typingTimeout = null;

    // ---- WebSocket Connection ----
    function connectWebSocket() {
        if (!conversationId) return;
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${location.host}/ws/chat/${conversationId}/`;
        chatSocket = new WebSocket(wsUrl);

        chatSocket.onopen = () => {
            console.log('[Nexus] WebSocket connected');
        };

        chatSocket.onmessage = (e) => {
            const data = JSON.parse(e.data);
            handleSocketMessage(data);
        };

        chatSocket.onclose = (e) => {
            console.log('[Nexus] WebSocket closed, reconnecting in 3s...');
            setTimeout(connectWebSocket, 3000);
        };

        chatSocket.onerror = (err) => {
            console.error('[Nexus] WebSocket error:', err);
        };
    }

    function handleSocketMessage(data) {
        switch (data.type) {
            case 'chat_message':
                appendMessage(data);
                scrollToBottom();
                if (data.sender !== username) {
                    showNotification(data.sender, data.content);
                }
                break;
            case 'typing':
                showTyping(data.sender);
                break;
            case 'read_receipt':
                markMessagesRead(data);
                break;
            case 'reaction':
                updateReaction(data);
                break;
            case 'message_edit':
                editMessageDOM(data);
                break;
            case 'message_delete':
                deleteMessageDOM(data);
                break;
            case 'user_status':
                updateUserStatus(data);
                break;
        }
    }

    // ---- Message Display ----
    function appendMessage(data) {
        const emptyState = messagesArea.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const isSent = data.sender === username;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.dataset.msgId = data.id;
        div.dataset.sender = data.sender;

        let contentHtml = '';
        if (data.message_type === 'image' && data.media_url) {
            contentHtml = `<div class="msg-media"><img src="${data.media_url}" alt="Image" loading="lazy" onclick="openMediaViewer(this.src)"></div>`;
        } else if (data.message_type === 'system') {
            contentHtml = `<p class="msg-system">${data.content}</p>`;
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

    // ---- Send Message ----
    window.sendMessage = function () {
        if (!chatSocket || !messageInput) return;
        const content = messageInput.value.trim();
        if (!content) return;

        chatSocket.send(JSON.stringify({
            type: 'chat_message',
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

    // ---- Typing Indicator ----
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

    // ---- Message Actions ----
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
                type: 'edit_message',
                message_id: msgId,
                content: newContent.trim(),
            }));
        }
    };

    window.deleteMessage = function (msgId) {
        if (!chatSocket) return;
        if (confirm('Delete this message?')) {
            chatSocket.send(JSON.stringify({
                type: 'delete_message',
                message_id: msgId,
            }));
        }
    };

    // ---- DOM Updates ----
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

    // ---- Emoji Picker ----
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

    // ---- Message Search ----
    window.toggleMessageSearch = function () {
        const bar = document.getElementById('messageSearchBar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
            if (bar.style.display === 'flex') bar.querySelector('input').focus();
        }
    };

    // ---- Media Upload ----
    window.uploadMedia = function (input) {
        if (!input.files.length || !conversationId) return;
        const formData = new FormData();
        formData.append('media', input.files[0]);
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value
            || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';

        fetch(`/chat/${conversationId}/upload/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-CSRFToken': csrfToken },
        })
            .then(r => r.json())
            .then(data => {
                if (data.message) appendMessage(data.message);
                scrollToBottom();
            })
            .catch(err => console.error('Upload error:', err));

        input.value = '';
    };

    // ---- Utilities ----
    function scrollToBottom() {
        if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ---- Nearby Mode ----
    let nearbyPollInterval = null;

    window.toggleNearbyModal = function () {
        const modal = document.getElementById('nearbyModal');
        if (!modal) return;

        const isOpening = modal.style.display === 'none';
        modal.style.display = isOpening ? 'flex' : 'none';

        if (isOpening) {
            fetchNearbyQR();
            fetchNearbyDevices();
            // Auto poll every 5 seconds
            nearbyPollInterval = setInterval(fetchNearbyDevices, 5000);
        } else {
            if (nearbyPollInterval) clearInterval(nearbyPollInterval);
        }
    };

    function fetchNearbyQR() {
        fetch('/discovery/qr/')
            .then(r => r.json())
            .then(data => {
                const container = document.getElementById('nearbyQrCodeContainer');
                if (container && data.qr_image) {
                    container.innerHTML = `<img src="${data.qr_image}" alt="Scan to connect">`;
                    container.classList.remove('qr-placeholder');
                }
            })
            .catch(err => console.error('Failed to load QR:', err));
    }

    window.fetchNearbyDevices = function () {
        const btn = document.getElementById('refreshNearbyBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-icons-round spin">sync</span> Refreshing...';
            btn.disabled = true;
        }

        fetch('/discovery/heartbeat/')
            .then(r => r.json())
            .then(data => {
                const list = document.getElementById('nearbyDeviceList');
                if (!list) return;

                if (data.devices && data.devices.length > 0) {
                    list.innerHTML = '';
                    data.devices.forEach(d => {
                        list.innerHTML += `
                            <div class="nearby-device-card">
                                <img src="${d.avatar}" class="nearby-avatar" alt="">
                                <div class="nearby-device-info">
                                    <h4>${d.username}</h4>
                                    <span class="nearby-ip">${d.device_name || 'Generic Device'} • ${d.ip}</span>
                                </div>
                                <a href="/chat/start/${d.user_id}/" class="btn btn-primary btn-sm">
                                    <span class="material-icons-round">chat</span> Connect
                                </a>
                            </div>
                        `;
                    });
                } else {
                    list.innerHTML = `
                        <div class="empty-state">
                            <span class="material-icons-round">radar</span>
                            <p>No active devices found. Make sure others have the app open on this Wi-Fi network.</p>
                        </div>
                    `;
                }
            })
            .finally(() => {
                if (btn) {
                    btn.innerHTML = '<span class="material-icons-round">refresh</span> Refresh';
                    btn.disabled = false;
                }
            });
    };

    // ---- Init ----
    scrollToBottom();
    connectWebSocket();

})();
