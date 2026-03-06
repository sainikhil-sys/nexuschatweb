"""
Nexus Chat Web — Development Settings
Uses MongoDB via djongo connector.
"""
from .base import *  # noqa: F401,F403

DEBUG = True

ALLOWED_HOSTS = ['*']  # Allow all connections for local network testing

# ── MongoDB Database ─────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'djongo',
        'NAME': 'nexus_chat',
        'CLIENT': {
            'host': 'localhost',
            'port': 27017,
        }
    }
}
print('[Nexus] Using MongoDB database on localhost:27017')

# ── Channel layer — in-memory for development (no Redis needed) ──
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}
