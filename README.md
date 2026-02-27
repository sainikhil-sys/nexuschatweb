# Nexus Chat Web 🚀

A modern, real-time chat platform built with Django, Django Channels, and a premium glassmorphism UI. Features WebSocket messaging, presence, media sharing, emoji reactions, and a 3-panel responsive chat interface.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![Django](https://img.shields.io/badge/Django-4.2-green?logo=django)
![Channels](https://img.shields.io/badge/Channels-4.0-purple)

---

## ✨ Features

| Feature | Status |
|---------|--------|
| Real-time messaging (WebSocket) | ✅ |
| Typing indicators | ✅ |
| Delivered / Read receipts | ✅ |
| Emoji picker & reactions | ✅ |
| Edit & delete messages | ✅ |
| Media sharing (images, video, docs) | ✅ |
| Online/offline presence & last seen | ✅ |
| Dark / Light theme toggle | ✅ |
| User search & profile viewing | ✅ |
| Pin & archive conversations | ✅ |
| Block / unblock users | ✅ |
| Admin dashboard with analytics | ✅ |
| Responsive (mobile, tablet, desktop) | ✅ |
| REST API (DRF) | ✅ |
| Docker deployment ready | ✅ |

---

## 🚀 Quick Start (Development)

### Prerequisites
- Python 3.10+
- pip

### Setup

```bash
# 1. Clone and enter directory
cd SDF

# 2. Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run migrations
python manage.py makemigrations
python manage.py migrate

# 5. Create superuser
python manage.py createsuperuser

# 6. Run development server
python manage.py runserver
```

Open **http://127.0.0.1:8000** in your browser.

> **Note**: Development uses SQLite and InMemoryChannelLayer — no Redis or PostgreSQL needed.

---

## 🏗️ Project Structure

```
SDF/
├── nexus_chat/         # Django project config
│   └── settings/       # base, dev, prod
├── accounts/           # Auth, profiles, presence
├── chat/               # Messages, WebSocket consumers
├── core/               # Landing page, admin dashboard
├── api/                # REST API (DRF)
├── templates/          # HTML templates
├── static/             # CSS, JS, images
├── media/              # Uploaded files
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

---

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up --build

# Run migrations inside container
docker-compose exec web python manage.py migrate
docker-compose exec web python manage.py createsuperuser
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users/` | GET | List users |
| `/api/users/me/` | GET | Current user |
| `/api/conversations/` | GET | User's conversations |
| `/api/conversations/{id}/messages/` | GET | Conversation messages |
| `/api/messages/` | GET/POST | Messages CRUD |

---

## 🔧 Tech Stack

- **Backend**: Django 4.2, Django Channels, Django REST Framework
- **WebSocket**: Channels with InMemory (dev) / Redis (prod) channel layer
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Design**: Custom glassmorphism theme, Inter font, Material Icons
- **Deployment**: Docker, Nginx, Daphne ASGI server

---

## 📝 License

This project is licensed under the MIT License.
