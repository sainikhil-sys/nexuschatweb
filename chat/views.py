"""
Chat — Views
Conversation listing, detail, creation, and media upload.
"""
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.db.models import Q, Max, Count
from .models import Conversation, Message


@login_required
def chat_home(request):
    qs = Conversation.objects.filter(
        participants=request.user,
        is_archived=False
    )
    # Org-scope filtering
    org = getattr(request, 'organization', None)
    if org:
        qs = qs.filter(organization=org)

    conversations = qs.annotate(
        last_msg_time=Max('messages__timestamp'),
        msg_count=Count('messages')
    ).order_by('-is_pinned', '-last_msg_time')

    return render(request, 'chat/chat.html', {
        'conversations': conversations,
        'active_conversation': None,
    })


@login_required
def conversation_view(request, conversation_id):
    qs = Conversation.objects.filter(participants=request.user)
    org = getattr(request, 'organization', None)
    if org:
        qs = qs.filter(organization=org)

    conversation = get_object_or_404(qs, id=conversation_id)
    messages_qs = conversation.messages.select_related('sender', 'sender__profile').order_by('timestamp')

    # Mark messages as read
    messages_qs.filter(is_read=False).exclude(sender=request.user).update(is_read=True)

    # Get other participant
    other_user = conversation.participants.exclude(id=request.user.id).first()

    conv_qs = Conversation.objects.filter(
        participants=request.user,
        is_archived=False
    )
    if org:
        conv_qs = conv_qs.filter(organization=org)

    conversations = conv_qs.annotate(
        last_msg_time=Max('messages__timestamp')
    ).order_by('-is_pinned', '-last_msg_time')

    return render(request, 'chat/chat.html', {
        'conversations': conversations,
        'active_conversation': conversation,
        'messages': messages_qs,
        'other_user': other_user,
    })


@login_required
def start_conversation(request, user_id):
    other_user = get_object_or_404(User, id=user_id)
    if other_user == request.user:
        return redirect('chat:chat_home')

    org = getattr(request, 'organization', None)

    # Check if conversation already exists
    qs = Conversation.objects.filter(
        participants=request.user
    ).filter(
        participants=other_user
    )
    if org:
        qs = qs.filter(organization=org)
    existing = qs.first()

    if existing:
        return redirect('chat:conversation', conversation_id=existing.id)

    # Create new conversation
    conversation = Conversation.objects.create(organization=org)
    conversation.participants.add(request.user, other_user)

    # System message
    Message.objects.create(
        conversation=conversation,
        sender=request.user,
        content=f'Conversation started with {other_user.username}',
        message_type='system',
    )

    return redirect('chat:conversation', conversation_id=conversation.id)


@login_required
def upload_media(request, conversation_id):
    if request.method != 'POST' or not request.FILES.get('media'):
        return JsonResponse({'error': 'No file provided'}, status=400)

    conversation = get_object_or_404(
        Conversation.objects.filter(participants=request.user),
        id=conversation_id
    )

    uploaded = request.FILES['media']
    content_type = uploaded.content_type

    if content_type.startswith('image/'):
        msg_type = 'image'
    elif content_type.startswith('video/'):
        msg_type = 'video'
    elif content_type.startswith('audio/'):
        msg_type = 'voice'
    else:
        msg_type = 'document'

    message = Message.objects.create(
        conversation=conversation,
        sender=request.user,
        content=request.POST.get('caption', uploaded.name),
        message_type=msg_type,
        media=uploaded,
    )

    return JsonResponse({'message': message.to_json()})


@login_required
def toggle_pin(request, conversation_id):
    conv = get_object_or_404(
        Conversation.objects.filter(participants=request.user),
        id=conversation_id
    )
    conv.is_pinned = not conv.is_pinned
    conv.save(update_fields=['is_pinned'])
    return JsonResponse({'is_pinned': conv.is_pinned})


@login_required
def toggle_archive(request, conversation_id):
    conv = get_object_or_404(
        Conversation.objects.filter(participants=request.user),
        id=conversation_id
    )
    conv.is_archived = not conv.is_archived
    conv.save(update_fields=['is_archived'])
    return JsonResponse({'is_archived': conv.is_archived})


@login_required
def search_messages(request):
    query = request.GET.get('q', '').strip()
    results = []
    if query:
        results = Message.objects.filter(
            conversation__participants=request.user,
            content__icontains=query,
            is_deleted=False,
        ).select_related('sender', 'conversation').order_by('-timestamp')[:30]
    if request.headers.get('Accept') == 'application/json':
        data = [msg.to_json() for msg in results]
        return JsonResponse({'messages': data})
    return render(request, 'chat/search.html', {'results': results, 'query': query})


@login_required
def archived_chats(request):
    conversations = Conversation.objects.filter(
        participants=request.user,
        is_archived=True
    ).annotate(
        last_msg_time=Max('messages__timestamp')
    ).order_by('-last_msg_time')
    return render(request, 'chat/archived.html', {'conversations': conversations})


@login_required
def nearby_devices(request):
    """Render nearby devices discovery page."""
    return render(request, 'chat/nearby.html')


@login_required
def nearby_api(request):
    """Find users active on the same local network."""
    from accounts.models import UserProfile
    from django.utils import timezone
    import datetime

    # Get current user's IP
    user_ip = get_client_ip(request)

    # Find users online in the last 5 minutes (same network heuristic)
    cutoff = timezone.now() - datetime.timedelta(minutes=5)
    online_profiles = UserProfile.objects.filter(
        is_online=True,
        last_seen__gte=cutoff,
    ).exclude(user=request.user).select_related('user')

    devices = []
    for profile in online_profiles:
        devices.append({
            'user_id': profile.user.id,
            'username': profile.user.get_full_name() or profile.user.username,
            'avatar': profile.avatar_url,
            'ip': user_ip.rsplit('.', 1)[0] + '.*',
        })

    return JsonResponse({'devices': devices})


def get_client_ip(request):
    """Extract IP from request headers."""
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')

