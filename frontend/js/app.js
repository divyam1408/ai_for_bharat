/* ══════════════════════════════════════════════════════════════════════════
   SPA Router & Shared Utilities
   ══════════════════════════════════════════════════════════════════════════ */

const API_BASE = '';  // same origin

// ── State ─────────────────────────────────────────────────────────────────

function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

function getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}
function setUser(user) { localStorage.setItem('user', JSON.stringify(user)); }

// ── API Fetch wrapper ─────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Request failed');
    }
    return res.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Router ────────────────────────────────────────────────────────────────

const routes = {};

function registerRoute(path, handler) {
    routes[path] = handler;
}

function navigate(hash) {
    window.location.hash = hash;
}

function getRouteParams(pattern, hash) {
    // Simple pattern matching for :param segments
    const patternParts = pattern.split('/');
    const hashParts = hash.split('/');
    if (patternParts.length !== hashParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = hashParts[i];
        } else if (patternParts[i] !== hashParts[i]) {
            return null;
        }
    }
    return params;
}

async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/login';
    const app = document.getElementById('app');

    // Check if user needs to be logged in
    const user = getUser();
    const publicRoutes = ['/login', '/register'];
    if (!user && !publicRoutes.includes(hash)) {
        navigate('/login');
        return;
    }

    // Try exact match first
    if (routes[hash]) {
        await routes[hash](app, {});
        return;
    }

    // Try pattern match
    for (const [pattern, handler] of Object.entries(routes)) {
        const params = getRouteParams(pattern, hash);
        if (params) {
            await handler(app, params);
            return;
        }
    }

    // 404
    app.innerHTML = `
        <div class="auth-container">
            <div class="card auth-card" style="text-align:center">
                <div style="font-size:4rem;margin-bottom:1rem">🔍</div>
                <h2>Page Not Found</h2>
                <p style="color:var(--text-secondary);margin:1rem 0">The page you're looking for doesn't exist.</p>
                <button class="btn btn-primary" onclick="navigate('/login')">Go Home</button>
            </div>
        </div>`;
}

// ── Navbar helper ─────────────────────────────────────────────────────────

function renderNavbar(role) {
    const user = getUser();
    const isPatient = role === 'patient';

    return `
    <nav class="navbar">
        <div class="navbar-brand">
            <span class="logo-icon">🏥</span>
            <span>AI Healthcare</span>
        </div>
        <div class="navbar-actions">
            ${isPatient ? `
                <button class="btn btn-sm btn-secondary" onclick="navigate('/patient')">Dashboard</button>
                <button class="btn btn-sm btn-teal" onclick="navigate('/patient/chat')">New Diagnosis</button>
            ` : `
                <button class="btn btn-sm btn-secondary" onclick="navigate('/doctor')">Dashboard</button>
            `}
            <span class="navbar-user">👤 ${user?.name || ''}</span>
            <button class="btn btn-sm btn-secondary" onclick="logout()">Logout</button>
        </div>
    </nav>`;
}

function logout() {
    clearToken();
    navigate('/login');
    showToast('Logged out successfully', 'info');
}

// ── Init ──────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', () => {
    // If no hash, redirect based on user role or to login
    if (!window.location.hash) {
        const user = getUser();
        if (user) {
            navigate(user.role === 'doctor' ? '/doctor' : '/patient');
        } else {
            navigate('/login');
        }
    } else {
        handleRoute();
    }
});
