UPDATE referenz_showcase 
SET thumbnail_url = fallback_image_url 
WHERE thumbnail_url IS NULL AND fallback_image_url IS NOT NULL;