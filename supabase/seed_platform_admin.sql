-- Run once, after the owner has registered through the normal sign-up page.
insert into platform_admins(user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
