-- Create a function to update thread starred status
-- This function ensures boolean false values are properly handled
CREATE OR REPLACE FUNCTION public.update_thread_starred(
  p_thread_id uuid,
  p_user_id uuid,
  p_starred boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Update the thread if it belongs to the user
  UPDATE public.threads
  SET starred = p_starred,
      updated_at = now()
  WHERE id = p_thread_id
    AND user_id = p_user_id;
  
  -- Return the updated thread data
  SELECT jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'title', title,
    'starred', starred,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.threads
  WHERE id = p_thread_id
    AND user_id = p_user_id;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_thread_starred(uuid, uuid, boolean) TO authenticated;




