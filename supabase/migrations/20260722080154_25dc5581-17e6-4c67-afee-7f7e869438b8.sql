
CREATE POLICY "referenzen manage meta ads"
ON public.referenz_meta_ads
FOR ALL
TO authenticated
USING (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'))
WITH CHECK (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'));

CREATE POLICY "referenzen manage meta campaigns"
ON public.referenz_meta_campaigns
FOR ALL
TO authenticated
USING (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'))
WITH CHECK (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'));

CREATE POLICY "referenzen manage showcase"
ON public.referenz_showcase
FOR ALL
TO authenticated
USING (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'))
WITH CHECK (public.user_has_permission(auth.uid(), 'sales.referenzen.manage'));
