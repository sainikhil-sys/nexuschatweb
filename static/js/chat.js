/**
 * ═══════════════════════════════════════════════════════════
 *  NEXUS CHAT WEB — Chat JavaScript
 *  WebSocket connection, messaging, typing, reactions,
 *  emoji picker, media upload, message actions
 * ═══════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ── DOM References ──────────────────────────────────────
    const chatApp = document.getElementById('chatApp');
    if (!chatApp) return;

    const conversationId = chatApp.dataset.conversationId;
    const currentUser = chatApp.dataset.user;
    const currentUserId = chatApp.dataset.userId;

    if (!conversationId) return; // no active conversation

    const messagesArea = document.getElementById('messagesArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const typingIndicator = document.getElementById('typingIndicator');
    const typingUser = document.getElementById('typingUser');
    const headerStatus = document.getElementById('chatHeaderStatus');
    const headerStatusDot = document.getElementById('headerStatusDot');
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiGrid = document.getElementById('emojiGrid');
    const messageSearchBar = document.getElementById('messageSearchBar');
    const messageSearchInput = document.getElementById('messageSearchInput');

    // ── WebSocket Connection ────────────────────────────────
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/chat/${conversationId}/`;
    let socket = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;

    function connectWebSocket() {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('[Nexus] WebSocket connected');
            reconnectAttempts = 0;
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };

        socket.onclose = (event) => {
            console.log('[Nexus] WebSocket closed', event.code);
            if (reconnectAttempts < MAX_RECONNECT) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`[Nexus] Reconnecting... (${reconnectAttempts})`);
                    connectWebSocket();
                }, 2000 * reconnectAttempts);
            }
        };

        socket.onerror = (err) => {
            console.error('[Nexus] WebSocket error:', err);
        };
    }

    connectWebSocket();

    // ── Handle Incoming Messages ────────────────────────────
    function handleWebSocketMessage(data) {
        switch (data.type) {
            case 'message':
                appendMessage(data.message);
                // Send read receipt for received messages
                if (data.message.sender !== currentUser) {
                    sendReadReceipt(data.message.id);
                    showNotification(
                        data.message.sender,
                        data.message.content || '[Media]',
                        data.message.sender_avatar
                    );
                }
                break;

            case 'typing':
                showTypingIndicator(data.username, data.is_typing);
                break;

            case 'read_receipt':
                markMessageAsRead(data.message_id);
                break;

            case 'reaction':
                updateReaction(data.message_id, data.emoji, data.username);
                break;

            case 'edited':
                updateEditedMessage(data.message_id, data.content);
                break;

            case 'deleted':
                markMessageDeleted(data.message_id);
                break;

            case 'status':
                updateUserStatus(data.username, data.is_online);
                break;
        }
    }

    // ── Send Message ────────────────────────────────────────
    function sendMessage() {
        const content = messageInput.value.trim();
        if (!content || !socket || socket.readyState !== WebSocket.OPEN) return;

        socket.send(JSON.stringify({
            type: 'message',
            content: content,
        }));

        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();

        // Stop typing indicator
        sendTypingStatus(false);
    }

    // Expose globally
    window.sendMessage = sendMessage;

    // ── Key Handler ─────────────────────────────────────────
    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }
    window.handleKeyDown = handleKeyDown;

    // ── Typing Indicator ────────────────────────────────────
    let typingTimeout = null;
    let isTyping = false;

    function handleTyping() {
        if (!isTyping) {
            isTyping = true;
            sendTypingStatus(true);
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            sendTypingStatus(false);
        }, 2000);
    }
    window.handleTyping = handleTyping;

    function sendTypingStatus(typing) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'typing',
                is_typing: typing,
            }));
        }
    }

    function showTypingIndicator(username, typing) {
        if (typingIndicator) {
            typingIndicator.style.display = typing ? 'flex' : 'none';
            if (typingUser) typingUser.textContent = username;
        }
    }

    // ── Append Message ──────────────────────────────────────
    function appendMessage(msg) {
        // Remove empty state
        const emptyState = messagesArea.querySelector('.chat-empty');
        if (emptyState) emptyState.remove();

        const isSent = msg.sender === currentUser;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-msg-id', msg.id);
        div.setAttribute('data-sender', msg.sender);

        let avatarHtml = '';
        if (!isSent) {
            avatarHtml = `<img src="${msg.sender_avatar}" alt="" class="msg-avatar">`;
        }

        let contentHtml;
        if (msg.message_type === 'image' && msg.media_url) {
            contentHtml = `<div class="msg-media"><img src="${msg.media_url}" alt="Image" loading="lazy" onclick="openMediaViewer(this.src)"></div>`;
        } else if (msg.message_type === 'video' && msg.media_url) {
            contentHtml = `<div class="msg-media"><video src="${msg.media_url}" controls></video></div>`;
        } else if (msg.message_type === 'document' && msg.media_url) {
            contentHtml = `<a href="${msg.media_url}" class="msg-document" target="_blank"><span class="material-icons-round">description</span>${escapeHtml(msg.content || 'Document')}</a>`;
        } else if (msg.message_type === 'system') {
            contentHtml = `<p class="msg-system">${escapeHtml(msg.content)}</p>`;
        } else {
            contentHtml = `<p class="msg-text">${escapeHtml(msg.content)}</p>`;
        }

        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        let statusHtml = '';
        if (isSent) {
            statusHtml = `<span class="msg-status"><span class="material-icons-round">done</span></span>`;
        }

        let actionsHtml = '';
        if (msg.message_type !== 'system') {
            actionsHtml = `<div class="msg-actions">
                <button onclick="reactToMessage(${msg.id})" title="React"><span class="material-icons-round">add_reaction</span></button>
                ${isSent ? `
                <button onclick="editMessage(${msg.id})" title="Edit"><span class="material-icons-round">edit</span></button>
                <button onclick="deleteMessage(${msg.id})" title="Delete"><span class="material-icons-round">delete</span></button>
                ` : ''}
            </div>`;
        }

        div.innerHTML = `
            ${avatarHtml}
            <div class="msg-bubble">
                ${contentHtml}
                <div class="msg-meta">
                    <span class="msg-time">${time}</span>
                    ${statusHtml}
                </div>
                ${actionsHtml}
            </div>
        `;

        messagesArea.appendChild(div);
        scrollToBottom();
    }

    // ── Scroll Management ───────────────────────────────────
    function scrollToBottom() {
        if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }

    // Initial scroll
    scrollToBottom();

    // ── Read Receipt ────────────────────────────────────────
    function sendReadReceipt(messageId) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'read_receipt',
                message_id: messageId,
            }));
        }
    }

    function markMessageAsRead(messageId) {
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (msg) {
            const statusIcon = msg.querySelector('.msg-status .material-icons-round');
            if (statusIcon) {
                statusIcon.textContent = 'done_all';
                statusIcon.classList.add('read');
            }
        }
    }

    // ── Reactions ───────────────────────────────────────────
    const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    function reactToMessage(messageId, emoji) {
        if (emoji) {
            sendReaction(messageId, emoji);
            return;
        }
        // Show quick reaction picker
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (!msg) return;

        // Remove any existing picker
        const existingPicker = document.querySelector('.quick-reaction-picker');
        if (existingPicker) existingPicker.remove();

        const picker = document.createElement('div');
        picker.className = 'quick-reaction-picker';
        picker.style.cssText = `
            position: absolute; top: -40px; display: flex; gap: 4px;
            background: var(--bg-secondary); border: 1px solid var(--border);
            border-radius: 24px; padding: 4px 8px; box-shadow: var(--glass-shadow);
            z-index: 100; animation: fadeInUp .2s;
        `;

        QUICK_EMOJIS.forEach(e => {
            const btn = document.createElement('span');
            btn.textContent = e;
            btn.style.cssText = 'cursor:pointer; font-size:1.2rem; padding:4px; border-radius:50%; transition:transform .15s;';
            btn.onmouseenter = () => btn.style.transform = 'scale(1.3)';
            btn.onmouseleave = () => btn.style.transform = 'scale(1)';
            btn.onclick = () => {
                sendReaction(messageId, e);
                picker.remove();
            };
            picker.appendChild(btn);
        });

        const bubble = msg.querySelector('.msg-bubble');
        bubble.style.position = 'relative';
        bubble.appendChild(picker);

        // Auto-remove after delay
        setTimeout(() => picker.remove(), 5000);
    }
    window.reactToMessage = reactToMessage;

    function sendReaction(messageId, emoji) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'reaction',
                message_id: messageId,
                emoji: emoji,
            }));
        }
    }

    function updateReaction(messageId, emoji, username) {
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (!msg) return;

        let reactionsDiv = msg.querySelector('.msg-reactions');
        if (!reactionsDiv) {
            reactionsDiv = document.createElement('div');
            reactionsDiv.className = 'msg-reactions';
            msg.querySelector('.msg-bubble').appendChild(reactionsDiv);
        }

        // Rebuild reaction chips (simplified)
        let chip = reactionsDiv.querySelector(`[data-emoji="${emoji}"]`);
        if (chip) {
            const count = parseInt(chip.dataset.count || '1');
            chip.dataset.count = count + 1;
            chip.textContent = `${emoji} ${count + 1}`;
        } else {
            chip = document.createElement('span');
            chip.className = 'reaction-chip';
            chip.dataset.emoji = emoji;
            chip.dataset.count = '1';
            chip.textContent = `${emoji} 1`;
            chip.onclick = () => reactToMessage(messageId, emoji);
            reactionsDiv.appendChild(chip);
        }
    }

    // ── Edit Message ────────────────────────────────────────
    function editMessage(messageId) {
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (!msg) return;

        const textEl = msg.querySelector('.msg-text');
        if (!textEl) return;

        const original = textEl.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'form-input';
        input.style.cssText = 'font-size:.88rem; padding:6px 10px;';

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const newContent = input.value.trim();
                if (newContent && newContent !== original) {
                    socket.send(JSON.stringify({
                        type: 'edit',
                        message_id: messageId,
                        content: newContent,
                    }));
                }
                textEl.textContent = newContent || original;
                input.replaceWith(textEl);
            } else if (e.key === 'Escape') {
                input.replaceWith(textEl);
            }
        };

        input.onblur = () => input.replaceWith(textEl);
        textEl.replaceWith(input);
        input.focus();
        input.select();
    }
    window.editMessage = editMessage;

    function updateEditedMessage(messageId, content) {
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (!msg) return;
        const textEl = msg.querySelector('.msg-text');
        if (textEl) textEl.textContent = content;

        // Add edited tag if not present
        if (!msg.querySelector('.msg-edited-tag')) {
            const tag = document.createElement('span');
            tag.className = 'msg-edited-tag';
            tag.textContent = 'edited';
            const bubble = msg.querySelector('.msg-bubble');
            const meta = bubble.querySelector('.msg-meta');
            bubble.insertBefore(tag, meta);
        }
    }

    // ── Delete Message ──────────────────────────────────────
    function deleteMessage(messageId) {
        if (!confirm('Delete this message?')) return;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'delete',
                message_id: messageId,
            }));
        }
    }
    window.deleteMessage = deleteMessage;

    function markMessageDeleted(messageId) {
        const msg = messagesArea.querySelector(`[data-msg-id="${messageId}"]`);
        if (!msg) return;
        msg.classList.add('deleted');
        const bubble = msg.querySelector('.msg-bubble');
        if (bubble) {
            bubble.innerHTML = `
                <p class="msg-deleted"><span class="material-icons-round">block</span> This message was deleted</p>
                <div class="msg-meta"><span class="msg-time">${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
            `;
        }
    }

    // ── User Status ─────────────────────────────────────────
    function updateUserStatus(username, isOnline) {
        if (headerStatus && headerStatusDot) {
            headerStatus.textContent = isOnline ? 'Online' : 'Offline';
            if (isOnline) {
                headerStatusDot.classList.add('online');
            } else {
                headerStatusDot.classList.remove('online');
            }
        }
    }

    // ── Emoji Picker ────────────────────────────────────────
    const EMOJI_LIST = [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
        '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
        '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫',
        '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒',
        '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
        '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
        '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯',
        '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢',
        '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤',
        '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹',
        '👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞', '🤟', '🫶',
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '💥',
        '⭐', '🌟', '✨', '💫', '🔥', '💎', '🎉', '🎊', '🎈', '🎁',
    ];

    function initEmojiPicker() {
        if (!emojiGrid) return;
        EMOJI_LIST.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.onclick = () => {
                messageInput.value += emoji;
                messageInput.focus();
            };
            emojiGrid.appendChild(span);
        });
    }

    function toggleEmojiPicker() {
        if (emojiPicker) {
            const isVisible = emojiPicker.style.display !== 'none';
            emojiPicker.style.display = isVisible ? 'none' : 'block';
        }
    }
    window.toggleEmojiPicker = toggleEmojiPicker;

    initEmojiPicker();

    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
        if (emojiPicker && emojiPicker.style.display === 'block') {
            const btn = document.getElementById('emojiBtn');
            if (!emojiPicker.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                emojiPicker.style.display = 'none';
            }
        }
    });

    // ── Message Search ──────────────────────────────────────
    function toggleMessageSearch() {
        if (messageSearchBar) {
            const isVisible = messageSearchBar.style.display !== 'none';
            messageSearchBar.style.display = isVisible ? 'none' : 'flex';
            if (!isVisible && messageSearchInput) {
                messageSearchInput.focus();
            }
        }
    }
    window.toggleMessageSearch = toggleMessageSearch;

    if (messageSearchInput) {
        messageSearchInput.addEventListener('input', () => {
            const query = messageSearchInput.value.toLowerCase();
            const msgs = messagesArea.querySelectorAll('.message');
            msgs.forEach(msg => {
                const text = msg.querySelector('.msg-text')?.textContent.toLowerCase() || '';
                if (query && !text.includes(query)) {
                    msg.style.opacity = '0.3';
                } else {
                    msg.style.opacity = '1';
                }
            });
        });
    }

    // ── Media Upload ────────────────────────────────────────
    function uploadMedia(input) {
        if (!input.files || !input.files[0]) return;

        const file = input.files[0];
        const formData = new FormData();
        formData.append('media', file);
        formData.append('caption', file.name);

        fetch(`/chat/${conversationId}/upload/`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRFToken': getCsrfToken(),
            },
        })
            .then(res => res.json())
            .then(data => {
                if (data.message) {
                    appendMessage(data.message);
                }
            })
            .catch(err => console.error('[Nexus] Upload error:', err));

        input.value = '';
    }
    window.uploadMedia = uploadMedia;

    // ── Utility ─────────────────────────────────────────────
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getCsrfToken() {
        const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
        return cookie ? cookie.split('=')[1] : '';
    }

    // ── Mark visible messages as read on scroll ─────────────
    if (messagesArea) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const msgEl = entry.target;
                    const msgId = msgEl.getAttribute('data-msg-id');
                    const sender = msgEl.getAttribute('data-sender');
                    if (sender !== currentUser && msgId) {
                        sendReadReceipt(parseInt(msgId));
                    }
                }
            });
        }, { root: messagesArea, threshold: 0.5 });

        // Observe received messages
        messagesArea.querySelectorAll('.message.received').forEach(msg => {
            observer.observe(msg);
        });
    }

})();
