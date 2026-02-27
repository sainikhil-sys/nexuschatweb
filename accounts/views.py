"""
Accounts — Views
Registration, login, logout, profile, user search, block/unblock.
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Q
from .forms import RegisterForm, LoginForm, ProfileForm
from .models import UserProfile, BlockedUser


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
    return render(request, 'accounts/register.html', {'form': form})


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
    return render(request, 'accounts/login.html', {'form': form})


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
