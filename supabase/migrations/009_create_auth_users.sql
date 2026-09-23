-- =========================================
-- EDI Project - Supabase Auth Integration
-- Migration 009: Link Auth Users & Seed Real Passwords
-- =========================================
-- Run this in the Supabase Dashboard -> SQL Editor
-- (as the 'postgres' superuser).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add auth_id reference column to public.users if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'users' 
          AND column_name = 'auth_id'
    ) THEN
        ALTER TABLE public.users ADD COLUMN auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Helper function to create/register auth user safely in GoTrue
CREATE OR REPLACE FUNCTION create_edi_auth_user(
    p_email TEXT,
    p_password TEXT,
    p_name TEXT,
    p_role TEXT
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        -- Insert into Supabase auth.users
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token,
            is_super_admin
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            p_email,
            crypt(p_password, gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            json_build_object('name', p_name, 'role', p_role),
            NOW(),
            NOW(),
            '',
            '',
            '',
            '',
            FALSE
        );

        -- Insert into auth.identities (required by GoTrue for password sign in)
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_user_id,
            json_build_object('sub', v_user_id::text, 'email', p_email),
            'email',
            p_email,
            NOW(),
            NOW(),
            NOW()
        );
    ELSE
        -- Update password in case it needs to be synced
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    -- Link back to public.users
    UPDATE public.users
    SET auth_id = v_user_id,
        updated_at = NOW()
    WHERE email = p_email;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Register the 3 core project accounts with production bcrypt credentials
DO $$
BEGIN
    -- Faculty: Dr. Anjali Deshmukh
    PERFORM create_edi_auth_user('anjali.deshmukh@college.edu', 'Faculty@123', 'Dr. Anjali Deshmukh', 'Faculty');

    -- Lab Assistant: Amit Patil
    PERFORM create_edi_auth_user('amit.patil@college.edu', 'Assistant@123', 'Amit Patil', 'Lab Assistant');

    -- Admin: Admin User
    PERFORM create_edi_auth_user('admin@college.edu', 'Admin@123', 'Admin User', 'Admin');

    -- Optional additional seed users:
    PERFORM create_edi_auth_user('rahul.kulkarni@college.edu', 'Faculty@123', 'Prof. Rahul Kulkarni', 'Faculty');
    PERFORM create_edi_auth_user('sneha.joshi@college.edu', 'Assistant@123', 'Sneha Joshi', 'Lab Assistant');
END $$;

-- 4. Clean up helper function
DROP FUNCTION IF EXISTS create_edi_auth_user(TEXT, TEXT, TEXT, TEXT);

-- 5. Expose auth_id in users select grant
GRANT SELECT (auth_id) ON public.users TO anon, authenticated;

