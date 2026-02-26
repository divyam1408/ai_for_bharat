/* ══════════════════════════════════════════════════════════════════════════
   Patient Pages — Dashboard, AI Chatbot, Feedback Response, Prescription
   ══════════════════════════════════════════════════════════════════════════ */

// ── Helper: upload a file ─────────────────────────────────────────────────

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail);
    }
    return res.json();
}

function renderAttachment(url) {
    if (!url) return '';
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
    if (isImage) {
        return `<div class="attachment-preview"><img src="${url}" alt="attachment" class="chat-image" onclick="window.open('${url}','_blank')"></div>`;
    }
    const filename = url.split('/').pop();
    return `<div class="attachment-preview"><a href="${url}" target="_blank" class="attachment-link">📎 ${filename}</a></div>`;
}

// ── Patient Dashboard ─────────────────────────────────────────────────────

registerRoute('/patient', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">Your Health Dashboard</h1>
                <p class="page-subtitle">View your diagnosis history and start new consultations</p>
            </div>
            <button class="btn btn-teal btn-lg" onclick="navigate('/patient/chat')">
                💬 Start New Diagnosis
            </button>
        </div>
        <div id="reports-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading your reports...</p>
            </div>
        </div>
    </div>`;

    try {
        const data = await apiFetch('/api/patient/reports');
        const area = document.getElementById('reports-area');

        if (!data.reports || data.reports.length === 0) {
            area.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🩺</div>
                    <p class="empty-state-text">No diagnoses yet</p>
                    <p style="color:var(--text-muted);margin-bottom:1.5rem">
                        Start a conversation with our AI assistant to get a preliminary diagnosis.
                    </p>
                    <button class="btn btn-teal" onclick="navigate('/patient/chat')">
                        Start Your First Diagnosis
                    </button>
                </div>`;
            return;
        }

        const total = data.reports.length;
        const completed = data.reports.filter(r => r.status === 'completed').length;
        const feedback = data.reports.filter(r => r.status === 'feedback_requested').length;
        const pending = data.reports.filter(r => r.status === 'pending_review').length;

        area.innerHTML = `
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Reports</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">Doctor Reviewed</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${pending}</div>
                    <div class="stat-label">Awaiting Review</div>
                </div>
                ${feedback > 0 ? `
                <div class="card stat-card" style="border-color:rgba(245,158,11,0.4)">
                    <div class="stat-value" style="background:linear-gradient(135deg,var(--accent-amber),var(--accent-rose));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${feedback}</div>
                    <div class="stat-label">Needs Your Response</div>
                </div>` : ''}
            </div>
            <h2 style="font-size:1.2rem;margin-bottom:1rem">Your Reports</h2>
            <div class="card-grid">
                ${data.reports.map(r => renderReportCard(r)).join('')}
            </div>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function renderReportCard(r) {
    const statusMap = {
        completed: { cls: 'completed', label: '✅ Doctor Reviewed' },
        pending_review: { cls: 'pending', label: '⏳ Awaiting Review' },
        feedback_requested: { cls: 'feedback', label: '🔄 Doctor Needs More Info' },
        chatting: { cls: 'chatting', label: '💬 Chat in Progress' },
    };
    const s = statusMap[r.status] || statusMap.chatting;
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });

    return `
    <div class="card" style="cursor:pointer" onclick="navigate('/patient/report/${r.id}')">
        <div class="card-header">
            <div class="card-title">${r.primary_condition || 'Chat Session'}</div>
            <span class="badge badge-${r.urgency || 'medium'}">${r.urgency || '—'}</span>
        </div>
        <span class="badge badge-status-${s.cls}" style="margin-bottom:0.75rem">${s.label}</span>
        ${r.confidence ? `
        <div class="diagnosis-field" style="margin-top:0.5rem">
            <div class="diagnosis-field-label">AI Confidence</div>
            <div class="confidence-bar">
                <div class="confidence-bar-fill" style="width:${Math.round(r.confidence * 100)}%"></div>
            </div>
            <span style="font-size:0.8rem;color:var(--text-muted)">${Math.round(r.confidence * 100)}%</span>
        </div>` : ''}
        ${r.status === 'completed' && r.final_diagnosis ? `
        <div class="diagnosis-field">
            <div class="diagnosis-field-label">Doctor's Diagnosis</div>
            <div class="diagnosis-field-value">${r.final_diagnosis}</div>
        </div>` : ''}
        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem">📅 ${date}</div>
    </div>`;
}

// ── Patient Report Detail ─────────────────────────────────────────────────

registerRoute('/patient/report/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container" style="max-width:900px">
        <div id="report-detail">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading report...</p>
            </div>
        </div>
    </div>`;

    try {
        const r = await apiFetch(`/api/patient/report/${params.id}`);
        const container = document.getElementById('report-detail');
        const statusMap = {
            completed: '✅ Doctor Reviewed',
            pending_review: '⏳ Awaiting Doctor Review',
            feedback_requested: '🔄 Doctor Needs More Info',
            chatting: '💬 Chat in Progress',
        };

        container.innerHTML = `
            <button class="btn btn-secondary btn-sm" onclick="navigate('/patient')" style="margin-bottom:1.5rem">
                ← Back to Dashboard
            </button>

            <h1 class="page-title">Diagnosis Report #${r.id}</h1>
            <span class="badge badge-status-${r.status === 'completed' ? 'completed' : r.status === 'feedback_requested' ? 'feedback' : 'pending'}"
                  style="margin:0.75rem 0;display:inline-flex">${statusMap[r.status] || r.status}</span>

            ${r.chat_history && r.chat_history.length ? `
            <div class="card" style="margin-top:1.5rem">
                <h3 class="card-title" style="margin-bottom:1rem">💬 Chat Conversation</h3>
                <div class="chat-history-panel">
                    ${r.chat_history.map(msg => `
                        <div class="chat-bubble ${msg.role === 'patient' ? 'patient' : 'assistant'}">
                            <div class="bubble-label">${msg.role === 'patient' ? 'You' : 'AI Assistant'}</div>
                            ${escapeHtml(msg.content)}
                            ${renderAttachment(msg.attachment_url)}
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${r.primary_condition ? `
            <div class="card diagnosis-card" style="margin-top:1.5rem">
                <h3 class="card-title" style="margin-bottom:1rem">🤖 AI Preliminary Diagnosis</h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Primary Condition</div>
                    <div class="diagnosis-field-value" style="font-size:1.1rem;font-weight:600">${r.primary_condition}</div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Confidence</div>
                        <div class="confidence-bar">
                            <div class="confidence-bar-fill" style="width:${Math.round(r.confidence * 100)}%"></div>
                        </div>
                        <span style="font-size:0.85rem">${Math.round(r.confidence * 100)}%</span>
                    </div>
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Urgency</div>
                        <span class="badge badge-${r.urgency}">${r.urgency}</span>
                    </div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Description</div>
                    <div class="diagnosis-field-value">${r.description}</div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Recommended Actions</div>
                    <div class="diagnosis-field-value">${r.recommended_actions}</div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Differential Diagnoses</div>
                    <div class="diagnosis-field-value">${r.differential_diagnoses}</div>
                </div>
            </div>` : ''}

            ${r.feedback_thread && r.feedback_thread.length ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(245,158,11,0.3)">
                <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">💬 Doctor-Patient Conversation</h3>
                <div class="chat-history-panel">
                    ${r.feedback_thread.map(msg => `
                        <div class="chat-bubble ${msg.sender_role === 'patient' ? 'patient' : 'assistant'}">
                            <div class="bubble-label">${msg.sender_role === 'patient' ? 'You' : '🩺 Doctor'}</div>
                            ${escapeHtml(msg.message)}
                            ${renderAttachment(msg.attachment_url)}
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}

            ${r.status === 'feedback_requested' ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(245,158,11,0.4);box-shadow:0 0 20px rgba(245,158,11,0.1)">
                <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">📝 Respond to Doctor</h3>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
                    The doctor has requested additional information. Please provide your response below.
                </p>
                <div class="form-group">
                    <textarea class="form-textarea" id="patient-response" rows="4"
                              placeholder="Type your response..."></textarea>
                </div>
                <div style="display:flex;gap:0.75rem;align-items:center">
                    <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                        📎 Attach Image
                        <input type="file" id="feedback-file" accept="image/*,.pdf" style="display:none"
                               onchange="handleFeedbackFileSelect(this)">
                    </label>
                    <span id="feedback-file-name" style="font-size:0.8rem;color:var(--text-muted)"></span>
                    <button class="btn btn-teal" style="margin-left:auto" id="send-response-btn"
                            onclick="sendPatientResponse(${r.id})">
                        Send Response
                    </button>
                </div>
            </div>` : ''}

            ${r.status === 'completed' && r.final_diagnosis ? `
            <div class="card" style="margin-top:1.5rem;border-color:rgba(34,197,94,0.3);box-shadow:0 0 20px rgba(34,197,94,0.1)">
                <h3 class="card-title" style="color:var(--accent-green);margin-bottom:1rem">
                    ✅ Doctor's Final Diagnosis
                </h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Final Diagnosis</div>
                    <div class="diagnosis-field-value" style="font-size:1.1rem;font-weight:600">${r.final_diagnosis}</div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Doctor's Comments</div>
                    <div class="diagnosis-field-value">${r.doctor_comments || 'No additional comments'}</div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Reviewed By</div>
                    <div class="diagnosis-field-value">Dr. ${r.doctor_name || 'Unknown'}</div>
                </div>
                ${r.was_modified ? '<span class="badge badge-medium" style="margin-top:0.5rem">Modified from AI diagnosis</span>' : ''}
                <button class="btn btn-primary btn-lg" style="width:100%;margin-top:1.5rem" onclick="printPrescription(${r.id})">
                    📥 Download Prescription
                </button>
            </div>` : ''}
        `;
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── Feedback response ─────────────────────────────────────────────────────

let feedbackFileToUpload = null;

window.handleFeedbackFileSelect = function (input) {
    feedbackFileToUpload = input.files[0] || null;
    document.getElementById('feedback-file-name').textContent =
        feedbackFileToUpload ? feedbackFileToUpload.name : '';
};

window.sendPatientResponse = async function (reportId) {
    const message = document.getElementById('patient-response').value.trim();
    if (!message) { showToast('Please type a response', 'error'); return; }

    const btn = document.getElementById('send-response-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        if (feedbackFileToUpload) {
            await uploadFile(feedbackFileToUpload);
        }
        await apiFetch(`/api/patient/respond/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
        showToast('Response sent to doctor!', 'success');
        feedbackFileToUpload = null;
        navigate(`/patient/report/${reportId}`);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Send Response';
    }
};

// ── Prescription PDF ──────────────────────────────────────────────────────

window.printPrescription = async function (reportId) {
    try {
        const r = await apiFetch(`/api/patient/report/${reportId}`);
        const date = new Date(r.review_date || r.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prescription — Report #${r.id}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a2e; line-height: 1.6; }
                .rx-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
                .rx-header h1 { font-size: 22px; color: #3b82f6; }
                .rx-header .meta { text-align: right; font-size: 13px; color: #666; }
                .rx-patient { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                .rx-patient .field { font-size: 14px; }
                .rx-patient .field strong { color: #333; }
                .rx-section { margin-bottom: 20px; }
                .rx-section h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #3b82f6; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
                .rx-section p { font-size: 14px; color: #334155; }
                .rx-diagnosis { font-size: 20px; font-weight: 700; color: #1a1a2e; margin: 8px 0; }
                .rx-actions { background: #eff6ff; border-radius: 8px; padding: 16px; }
                .rx-actions li { margin-bottom: 4px; font-size: 14px; }
                .rx-footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; padding-top: 16px; }
                .rx-footer .signature { text-align: right; }
                .rx-footer .signature .line { border-top: 1px solid #333; width: 200px; margin-bottom: 4px; }
                .rx-badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                .rx-badge.high, .rx-badge.critical { background: #fef2f2; color: #dc2626; }
                .rx-badge.medium { background: #fffbeb; color: #d97706; }
                .rx-badge.low { background: #f0fdf4; color: #16a34a; }
                @media print { body { padding: 20px; } }
            </style>
        </head>
        <body>
            <div class="rx-header">
                <div>
                    <h1>🏥 AI Healthcare</h1>
                    <div style="font-size:12px;color:#94a3b8">Rural Diagnosis System — Medical Prescription</div>
                </div>
                <div class="meta">
                    <div>Report #${r.id}</div>
                    <div>${date}</div>
                </div>
            </div>

            <div class="rx-patient">
                <div class="field"><strong>Patient:</strong> ${r.patient_name}</div>
                <div class="field"><strong>Age:</strong> ${r.age || '—'}</div>
                <div class="field"><strong>Gender:</strong> ${r.gender || '—'}</div>
                <div class="field"><strong>Urgency:</strong> <span class="rx-badge ${r.urgency}">${r.urgency}</span></div>
            </div>

            <div class="rx-section">
                <h3>Diagnosis</h3>
                <div class="rx-diagnosis">${r.final_diagnosis || r.primary_condition}</div>
                <p>${r.description || ''}</p>
            </div>

            ${r.doctor_comments ? `
            <div class="rx-section">
                <h3>Doctor's Notes</h3>
                <p>${r.doctor_comments}</p>
            </div>` : ''}

            <div class="rx-section">
                <h3>Recommended Actions</h3>
                <div class="rx-actions">
                    <ul>
                        ${(r.recommended_actions || '').split(/[,;•]/).filter(Boolean).map(a => `<li>${a.trim()}</li>`).join('')}
                    </ul>
                </div>
            </div>

            ${r.differential_diagnoses ? `
            <div class="rx-section">
                <h3>Differential Diagnoses</h3>
                <p style="font-size:13px;color:#64748b">${r.differential_diagnoses}</p>
            </div>` : ''}

            <div class="rx-footer">
                <div style="font-size:12px;color:#94a3b8">
                    <p>⚠️ This is an AI-assisted preliminary assessment.</p>
                    <p>Consult your healthcare provider for definitive treatment.</p>
                </div>
                <div class="signature">
                    <div class="line"></div>
                    <div style="font-size:13px;font-weight:600">Dr. ${r.doctor_name || '—'}</div>
                    <div style="font-size:11px;color:#94a3b8">Reviewing Physician</div>
                </div>
            </div>
        </body>
        </html>`);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    } catch (err) {
        showToast('Failed to generate prescription: ' + err.message, 'error');
    }
};

// ── Patient Chat (AI Diagnosis) ───────────────────────────────────────────

registerRoute('/patient/chat', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('patient') + `
    <div class="page-container" style="max-width:600px">
        <div class="card">
            <h2 class="card-title" style="margin-bottom:0.5rem">📋 Before We Start</h2>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem;font-size:0.9rem">
                Please provide some basic information. All fields are optional.
            </p>
            <form id="start-chat-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Age</label>
                        <input type="number" class="form-input" id="chat-age" placeholder="e.g. 35" min="1" max="120">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Gender</label>
                        <select class="form-select" id="chat-gender">
                            <option value="">Prefer not to say</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Medical History</label>
                    <textarea class="form-textarea" id="chat-history"
                              placeholder="Any past illnesses, surgeries, chronic conditions..."></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Current Medications</label>
                    <input type="text" class="form-input" id="chat-meds"
                           placeholder="e.g. Paracetamol, Metformin">
                </div>
                <button type="submit" class="btn btn-teal btn-lg" style="width:100%" id="start-btn">
                    💬 Start Chat with AI Doctor
                </button>
            </form>
        </div>
    </div>`;

    document.getElementById('start-chat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('start-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Starting...';
        try {
            const data = await apiFetch('/api/patient/start-chat', {
                method: 'POST',
                body: JSON.stringify({
                    age: document.getElementById('chat-age').value
                        ? parseInt(document.getElementById('chat-age').value) : null,
                    gender: document.getElementById('chat-gender').value || null,
                    medical_history: document.getElementById('chat-history').value || '',
                    current_medications: document.getElementById('chat-meds').value || '',
                }),
            });
            navigate(`/patient/chatroom/${data.report_id}`);
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '💬 Start Chat with AI Doctor';
        }
    });
});

// ── Patient Chatroom ──────────────────────────────────────────────────────

registerRoute('/patient/chatroom/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'patient') { navigate('/login'); return; }

    const reportId = params.id;

    app.innerHTML = renderNavbar('patient') + `
    <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
            <div class="chat-bubble assistant">
                <div class="bubble-label">AI Assistant</div>
                Hello! I'm your AI health assistant. Please describe your symptoms and
                I'll help gather information for a doctor to review. What brings you here today?
            </div>
        </div>
        <div class="chat-input-area" id="chat-input-area">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;flex-shrink:0">
                📎
                <input type="file" id="chat-file" accept="image/*,.pdf" style="display:none"
                       onchange="handleChatFileSelect(this)">
            </label>
            <input type="text" class="form-input" id="chat-input"
                   placeholder="Describe your symptoms..." autocomplete="off">
            <button class="btn btn-primary" id="send-btn" onclick="sendChatMessage(${reportId})">
                Send
            </button>
        </div>
        <div class="chat-actions" id="chat-actions">
            <button class="btn btn-teal" id="diagnose-btn" onclick="requestDiagnosis(${reportId})">
                🩺 Generate Diagnosis Report
            </button>
            <button class="btn btn-secondary btn-sm" onclick="navigate('/patient')">Cancel</button>
        </div>
    </div>`;

    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-btn').click();
        }
    });
    document.getElementById('chat-input').focus();
});

let chatFileToUpload = null;

window.handleChatFileSelect = function (input) {
    chatFileToUpload = input.files[0] || null;
    if (chatFileToUpload) showToast(`📎 ${chatFileToUpload.name} attached`, 'info');
};

window.sendChatMessage = async function (reportId) {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message && !chatFileToUpload) return;

    const messagesDiv = document.getElementById('chat-messages');
    const sendBtn = document.getElementById('send-btn');

    let attachmentHtml = '';
    if (chatFileToUpload) {
        try {
            const uploaded = await uploadFile(chatFileToUpload);
            attachmentHtml = renderAttachment(uploaded.url);
        } catch (err) {
            showToast('File upload failed: ' + err.message, 'error');
        }
        chatFileToUpload = null;
    }

    messagesDiv.innerHTML += `
        <div class="chat-bubble patient">
            <div class="bubble-label">You</div>
            ${message ? escapeHtml(message) : ''}
            ${attachmentHtml}
        </div>`;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    messagesDiv.innerHTML += `
        <div class="typing-indicator" id="typing">
            <span></span><span></span><span></span>
        </div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const data = await apiFetch(`/api/patient/chat/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({ message: message || '[Image attached]' }),
        });
        document.getElementById('typing')?.remove();
        messagesDiv.innerHTML += `
            <div class="chat-bubble assistant">
                <div class="bubble-label">AI Assistant</div>
                ${escapeHtml(data.reply)}
            </div>`;
    } catch (err) {
        document.getElementById('typing')?.remove();
        showToast(err.message, 'error');
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
};

window.requestDiagnosis = async function (reportId) {
    const btn = document.getElementById('diagnose-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating diagnosis...';

    try {
        const data = await apiFetch(`/api/patient/diagnose/${reportId}`, { method: 'POST' });
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML += `
            <div class="card diagnosis-card" style="margin:0.5rem;max-width:95%">
                <h3 style="margin-bottom:1rem;color:var(--accent-blue)">🩺 Preliminary Diagnosis</h3>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Primary Condition</div>
                    <div class="diagnosis-field-value" style="font-size:1.1rem;font-weight:600">${data.primary_condition}</div>
                </div>
                <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Confidence</div>
                        <div class="confidence-bar" style="width:120px">
                            <div class="confidence-bar-fill" style="width:${Math.round(data.confidence * 100)}%"></div>
                        </div>
                        <span style="font-size:0.85rem">${Math.round(data.confidence * 100)}%</span>
                    </div>
                    <div class="diagnosis-field">
                        <div class="diagnosis-field-label">Urgency</div>
                        <span class="badge badge-${data.urgency}">${data.urgency}</span>
                    </div>
                </div>
                <div class="diagnosis-field">
                    <div class="diagnosis-field-label">Description</div>
                    <div class="diagnosis-field-value">${data.description}</div>
                </div>
                <p style="color:var(--text-muted);font-size:0.8rem;margin-top:1rem">
                    ⚠️ A qualified doctor will review your case.
                </p>
            </div>`;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        document.getElementById('chat-input-area').style.display = 'none';
        document.getElementById('chat-actions').innerHTML = `
            <p style="color:var(--accent-green);font-weight:500">✅ Report submitted for doctor review</p>
            <button class="btn btn-primary" onclick="navigate('/patient')">Back to Dashboard</button>`;
        showToast('Diagnosis report generated!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🩺 Generate Diagnosis Report';
    }
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
