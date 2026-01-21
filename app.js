// ===================================
// INSURANCE TRACKER - APPLICATION LOGIC
// ===================================

// Supabase Configuration
const SUPABASE_URL = 'https://peqjhtjjmznnttealylj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vLdmL_tasjgagQeqGL-QvA_JrrF9oQT';

let supabase;

try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error('Supabase library not loaded. Check script tags.');
    }
} catch (error) {
    console.error('Error initializing Supabase:', error);
}

// Application State
let clients = [];
let groupedClients = {}; // { "Name": [policy1, policy2] }
let filteredGroupedClients = []; // keys (names)
let editingPolicyId = null;
let deletingPolicyId = null;

// ===================================
// DOM ELEMENTS
// ===================================
let elements = {};

function cacheDOM() {
    elements = {
        // Stats
        totalClients: document.getElementById('totalClients'),
        criticalRenewals: document.getElementById('criticalRenewals'),
        warningRenewals: document.getElementById('warningRenewals'),
        upcomingRenewals: document.getElementById('upcomingRenewals'),

        // Alerts
        alertsSection: document.getElementById('alertsSection'),
        alertsContainer: document.getElementById('alertsContainer'),

        // Filters
        searchName: document.getElementById('searchName'),
        filterType: document.getElementById('filterType'),
        filterProvider: document.getElementById('filterProvider'),
        filterUrgency: document.getElementById('filterUrgency'),
        clearFiltersBtn: document.getElementById('clearFiltersBtn'),

        // Table
        clientsTableBody: document.getElementById('clientsTableBody'),
        clientCount: document.getElementById('clientCount'),
        emptyState: document.getElementById('emptyState'),
        clientsTable: document.getElementById('clientsTable'),

        // Add/Edit Modal
        clientModal: document.getElementById('clientModal'),
        modalTitle: document.getElementById('modalTitle'),
        clientForm: document.getElementById('clientForm'),
        clientId: document.getElementById('policyId'),
        clientName: document.getElementById('clientName'),
        existingPoliciesSection: document.getElementById('existingPoliciesSection'),
        policyListBody: document.getElementById('policyListBody'),
        insuranceType: document.getElementById('insuranceType'),
        providerName: document.getElementById('providerName'),
        paymentDate: document.getElementById('paymentDate'),
        renewalDate: document.getElementById('renewalDate'),
        clientFile: document.getElementById('clientFile'),
        filePreview: document.getElementById('filePreview'),
        addClientBtn: document.getElementById('addClientBtn'),
        policyModal: document.getElementById('policyModal'),
        policyModalTitle: document.getElementById('policyModalTitle'),
        openAddPolicyModalBtn: document.getElementById('openAddPolicyModalBtn'),
        closeModal: document.getElementById('closeModal'),
        closePolicyModal: document.getElementById('closePolicyModal'),
        cancelPolicyBtn: document.getElementById('cancelPolicyBtn'),
        closeClientModalBtn: document.getElementById('closeClientModalBtn'),
        submitBtn: document.getElementById('submitBtn'),

        // Delete Modal
        deleteModal: document.getElementById('deleteModal'),
        deleteClientName: document.getElementById('deleteClientName'),
        closeDeleteModal: document.getElementById('closeDeleteModal'),
        cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

        // User Menu
        userProfileBtn: document.getElementById('userProfileBtn'),
        userDropdown: document.getElementById('userDropdown'),
        logoutBtn: document.getElementById('logoutBtn'),
        changePasswordBtn: document.getElementById('changePasswordBtn'),

        // Toast
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toastMessage')
    };
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

function getDaysUntilRenewal(renewalDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(renewalDate);
    renewal.setHours(0, 0, 0, 0);
    const diffTime = renewal - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function getUrgencyLevel(days) {
    if (days < 0) return 'expired';
    if (days < 14) return 'critical';
    if (days <= 30) return 'warning';
    if (days <= 90) return 'upcoming';
    return 'normal';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    elements.toast.className = 'toast ' + type;
    elements.toast.classList.add('show');

    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

function getFileNameFromUrl(url) {
    if (!url) return 'Unknown Document';
    try {
        // Decode URL to handle spaces and special chars
        const decodedUrl = decodeURIComponent(url);
        // Get the last part after /
        let fileName = decodedUrl.split('/').pop();

        // Remove the timestamp prefix (e.g., "1737400000_filename.pdf")
        // We look for the first underscore which separates timestamp from name
        const firstUnderscoreIndex = fileName.indexOf('_');
        if (firstUnderscoreIndex !== -1 && !isNaN(fileName.substring(0, firstUnderscoreIndex))) {
            fileName = fileName.substring(firstUnderscoreIndex + 1);
        }

        return fileName;
    } catch (e) {
        return 'Document';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// DATA PERSISTENCE (SUPABASE)
// ===================================

async function fetchClients() {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('renewal_date', { ascending: true });

        if (error) throw error;

        clients = data.map(client => ({
            id: client.id,
            clientName: client.name,
            insuranceType: client.insurance_type,
            providerName: client.provider,
            paymentDate: client.payment_date,
            renewalDate: client.renewal_date,
            attachmentUrl: client.attachment_url,
            attachment_urls: client.attachment_urls,
            createdAt: client.created_at
        }));

        groupedClients = clients.reduce((acc, client) => {
            if (!acc[client.clientName]) acc[client.clientName] = [];
            acc[client.clientName].push(client);
            return acc;
        }, {});

        filteredGroupedClients = Object.keys(groupedClients).sort();

        updateProviderFilter();
        updateStats();
        renderAlerts();
        renderClientTable();

    } catch (error) {
        console.error('Error fetching clients:', error);
        showToast('Error loading data', 'error');
    }
}

// ===================================
// RENDERING FUNCTIONS
// ===================================

function updateStats() {
    const stats = {
        total: clients.length,
        critical: 0,
        warning: 0,
        upcoming: 0
    };

    clients.forEach(client => {
        const days = getDaysUntilRenewal(client.renewalDate);
        const urgency = getUrgencyLevel(days);

        if (urgency === 'critical') stats.critical++;
        else if (urgency === 'warning') stats.warning++;
        else if (urgency === 'upcoming') stats.upcoming++;
    });

    if (elements.totalClients) elements.totalClients.textContent = stats.total;
    if (elements.criticalRenewals) elements.criticalRenewals.textContent = stats.critical;
    if (elements.warningRenewals) elements.warningRenewals.textContent = stats.warning;
    if (elements.upcomingRenewals) elements.upcomingRenewals.textContent = stats.upcoming;
}

function renderAlerts() {
    const alertClients = clients
        .map(client => ({
            ...client,
            daysUntilRenewal: getDaysUntilRenewal(client.renewalDate)
        }))
        .filter(client => client.daysUntilRenewal <= 90 && client.daysUntilRenewal >= 0)
        .sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);

    if (alertClients.length === 0) {
        elements.alertsContainer.innerHTML = '<div class="no-alerts"><p>No upcoming renewals</p></div>';
        return;
    }

    elements.alertsContainer.innerHTML = alertClients.map(client => {
        const urgency = getUrgencyLevel(client.daysUntilRenewal);
        return `
            <div class="alert-card ${urgency}">
                <div class="alert-content">
                    <h4>${escapeHtml(client.clientName)}</h4>
                    <p>${client.insuranceType}</p>
                    <span class="alert-days">${client.daysUntilRenewal} days left</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderClientTable() {
    if (filteredGroupedClients.length === 0) {
        elements.clientsTable.style.display = 'none';
        elements.emptyState.classList.add('show');
        elements.clientCount.textContent = '(0 clients)';
        return;
    }

    elements.clientsTable.style.display = 'table';
    elements.emptyState.classList.remove('show');
    elements.clientCount.textContent = `(${filteredGroupedClients.length} clients)`;

    elements.clientsTableBody.innerHTML = filteredGroupedClients.map(clientName => {
        const policies = groupedClients[clientName];
        const count = policies.length;
        return `
            <tr>
                <td><strong>${escapeHtml(clientName)}</strong></td>
                <td>${count} Policy${count !== 1 ? 'ies' : ''}</td>
                <td>
                    <button class="btn btn-ghost" onclick="openClientDetails('${escapeHtml(clientName).replace(/'/g, "\\'")}')">
                        View / Add
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Render the list of policies inside the modal
function renderPolicyList(clientName) {
    const policies = groupedClients[clientName] || [];
    elements.policyListBody.innerHTML = policies.map(p => {
        const days = getDaysUntilRenewal(p.renewalDate);
        const urgency = getUrgencyLevel(days);

        const urls = (p.attachment_urls && p.attachment_urls.length > 0)
            ? p.attachment_urls
            : (p.attachmentUrl ? [p.attachmentUrl] : []);

        const uploadDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return `
            <tr class="policy-header-row">
                <td>
                    <div style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">${escapeHtml(p.insuranceType)}</div>
                </td>
                <td>${escapeHtml(p.providerName)}</td>
                <td>${formatDate(p.renewalDate)}</td>
                <td><span class="days-badge ${urgency}">${escapeHtml(urgency)}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="editPolicy('${p.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="action-btn delete" onclick="deletePolicy('${p.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
            ${urls.length > 0 ? `
            <tr class="policy-docs-row">
                <td colspan="5" style="padding-top: 0; padding-bottom: 24px; border-bottom: 1px solid #e2e8f0;">
                    <div class="document-list">
                        ${urls.map((url, i) => `
                            <div class="document-card">
                                <div class="doc-header">
                                    <div class="doc-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                        </svg>
                                    </div>
                                    <div class="doc-info">
                                        <div class="doc-name" title="${getFileNameFromUrl(url)}">${getFileNameFromUrl(url)}</div>
                                        <div class="doc-meta">PDF • ${uploadDate}</div>
                                    </div>
                                </div>
                                <div class="doc-actions">
                                    <a href="${url}" target="_blank" class="doc-btn open">Open</a>
                                    <a href="${url}" download class="doc-btn">Download</a>
                                    <button class="doc-btn delete" onclick="deleteDocumentFromList('${p.id}', ${i})" title="Delete">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </td>
            </tr>
            ` : '<tr><td colspan="5" style="padding: 0; border-bottom: 1px solid #e2e8f0;"></td></tr>'}
        `;
    }).join('');
}

// ===================================
// CRUD OPERATIONS
// ===================================

function openClientDetails(clientName) {
    editingPolicyId = null;
    elements.clientForm.reset();
    elements.clientFile.value = '';

    if (clientName) {
        elements.modalTitle.textContent = `${clientName} Details`;
        elements.clientModal.dataset.currentClient = clientName;
        elements.existingPoliciesSection.style.display = 'block';
        renderPolicyList(clientName);
        elements.clientModal.classList.add('show');
    } else {
        openPolicyModal(null);
    }
}

function openPolicyModal(clientName) {
    editingPolicyId = null;
    resetForm();

    if (clientName) {
        elements.policyModalTitle.textContent = 'Add New Policy';
        elements.clientName.value = clientName;
        elements.submitBtn.textContent = 'Add Policy';
    } else {
        elements.policyModalTitle.textContent = 'Add New Client';
        elements.clientName.value = '';
        elements.submitBtn.textContent = 'Add Client';
    }
    elements.policyModal.classList.add('show');
}

function resetForm() {
    elements.clientForm.reset();
    elements.clientFile.value = '';
    elements.filePreview.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    elements.paymentDate.value = today;
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    elements.renewalDate.value = nextYear.toISOString().split('T')[0];
}

function closePolicyModal() {
    elements.policyModal.classList.remove('show');
}

function closeClientModal() {
    elements.clientModal.classList.remove('show');
}

function editPolicy(id) {
    const policy = clients.find(c => c.id === id);
    if (!policy) return;

    editingPolicyId = id;
    elements.policyModalTitle.textContent = 'Edit Policy';
    elements.submitBtn.textContent = 'Update Policy';

    elements.clientName.value = policy.clientName;
    elements.insuranceType.value = policy.insuranceType;
    elements.providerName.value = policy.providerName;
    elements.paymentDate.value = policy.paymentDate;
    elements.renewalDate.value = policy.renewalDate;

    elements.policyModal.classList.add('show');

    // Show existing files
    elements.filePreview.innerHTML = '';
    const urls = (policy.attachment_urls && policy.attachment_urls.length > 0)
        ? policy.attachment_urls
        : (policy.attachmentUrl ? [policy.attachmentUrl] : []);

    if (urls.length > 0) {
        const list = document.createElement('div');
        list.style.marginTop = '10px';
        list.innerHTML = '<p style="font-size: 0.9em; font-weight: 500;">Current Documents:</p>';
        urls.forEach((url, i) => {
            const d = document.createElement('div');
            d.innerHTML = `<a href="${url}" target="_blank">${getFileNameFromUrl(url)}</a>`;
            list.appendChild(d);
        });
        elements.filePreview.appendChild(list);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const clientData = {
        name: elements.clientName.value.trim(),
        insurance_type: elements.insuranceType.value,
        provider: elements.providerName.value.trim(),
        payment_date: elements.paymentDate.value,
        renewal_date: elements.renewalDate.value
    };

    const files = elements.clientFile.files;
    let uploadedUrls = [];

    if (editingPolicyId) {
        const existingPolicy = clients.find(c => c.id === editingPolicyId);
        if (existingPolicy) {
            uploadedUrls = existingPolicy.attachment_urls || (existingPolicy.attachmentUrl ? [existingPolicy.attachmentUrl] : []);
        }
    }

    if (files.length > 0) {
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Sanitize filename but keep it readable
                const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_ ()]/g, '_');
                const fileName = `${Date.now()}_${sanitizedName}`;

                const { error } = await supabase.storage.from('client-attachments').upload('public/' + fileName, file);
                if (error) throw error;
                const { data } = supabase.storage.from('client-attachments').getPublicUrl('public/' + fileName);
                uploadedUrls.push(data.publicUrl);
            }
        } catch (err) {
            console.error(err);
            showToast('Upload failed', 'error');
            return;
        }
    }

    clientData.attachment_urls = uploadedUrls;
    clientData.attachment_url = uploadedUrls[0] || null;

    elements.submitBtn.textContent = 'Saving...';
    try {
        if (editingPolicyId) {
            await supabase.from('clients').update(clientData).eq('id', editingPolicyId);
            showToast('Updated successfully');
        } else {
            await supabase.from('clients').insert([clientData]);
            showToast('Added successfully');
        }
        await fetchClients();
        if (elements.clientModal.classList.contains('show')) {
            renderPolicyList(clientData.name);
        }
        closePolicyModal();
    } catch (err) {
        console.error(err);
        showToast('Error saving', 'error');
    } finally {
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = editingPolicyId ? 'Update Policy' : 'Add Policy';
    }
}

async function deletePolicy(id) {
    if (!confirm('Delete this policy?')) return;
    try {
        await supabase.from('clients').delete().eq('id', id);
        showToast('Deleted successfully');
        await fetchClients();
        if (elements.clientModal.classList.contains('show')) {
            const current = elements.clientModal.dataset.currentClient;
            if (current) renderPolicyList(current);
        }
    } catch (err) {
        console.error(err);
        showToast('Delete failed', 'error');
    }
}

async function deleteDocumentFromList(policyId, fileIndex) {
    if (!confirm('Delete this document?')) return;
    const policy = clients.find(c => c.id === policyId);
    if (!policy || !policy.attachment_urls) return;

    const newUrls = [...policy.attachment_urls];
    newUrls.splice(fileIndex, 1);

    try {
        await supabase.from('clients').update({
            attachment_urls: newUrls,
            attachment_url: newUrls[0] || null
        }).eq('id', policyId);
        showToast('Document deleted');
        await fetchClients();
        if (elements.clientModal.classList.contains('show')) {
            renderPolicyList(policy.clientName);
        }
    } catch (err) {
        console.error(err);
        showToast('Error deleting document', 'error');
    }
}

function updateProviderFilter() {
    const providers = [...new Set(clients.map(c => c.providerName))].sort();
    elements.filterProvider.innerHTML = '<option value="">All Providers</option>' +
        providers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

// Simple debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function applyFilters() {
    const searchTerm = elements.searchName.value.toLowerCase().trim();
    const typeFilter = elements.filterType.value;
    const providerFilter = elements.filterProvider.value;
    const urgencyFilter = elements.filterUrgency.value;

    filteredGroupedClients = Object.keys(groupedClients).filter(clientName => {
        const policies = groupedClients[clientName];
        if (searchTerm && !clientName.toLowerCase().includes(searchTerm)) return false;

        return policies.some(client => {
            if (typeFilter && client.insuranceType !== typeFilter) return false;
            if (providerFilter && client.providerName !== providerFilter) return false;
            if (urgencyFilter) {
                const days = getDaysUntilRenewal(client.renewalDate);
                if (days < 0 || days > parseInt(urgencyFilter)) return false;
            }
            return true;
        });
    });
    filteredGroupedClients.sort();
    renderClientTable();
}

function clearFilters() {
    elements.searchName.value = '';
    elements.filterType.value = '';
    elements.filterProvider.value = '';
    elements.filterUrgency.value = '';
    applyFilters();
    showToast('Filters cleared');
}

function initEventListeners() {
    elements.addClientBtn.addEventListener('click', () => openClientDetails(null));
    if (elements.closeModal) elements.closeModal.addEventListener('click', closeClientModal);
    if (elements.closeClientModalBtn) elements.closeClientModalBtn.addEventListener('click', closeClientModal);
    elements.closePolicyModal.addEventListener('click', closePolicyModal);
    elements.cancelPolicyBtn.addEventListener('click', closePolicyModal);
    if (elements.openAddPolicyModalBtn) elements.openAddPolicyModalBtn.addEventListener('click', () => openPolicyModal(elements.clientModal.dataset.currentClient));

    // Close on overlay click
    window.addEventListener('click', (e) => {
        if (e.target === elements.clientModal) closeClientModal();
        if (e.target === elements.policyModal) closePolicyModal();
        if (e.target === elements.deleteModal && elements.deleteModal) elements.deleteModal.classList.remove('show');
    });

    // Forms
    elements.clientForm.addEventListener('submit', handleFormSubmit);

    // Filters
    elements.searchName.addEventListener('input', debounce(applyFilters, 300));
    elements.filterType.addEventListener('change', applyFilters);
    elements.filterProvider.addEventListener('change', applyFilters);
    elements.filterUrgency.addEventListener('change', applyFilters);
    elements.clearFiltersBtn.addEventListener('click', clearFilters);

    // User Menu
    if (elements.userProfileBtn) {
        elements.userProfileBtn.addEventListener('click', () => {
            elements.userDropdown.classList.toggle('show');
        });
    }

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
        if (elements.userProfileBtn && !elements.userProfileBtn.contains(e.target) && !elements.userDropdown.contains(e.target)) {
            elements.userDropdown.classList.remove('show');
        }
    });
    if (elements.changePasswordBtn) {
        elements.changePasswordBtn.addEventListener('click', () => {
            const passwordModal = document.getElementById('passwordModal');
            if (passwordModal) {
                passwordModal.classList.add('show');
                elements.userDropdown.classList.remove('show');
            }
        });
    }

    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async () => {
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Logout error:', error);
                showToast('Error logging out', 'error');
            }
        });
    }

    const closePasswordModal = document.getElementById('closePasswordModal');
    if (closePasswordModal) {
        closePasswordModal.addEventListener('click', () => {
            document.getElementById('passwordModal').classList.remove('show');
        });
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    initEventListeners();
    fetchClients();
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const btn = e.target.querySelector('button');

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    btn.textContent = 'Updating...';
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        showToast('Password updated successfully');
        document.getElementById('passwordModal').classList.remove('show');
        e.target.reset();
    } catch (error) {
        console.error(error);
        showToast('Error updating password: ' + error.message, 'error');
    } finally {
        btn.textContent = 'Update Password';
    }
});
