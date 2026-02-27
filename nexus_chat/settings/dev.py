"""
Nexus Chat Web — Development Settings
Uses Supabase PostgreSQL. Falls back to SQLite if Supabase is unreachable.
"""
import os
import socket
from .base import *  # noqa: F401,F403

DEBUG = True

# ── Supabase PostgreSQL Database ─────────────────────────────
# Credentials from Supabase Dashboard → Settings → Database
SUPABASE_HOST = os.environ.get('DB_HOST', 'db.mxgqwqlfizqicfictavu.supabase.co')
SUPABASE_PORT = os.environ.get('DB_PORT', '5432')


def _can_resolve_host(host):
    """Check if the Supabase host is resolvable from this machine."""
    try:
        socket.getaddrinfo(host, int(SUPABASE_PORT), socket.AF_UNSPEC, socket.SOCK_STREAM)
        return True
    except (socket.gaierror, OSError):
        return False


if _can_resolve_host(SUPABASE_HOST):
    # ✅ Supabase PostgreSQL (connected)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'postgres'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', 'Sainikhil2402@'),
            'HOST': SUPABASE_HOST,
            'PORT': SUPABASE_PORT,
            'OPTIONS': {
                'sslmode': 'require',
            },
        }
    }
    print('[Nexus] OK: Using Supabase PostgreSQL database')
else:
    # Fallback to SQLite (Supabase unreachable)
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
    print(f'[Nexus] WARN: Supabase host "{SUPABASE_HOST}" unreachable - using SQLite fallback')


# Channel layer — in-memory for development (no Redis needed)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}
