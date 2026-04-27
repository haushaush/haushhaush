update email_messages_cache
set body_fetched_at = null,
    body_text = null,
    body_html = null
where body_fetched_at is not null
  and (body_html is null or length(body_html) < 50)
  and body_text is not null
  and length(body_text) > 100;