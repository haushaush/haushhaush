update email_messages_cache
set body_fetched_at = null
where body_fetched_at is not null
  and (body_text is null or body_text = '')
  and (body_html is null or body_html = '');