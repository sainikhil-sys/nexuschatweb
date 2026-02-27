"""
Accounts — Views
Registration, login, logout, profile, user search, block/unblock, Clerk auth.
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from .forms import RegisterForm, LoginForm, ProfileForm
from .models import UserProfile, BlockedUser
import json
import hashlib
import time


def register_view(request):
    if request.user.is_authenticated:
        return redirect('chat:chat_home')
    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            messages.success(request, 'Welcome to Nexus Chat!')
            return redirect('chat:chat_home')
    else:
        form = RegisterForm()
    return render(request, 'accounts/register.html', {
        'form': form,
        'clerk_publishable_key': settings.CLERK_PUBLISHABLE_KEY,
    })


def login_view(request):
    if request.user.is_authenticated:
        return redirect('chat:chat_home')
    if request.method == 'POST':
        form = LoginForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            user.profile.is_online = True
            user.profile.save()
            return redirect('chat:chat_home')
    else:
        form = LoginForm()
    return render(request, 'accounts/login.html', {
        'form': form,
        'clerk_publishable_key': settings.CLERK_PUBLISHABLE_KEY,
    })


@csrf_exempt
def clerk_callback(request):
    """Handle Clerk webhook/callback — syncs Clerk user into Django User."""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            clerk_id = data.get('id', '')
            email = data.get('email_addresses', [{}])[0].get('email_address', '')
            first_name = data.get('first_name', '')
            last_name = data.get('last_name', '')
            phone = data.get('phone_numbers', [{}])[0].get('phone_number', '')

            username = email.split('@')[0] if email else f'clerk_{clerk_id[:8]}'

            user, created = User.objects.get_or_create(
                email=email if email else f'{clerk_id}@clerk.local',
                defaults={
                    'username': username,
                    'first_name': first_name,
                    'last_name': last_name,
                }
            )
            if created:
                user.set_unusable_password()
                user.save()

            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            return JsonResponse({'status': 'ok', 'redirect': '/chat/'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

    return redirect('accounts:login')


@csrf_exempt
def send_otp_view(request):
    """Send OTP to phone (placeholder — generates server-side code)."""
    if request.method == 'POST':
        data = json.loads(request.body)
        phone = data.get('phone', '')
        if not phone:
            return JsonResponse({'status': 'error', 'message': 'Phone required'})

        # Generate a 6-digit OTP (in production, send via SMS gateway)
        otp_seed = f"{phone}{settings.SECRET_KEY}{int(time.time() // 300)}"
        otp = str(int(hashlib.sha256(otp_seed.encode()).hexdigest(), 16))[-6:]

        # Store in session for verification
        request.session['pending_otp'] = otp
        request.session['pending_phone'] = phone

        # In production: Send via Twilio/MSG91
        # For demo: log to console
        print(f"[Nexus OTP] {phone}: {otp}")

        return JsonResponse({'status': 'sent', 'message': 'Verification code sent'})

    return JsonResponse({'status': 'error'}, status=405)


@csrf_exempt
def verify_otp_view(request):
    """Verify OTP and log in / create user."""
    if request.method == 'POST':
        data = json.loads(request.body)
        otp = data.get('otp', '')
        phone = data.get('phone', '')

        expected_otp = request.session.get('pending_otp', '')
        expected_phone = request.session.get('pending_phone', '')

        if otp == expected_otp and phone == expected_phone:
            # Find or create user by phone
            username = f'user_{phone[-4:]}'
            user, created = User.objects.get_or_create(
                username=username,
                defaults={'first_name': f'User {phone[-4:]}'}
            )
            if created:
                user.set_unusable_password()
                user.save()

            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            del request.session['pending_otp']
            del request.session['pending_phone']

            return JsonResponse({'status': 'verified', 'redirect': '/chat/'})

        return JsonResponse({'status': 'error', 'message': 'Invalid verification code'})

    return JsonResponse({'status': 'error'}, status=405)


@login_required
def logout_view(request):
    request.user.profile.is_online = False
    request.user.profile.save()
    logout(request)
    return redirect('accounts:login')


@login_required
def profile_view(request):
    profile = request.user.profile
    if request.method == 'POST':
        form = ProfileForm(request.POST, request.FILES, instance=profile)
        if form.is_valid():
            form.save()
            request.user.first_name = form.cleaned_data.get('first_name', '')
            request.user.last_name = form.cleaned_data.get('last_name', '')
            request.user.save()
            messages.success(request, 'Profile updated!')
            return redirect('accounts:profile')
    else:
        form = ProfileForm(instance=profile, initial={
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
        })
    return render(request, 'accounts/profile.html', {'form': form})


@login_required
def user_profile_view(request, username):
    target_user = get_object_or_404(User, username=username)
    is_blocked = BlockedUser.objects.filter(
        blocker=request.user, blocked=target_user
    ).exists()
    return render(request, 'accounts/user_profile.html', {
        'target_user': target_user,
        'is_blocked': is_blocked,
    })


@login_required
def search_users(request):
    query = request.GET.get('q', '').strip()
    users = []
    if query:
        users = User.objects.filter(
            Q(username__icontains=query) |
            Q(first_name__icontains=query) |
            Q(last_name__icontains=query)
        ).exclude(id=request.user.id)[:20]
    if request.headers.get('Accept') == 'application/json':
        data = [{
            'id': u.id,
            'username': u.username,
            'name': u.get_full_name() or u.username,
            'avatar': u.profile.avatar_url,
            'is_online': u.profile.is_online,
        } for u in users]
        return JsonResponse({'users': data})
    return render(request, 'accounts/search.html', {'users': users, 'query': query})


@login_required
def block_user(request, user_id):
    target = get_object_or_404(User, id=user_id)
    BlockedUser.objects.get_or_create(blocker=request.user, blocked=target)
    if request.headers.get('Accept') == 'application/json':
        return JsonResponse({'status': 'blocked'})
    return redirect('accounts:user_profile', username=target.username)


@login_required
def unblock_user(request, user_id):
    BlockedUser.objects.filter(blocker=request.user, blocked_id=user_id).delete()
    if request.headers.get('Accept') == 'application/json':
        return JsonResponse({'status': 'unblocked'})
    return redirect('accounts:user_profile', username=User.objects.get(id=user_id).username)
