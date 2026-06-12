--Use these for testing 

SELECT session_id, sender, message_text, created_at 
FROM public.chat_messages
ORDER BY created_at ASC;