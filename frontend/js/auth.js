/* ══════════════════════════════════════════════════════════════════════════
   Auth Pages — Login & Register
   ══════════════════════════════════════════════════════════════════════════ */

// ── Login ─────────────────────────────────────────────────────────────────

registerRoute('/login', async (app) => {
    app.innerHTML = `
    <div class="auth-container">
        <div class="card auth-card">
            <div class="auth-logo">🏥</div>
            <h1 class="auth-title">AI Healthcare</h1>
            <p class="auth-subtitle">Rural Diagnosis System — Sign in to continue</p>

            <form id="login-form">
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="login-email"
                           placeholder="you@example.com" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-input" id="login-password"
                           placeholder="Enter your password" required>
                </div>
                <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="login-btn">
                    Sign In
                </button>
            </form>

            <div class="auth-footer">
                Don't have an account? <a href="#/register">Register here</a>
            </div>
        </div>
    </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Signing in...';

        try {
            const data = await apiFetch('/api/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: document.getElementById('login-email').value,
                    password: document.getElementById('login-password').value,
                }),
            });

            setToken(data.access_token);
            setUser({ user_id: data.user_id, name: data.name, role: data.role });
            showToast(`Welcome back, ${data.name}!`, 'success');
            navigate(data.role === 'doctor' ? '/doctor' : '/patient');
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    });
});

// ── Register ──────────────────────────────────────────────────────────────

registerRoute('/register', async (app) => {
    let selectedRole = 'patient';

    app.innerHTML = `
    <div class="auth-container">
        <div class="card auth-card">
            <div class="auth-logo">🏥</div>
            <h1 class="auth-title">Create Account</h1>
            <p class="auth-subtitle">Join the AI Healthcare platform</p>

            <div class="auth-tabs">
                <button class="auth-tab active" data-role="patient" id="tab-patient">🧑 Patient</button>
                <button class="auth-tab" data-role="doctor" id="tab-doctor">🩺 Doctor</button>
            </div>

            <form id="register-form">
                <div class="form-group">
                    <label class="form-label">Full Name</label>
                    <input type="text" class="form-input" id="reg-name"
                           placeholder="Enter your full name" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" id="reg-email"
                           placeholder="you@example.com" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-input" id="reg-password"
                           placeholder="Create a password" required minlength="4">
                </div>
                <div class="form-group" id="specialization-group" style="display:none">
                    <label class="form-label">Specialization</label>
                    <input type="text" class="form-input" id="reg-specialization"
                           placeholder="e.g. General Medicine, Pediatrics">
                </div>
                <div id="patient-profile-group">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Date of Birth</label>
                            <input type="date" class="form-input" id="reg-dob"
                                   max="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Gender</label>
                            <select class="form-select" id="reg-gender">
                                <option value="">Prefer not to say</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="reg-btn">
                    Create Account
                </button>
            </form>

            <div class="auth-footer">
                Already have an account? <a href="#/login">Sign in</a>
            </div>
        </div>
    </div>`;

    // Role tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectedRole = tab.dataset.role;
            document.getElementById('specialization-group').style.display =
                selectedRole === 'doctor' ? 'block' : 'none';
            document.getElementById('patient-profile-group').style.display =
                selectedRole === 'patient' ? 'block' : 'none';
        });
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('reg-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating account...';

        try {
            const body = {
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                password: document.getElementById('reg-password').value,
                role: selectedRole,
            };
            if (selectedRole === 'doctor') {
                body.specialization = document.getElementById('reg-specialization').value || null;
            }
            if (selectedRole === 'patient') {
                const dob = document.getElementById('reg-dob').value;
                if (dob) {
                    const today = new Date();
                    const birth = new Date(dob);
                    let age = today.getFullYear() - birth.getFullYear();
                    const notYetHadBirthday =
                        today.getMonth() < birth.getMonth() ||
                        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
                    if (notYetHadBirthday) age--;
                    body.age = age;
                } else {
                    body.age = null;
                }
                body.gender = document.getElementById('reg-gender').value || null;
            }

            const data = await apiFetch('/api/register', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            setToken(data.access_token);
            setUser({ user_id: data.user_id, name: data.name, role: data.role });
            showToast(`Welcome, ${data.name}! Account created.`, 'success');
            navigate(data.role === 'doctor' ? '/doctor' : '/patient');
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });
});
