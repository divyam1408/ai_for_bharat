/* ══════════════════════════════════════════════════════════════════════════
   Doctor Pages — Dashboard, Review with Feedback Loop & Research Assistant
   ══════════════════════════════════════════════════════════════════════════ */

// ── Doctor Dashboard ──────────────────────────────────────────────────────

registerRoute('/doctor', async (app) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container">
        <div class="page-header">
            <div>
                <h1 class="page-title">Doctor Dashboard</h1>
                <p class="page-subtitle">Review AI-generated diagnoses and provide medical validation</p>
            </div>
        </div>
        <div id="pending-area">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading pending reports...</p>
            </div>
        </div>
    </div>`;

    try {
        const data = await apiFetch('/api/doctor/pending');
        const area = document.getElementById('pending-area');

        if (!data.reports || data.reports.length === 0) {
            area.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p class="empty-state-text">No pending reports</p>
                    <p style="color:var(--text-muted)">All caught up! Check back later for new cases.</p>
                </div>`;
            return;
        }

        area.innerHTML = `
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-value">${data.reports.length}</div>
                    <div class="stat-label">Pending Reviews</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-value">${data.reports.filter(r => r.urgency === 'critical' || r.urgency === 'high').length}</div>
                    <div class="stat-label">High Priority</div>
                </div>
            </div>
            <h2 style="font-size:1.2rem;margin-bottom:1rem">Pending Cases</h2>
            <div class="card-grid">
                ${data.reports.map(r => renderPendingCard(r)).join('')}
            </div>`;
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function renderPendingCard(r) {
    const date = new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return `
    <div class="card" style="cursor:pointer" onclick="navigate('/doctor/review/${r.id}')">
        <div class="card-header">
            <div>
                <div class="card-title">${r.patient_name || 'Patient'}</div>
                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.25rem">Report #${r.id}</div>
            </div>
            <span class="badge badge-${r.urgency}">${r.urgency}</span>
        </div>
        <div class="diagnosis-field">
            <div class="diagnosis-field-label">AI Diagnosis</div>
            <div class="diagnosis-field-value">${r.primary_condition}</div>
        </div>
        <div style="display:flex;gap:1rem;align-items:center;margin-top:0.5rem">
            <div class="diagnosis-field" style="margin-bottom:0">
                <div class="diagnosis-field-label">Confidence</div>
                <span style="font-size:0.85rem">${Math.round(r.confidence * 100)}%</span>
            </div>
            <div style="color:var(--text-muted);font-size:0.8rem;margin-left:auto">📅 ${date}</div>
        </div>
        <button class="btn btn-primary btn-sm" style="width:100%;margin-top:1rem">
            Review Case →
        </button>
    </div>`;
}

// ── Doctor Review Page ────────────────────────────────────────────────────

registerRoute('/doctor/review/:id', async (app, params) => {
    const user = getUser();
    if (!user || user.role !== 'doctor') { navigate('/login'); return; }

    app.innerHTML = renderNavbar('doctor') + `
    <div class="page-container" style="max-width:1400px">
        <button class="btn btn-secondary btn-sm" onclick="navigate('/doctor')" style="margin-bottom:1.5rem">
            ← Back to Dashboard
        </button>
        <div id="review-content">
            <div class="empty-state">
                <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto"></div>
                <p style="margin-top:1rem;color:var(--text-muted)">Loading case details...</p>
            </div>
        </div>
    </div>`;

    try {
        const r = await apiFetch(`/api/doctor/report/${params.id}`);
        const container = document.getElementById('review-content');

        container.innerHTML = `
            <h1 class="page-title" style="margin-bottom:0.25rem">Case Review — Report #${r.id}</h1>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem">
                Patient: <strong>${r.patient_name}</strong>
                ${r.age ? ` • Age: ${r.age}` : ''}
                ${r.gender ? ` • ${r.gender}` : ''}
            </p>

            <div class="review-layout">
                <!-- Left column: Chat history + AI diagnosis -->
                <div class="review-panel">

                    ${r.chat_history && r.chat_history.length ? `
                    <div class="card">
                        <h3 class="card-title" style="margin-bottom:1rem">💬 Patient-AI Conversation</h3>
                        <div class="chat-history-panel">
                            ${r.chat_history.map(msg => `
                                <div class="chat-bubble ${msg.role === 'patient' ? 'patient' : 'assistant'}">
                                    <div class="bubble-label">${msg.role === 'patient' ? 'Patient' : 'AI Assistant'}</div>
                                    ${msg.content}
                                    ${msg.attachment_url ? renderAttachmentDoctor(msg.attachment_url) : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${r.feedback_thread && r.feedback_thread.length ? `
                    <div class="card" style="border-color:rgba(245,158,11,0.3)">
                        <h3 class="card-title" style="color:var(--accent-amber);margin-bottom:1rem">💬 Doctor-Patient Feedback Thread</h3>
                        <div class="chat-history-panel">
                            ${r.feedback_thread.map(msg => `
                                <div class="chat-bubble ${msg.sender_role === 'doctor' ? 'assistant' : 'patient'}">
                                    <div class="bubble-label">${msg.sender_role === 'doctor' ? '🩺 You' : 'Patient'}</div>
                                    ${msg.message}
                                    ${msg.attachment_url ? renderAttachmentDoctor(msg.attachment_url) : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    <div class="card diagnosis-card">
                        <h3 class="card-title" style="margin-bottom:1rem">🤖 AI Diagnosis Summary</h3>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Primary Condition</div>
                            <div class="diagnosis-field-value" style="font-size:1.1rem;font-weight:600">${r.primary_condition}</div>
                        </div>
                        <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
                            <div class="diagnosis-field">
                                <div class="diagnosis-field-label">Confidence</div>
                                <div class="confidence-bar" style="width:140px">
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
                        ${r.medical_history ? `
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Medical History</div>
                            <div class="diagnosis-field-value">${r.medical_history}</div>
                        </div>` : ''}
                        ${r.current_medications ? `
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Current Medications</div>
                            <div class="diagnosis-field-value">${r.current_medications}</div>
                        </div>` : ''}
                    </div>
                </div>

                <!-- Right column: Review form + Research assistant -->
                <div class="review-panel">
                    ${r.status !== 'completed' ? `
                    <div class="card">
                        <h3 class="card-title" style="margin-bottom:1rem">📝 Your Review</h3>
                        <form id="review-form">
                            <div class="form-group">
                                <label class="form-label">Final Diagnosis</label>
                                <input type="text" class="form-input" id="review-diagnosis"
                                       value="${r.primary_condition}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Comments / Feedback</label>
                                <textarea class="form-textarea" id="review-comments"
                                          placeholder="Add your clinical observations, or request more info from the patient..."
                                          rows="4"></textarea>
                            </div>
                            <div style="display:flex;gap:0.75rem;flex-direction:column">
                                <button type="submit" class="btn btn-teal btn-lg" id="finalize-btn">
                                    ✅ Finalize Diagnosis
                                </button>
                                <button type="button" class="btn btn-secondary btn-lg" id="feedback-btn"
                                        onclick="requestPatientFeedback(${r.id})">
                                    🔄 Request Patient Feedback
                                </button>
                            </div>
                        </form>
                    </div>` : `
                    <div class="card" style="border-color:rgba(34,197,94,0.3)">
                        <h3 class="card-title" style="color:var(--accent-green)">✅ Already Finalized</h3>
                        <div class="diagnosis-field" style="margin-top:1rem">
                            <div class="diagnosis-field-label">Final Diagnosis</div>
                            <div class="diagnosis-field-value">${r.final_diagnosis}</div>
                        </div>
                        <div class="diagnosis-field">
                            <div class="diagnosis-field-label">Doctor's Comments</div>
                            <div class="diagnosis-field-value">${r.doctor_comments || 'No comments'}</div>
                        </div>
                    </div>`}

                    <!-- AI Research Assistant -->
                    <div class="card research-panel">
                        <h3 class="card-title" style="margin-bottom:1rem">🔬 AI Research Assistant</h3>
                        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem">
                            Ask questions about conditions, treatments, or upload images for analysis.
                        </p>
                        <div class="form-group" style="margin-bottom:0.75rem">
                            <input type="text" class="form-input" id="research-input"
                                   placeholder="e.g. What are the treatment guidelines for viral fever?">
                        </div>
                        <div style="display:flex;gap:0.75rem;align-items:center">
                            <label class="btn btn-secondary btn-sm" style="cursor:pointer;flex-shrink:0">
                                📎 Upload Image
                                <input type="file" id="research-file" accept="image/*,.pdf" style="display:none"
                                       onchange="handleResearchFileSelect(this)">
                            </label>
                            <span id="research-file-name" style="font-size:0.8rem;color:var(--text-muted)"></span>
                            <button class="btn btn-teal btn-sm" id="research-btn" style="margin-left:auto"
                                    onclick="queryResearch('${r.primary_condition}')">
                                🔍 Search
                            </button>
                        </div>
                        <div class="research-response" id="research-response" style="display:none;margin-top:1rem">
                        </div>
                    </div>
                </div>
            </div>`;

        // Review form finalize handler
        const form = document.getElementById('review-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                finalizeDiagnosis(r.id);
            });
        }

        // Research enter key
        const researchInput = document.getElementById('research-input');
        if (researchInput) {
            researchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('research-btn').click();
            });
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ── Finalize diagnosis ────────────────────────────────────────────────────

window.finalizeDiagnosis = async function (reportId) {
    const diagnosis = document.getElementById('review-diagnosis').value.trim();
    const comments = document.getElementById('review-comments').value.trim();
    if (!diagnosis) { showToast('Please enter a final diagnosis', 'error'); return; }

    const btn = document.getElementById('finalize-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Finalizing...';

    try {
        await apiFetch(`/api/doctor/review/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({
                final_diagnosis: diagnosis,
                doctor_comments: comments,
                modified: diagnosis !== document.getElementById('review-diagnosis').defaultValue,
                is_final: true,
            }),
        });
        showToast('Diagnosis finalized!', 'success');
        setTimeout(() => navigate('/doctor'), 1000);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✅ Finalize Diagnosis';
    }
};

// ── Request patient feedback ──────────────────────────────────────────────

window.requestPatientFeedback = async function (reportId) {
    const comments = document.getElementById('review-comments').value.trim();
    if (!comments) {
        showToast('Please enter feedback/questions for the patient in the comments field', 'error');
        return;
    }

    const btn = document.getElementById('feedback-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        await apiFetch(`/api/doctor/review/${reportId}`, {
            method: 'POST',
            body: JSON.stringify({
                final_diagnosis: document.getElementById('review-diagnosis').value.trim(),
                doctor_comments: comments,
                modified: false,
                is_final: false,
            }),
        });
        showToast('Feedback request sent to patient!', 'success');
        setTimeout(() => navigate('/doctor'), 1000);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🔄 Request Patient Feedback';
    }
};

// ── Research assistant ────────────────────────────────────────────────────

let researchFileToUpload = null;

window.handleResearchFileSelect = function (input) {
    researchFileToUpload = input.files[0] || null;
    document.getElementById('research-file-name').textContent =
        researchFileToUpload ? researchFileToUpload.name : '';
};

window.queryResearch = async function (context) {
    const input = document.getElementById('research-input');
    const query = input.value.trim();
    if (!query && !researchFileToUpload) { showToast('Enter a research question', 'error'); return; }

    const btn = document.getElementById('research-btn');
    const responseDiv = document.getElementById('research-response');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    responseDiv.style.display = 'block';
    responseDiv.textContent = 'Searching medical databases...';

    let uploadedUrl = '';
    if (researchFileToUpload) {
        try {
            const uploaded = await uploadFile(researchFileToUpload);
            uploadedUrl = uploaded.url;
            researchFileToUpload = null;
            document.getElementById('research-file-name').textContent = '';
        } catch (err) {
            showToast('File upload failed: ' + err.message, 'error');
        }
    }

    try {
        const fullQuery = uploadedUrl
            ? `${query || 'Analyze this image'} [Attachment: ${uploadedUrl}]`
            : query;

        const data = await apiFetch('/api/doctor/research', {
            method: 'POST',
            body: JSON.stringify({ query: fullQuery, context }),
        });

        responseDiv.innerHTML = '';
        if (uploadedUrl) {
            const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(uploadedUrl);
            if (isImage) {
                responseDiv.innerHTML += `<img src="${uploadedUrl}" alt="uploaded" style="max-width:200px;border-radius:8px;margin-bottom:0.75rem;display:block">`;
            }
        }
        responseDiv.innerHTML += data.response;
    } catch (err) {
        responseDiv.textContent = 'Error: ' + err.message;
        showToast(err.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = '🔍 Search';
};

function renderAttachmentDoctor(url) {
    if (!url) return '';
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
    if (isImage) {
        return `<div class="attachment-preview"><img src="${url}" alt="attachment" class="chat-image" onclick="window.open('${url}','_blank')"></div>`;
    }
    const filename = url.split('/').pop();
    return `<div class="attachment-preview"><a href="${url}" target="_blank" class="attachment-link">📎 ${filename}</a></div>`;
}
