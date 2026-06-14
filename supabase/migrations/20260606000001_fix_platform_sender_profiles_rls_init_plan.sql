ALTER POLICY "platform_sender_profiles_user_policy"
ON public.platform_sender_profiles
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);
