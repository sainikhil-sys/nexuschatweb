"""
Nexus Chat Web — Production Settings
Uses PostgreSQL or SQLite fallback.
"""
import os
from pathlib import Path
from .base import *  # noqa: F401,F403

DEBUG = False

SECRET_KEY = os.environ.get('SECRET_KEY', 'fallback-key-change-me')

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '.onrender.com,.vercel.app').split(',')
if '*' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.extend(['localhost', '127.0.0.1'])

import dj_database_url

# ── Database (PostgreSQL via DATABASE_URL, or SQLite fallback) ──
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600
        )
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
        }
    }

# ── Channel Layer ─────────────────────────────────────────────
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}

# ── Static Files ──────────────────────────────────────────────
# On Vercel, static files are served via the @vercel/static build.
# WhiteNoise is used for Render or other platforms.
STATICFILES_DIR = os.path.join(BASE_DIR, 'staticfiles')
if os.path.isdir(STATICFILES_DIR):
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')
    STORAGES = {
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }

# ── Security ──────────────────────────────────────────────────
SECURE_SSL_REDIRECT = False  # Vercel/Render handle SSL at the edge
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
CSRF_TRUSTED_ORIGINS = [
    f"https://{host.strip()}" for host in ALLOWED_HOSTS if host.strip() and not host.startswith('.')
] + [
    'https://*.vercel.app',
    'https://*.onrender.com',
]

# ── Session Engine ────────────────────────────────────────────
# On Vercel serverless, file-based sessions won't persist.
# Use cookie-based sessions for stateless deployment.
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
