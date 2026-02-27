/**
 * ═══════════════════════════════════════════════════════════
 *  NEXUS CHAT WEB — App JavaScript
 *  Theme toggle, notifications, global interactions
 * ═══════════════════════════════════════════════════════════
 */

// ── Theme Management ────────────────────────────────────────
function getTheme() {
    return localStorage.getItem('nexus-theme') || 'dark';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexus-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        const icon = btn.querySelector('.material-icons-round');
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
}

function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
    setTheme(getTheme());
});


// ── Dropdown Toggle ─────────────────────────────────────────
function toggleDropdown(btn) {
    const menu = btn.closest('.dropdown').querySelector('.dropdown-menu');
    menu.classList.toggle('show');

    // Close on outside click
    const closeHandler = (e) => {
        if (!btn.closest('.dropdown').contains(e.target)) {
            menu.classList.remove('show');
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}


// ── Browser Notifications ───────────────────────────────────
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotification(title, body, icon) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: icon || '/static/img/default-avatar.svg',
            badge: '/static/img/default-avatar.svg',
        });
    }
}

document.addEventListener('DOMContentLoaded', requestNotificationPermission);


// ── Mobile Chat Toggle ──────────────────────────────────────
function closeChatMobile() {
    const app = document.getElementById('chatApp');
    if (app) {
        app.classList.remove('chat-open');
    }
}

// Auto-open chat on mobile if conversation is active
document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('chatApp');
    if (app && app.dataset.conversationId) {
        app.classList.add('chat-open');
    }
});


// ── Media Viewer ────────────────────────────────────────────
function openMediaViewer(src) {
    const viewer = document.getElementById('mediaViewer');
    const img = document.getElementById('mediaViewerImg');
    if (viewer && img) {
        img.src = src;
        viewer.style.display = 'flex';
    }
}

function closeMediaViewer() {
    const viewer = document.getElementById('mediaViewer');
    if (viewer) viewer.style.display = 'none';
}

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMediaViewer();
    }
});


// ── Sidebar Chat Search ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('chatSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        const items = document.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const name = item.querySelector('.conv-name')?.textContent.toLowerCase() || '';
            const preview = item.querySelector('.conv-preview')?.textContent.toLowerCase() || '';
            item.style.display = (name.includes(query) || preview.includes(query)) ? '' : 'none';
        });
    });
});


// ── Textarea Auto-resize ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('messageInput');
    if (!textarea) return;

    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
});
