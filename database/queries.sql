--Use these for testing 

SELECT session_id, sender, message_text, created_at 
FROM public.chat_messages
ORDER BY created_at ASC;

SELECT 
    s.user_id,
    m.session_id,
    m.sender,
    m.message_text,
    m.created_at
FROM public.chat_messages m
JOIN public.chat_sessions s ON m.session_id = s.session_id
ORDER BY m.created_at ASC;