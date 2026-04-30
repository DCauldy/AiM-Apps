-- Update monthly limits: AiM members 25, standalone 5
-- Also updates the handle_new_user trigger for future signups

-- Update existing profiles
UPDATE profiles SET monthly_limit = 25 WHERE account_type = 'aim_member';
UPDATE profiles SET monthly_limit = 5 WHERE account_type = 'standalone';

-- Update trigger for new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, account_type, monthly_limit)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'account_type', 'standalone'),
    case
      when new.raw_user_meta_data->>'account_type' = 'aim_member' then 25
      else 5
    end
  );
  return new;
end;
$$;
