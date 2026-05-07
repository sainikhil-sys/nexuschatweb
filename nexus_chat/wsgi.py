"""
WSGI config for Nexus Chat Web.
"""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nexus_chat.settings.dev')
application = get_wsgi_application()
