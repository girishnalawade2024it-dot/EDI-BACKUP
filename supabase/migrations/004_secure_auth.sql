-- Enable pgcrypto for secure password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add session_token to users to replace insecure user_id localStorage
ALTER TABLE users ADD COLUMN session_token UUID UNIQUE;

-- 2. Hash all existing plaintext passwords in the database
UPDATE users 
SET password_hash = crypt(password_hash, gen_salt('bf'))
WHERE password_hash NOT LIKE '$2a$%'; -- basic check to avoid double-hashing if already hashed

-- 3. Create a secure login RPC function
-- Returns the user record (and generates a new session token) if credentials are valid
CREATE OR REPLACE FUNCTION authenticate_user(p_email VARCHAR, p_password VARCHAR)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
    v_token UUID;
BEGIN
    -- Find the user by email
    SELECT * INTO v_user FROM users WHERE email = p_email;
    
    -- Check if user exists and password matches
    IF v_user.user_id IS NOT NULL AND v_user.password_hash = crypt(p_password, v_user.password_hash) THEN
        -- Generate a new session token
        v_token := gen_random_uuid();
        
        -- Update the user with the new token
        UPDATE users SET session_token = v_token, last_login_at = CURRENT_TIMESTAMP WHERE user_id = v_user.user_id;
        
        -- Return user info securely (without password hash)
        RETURN json_build_object(
            'user_id', v_user.user_id,
            'name', v_user.name,
            'role_id', v_user.role_id,
            'session_token', v_token
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create an RPC to validate session (used by enforceAuth)
CREATE OR REPLACE FUNCTION validate_session(p_token UUID)
RETURNS JSON AS $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT * INTO v_user FROM users WHERE session_token = p_token;
    
    IF v_user.user_id IS NOT NULL THEN
        RETURN json_build_object(
            'user_id', v_user.user_id,
            'role_id', v_user.role_id
        );
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create an RPC to logout (invalidate session)
CREATE OR REPLACE FUNCTION invalidate_session(p_token UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users SET session_token = NULL WHERE session_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
