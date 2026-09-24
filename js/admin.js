document.addEventListener('DOMContentLoaded', () => {
    if (!window.supabaseClient) {
        alert("Supabase client not initialized. Check js/supabase.js");
        return;
    }
    
    const supabase = window.supabaseClient;
    
    // --- Views ---
    const authView = document.getElementById('auth-view');
    const dashboardView = document.getElementById('dashboard-view');
    
    // --- Auth Elements ---
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    // --- Tab Navigation ---
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');
    let currentTab = 'projects';

    // --- State ---
    let projectsData = [];
    let clientsData = [];

    // --- Initialization ---
    async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            showDashboard();
        } else {
            showLogin();
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') showDashboard();
            if (event === 'SIGNED_OUT') showLogin();
        });
    }

    // --- View Switching ---
    function showLogin() {
        dashboardView.classList.remove('active');
        authView.classList.add('active');
    }

    function showDashboard() {
        authView.classList.remove('active');
        dashboardView.classList.add('active');
        loadData(currentTab);
    }

    // --- Auth Flow ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = loginForm.querySelector('button');
        
        btn.disabled = true;
        btn.textContent = 'Logging in...';
        loginError.textContent = '';

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            loginError.textContent = error.message;
            btn.disabled = false;
            btn.textContent = 'Login';
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    // --- Tab Switching ---
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            document.getElementById(`tab-${currentTab}`).classList.add('active');
            
            loadData(currentTab);
        });
    });

    // --- Data Loading ---
    async function loadData(tab) {
        if (tab === 'projects') await loadProjects();
        if (tab === 'clients') await loadClients();
    }

    // ==========================================
    // PROJECTS MANAGEMENT
    // ==========================================
    const projectsTbody = document.getElementById('projects-tbody');
    const projectModal = document.getElementById('project-modal');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectForm = document.getElementById('project-form');
    const projectSaveBtn = document.getElementById('project-save-btn');
    const projectFormStatus = document.getElementById('project-form-status');

    async function loadProjects() {
        projectsTbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        
        if (error) {
            projectsTbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">Error loading projects: ${error.message}</td></tr>`;
            return;
        }
        
        projectsData = data || [];
        renderProjects();
    }

    function renderProjects() {
        projectsTbody.innerHTML = '';
        if (projectsData.length === 0) {
            projectsTbody.innerHTML = '<tr><td colspan="5">No projects found.</td></tr>';
            return;
        }

        projectsData.forEach(p => {
            const tr = document.createElement('tr');
            
            let mediaHtml = '';
            if (p.type === 'video') {
                mediaHtml = `<video src="${p.media_url}" class="thumb" muted>Unsupported format</video>`;
            } else {
                mediaHtml = `<img src="${p.media_url}" class="thumb">`;
            }

            const statusClass = p.published ? 'published' : 'draft';
            const statusText = p.published ? 'Published' : 'Draft';

            tr.innerHTML = `
                <td>${mediaHtml}</td>
                <td><strong>${p.title}</strong></td>
                <td>${p.category}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="action-btn edit-project" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn delete delete-project" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            projectsTbody.appendChild(tr);
        });

        document.querySelectorAll('.edit-project').forEach(btn => {
            btn.addEventListener('click', (e) => openProjectModal(e.currentTarget.getAttribute('data-id')));
        });
        document.querySelectorAll('.delete-project').forEach(btn => {
            btn.addEventListener('click', (e) => deleteProject(e.currentTarget.getAttribute('data-id')));
        });
    }

    addProjectBtn.addEventListener('click', () => openProjectModal());

    function openProjectModal(id = null) {
        projectForm.reset();
        projectFormStatus.textContent = '';
        projectFormStatus.className = 'status-msg';
        
        if (id) {
            const project = projectsData.find(p => p.id == id);
            if (project) {
                document.getElementById('project-modal-title').textContent = 'Edit Project';
                document.getElementById('project-id').value = project.id;
                document.getElementById('project-title').value = project.title || '';
                document.getElementById('project-category').value = project.category || 'Wedding';
                document.getElementById('project-desc').value = project.description || '';
                document.getElementById('project-link').value = project.project_link || '';
                document.getElementById('project-published').checked = project.published;
                // file input remains empty
            }
        } else {
            document.getElementById('project-modal-title').textContent = 'Add Project';
            document.getElementById('project-id').value = '';
        }
        
        projectModal.classList.add('active');
    }

    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        projectSaveBtn.disabled = true;
        projectSaveBtn.textContent = 'Saving...';
        projectFormStatus.textContent = '';

        const id = document.getElementById('project-id').value;
        const title = document.getElementById('project-title').value;
        const category = document.getElementById('project-category').value;
        const description = document.getElementById('project-desc').value;
        const project_link = document.getElementById('project-link').value;
        const published = document.getElementById('project-published').checked;
        const fileInput = document.getElementById('project-file');
        
        try {
            let media_url = '';
            let type = 'image';

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                // Detect video by MIME type (mp4, mov, webm, m4v, mkv, etc.)
                const videoMimeTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/x-matroska', 'video/avi', 'video/x-msvideo'];
                const videoExtensions = ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi'];
                const fileExt = file.name.split('.').pop().toLowerCase();
                type = (file.type.startsWith('video/') || videoMimeTypes.includes(file.type) || videoExtensions.includes(fileExt)) ? 'video' : 'image';
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `projects/${fileName}`;

                let contentType = file.type;
                if (!contentType || contentType === '') {
                    if (type === 'video') {
                        if (fileExt === 'mov') contentType = 'video/quicktime';
                        else if (fileExt === 'webm') contentType = 'video/webm';
                        else if (fileExt === 'mkv') contentType = 'video/x-matroska';
                        else if (fileExt === 'avi') contentType = 'video/x-msvideo';
                        else if (fileExt === 'm4v') contentType = 'video/x-m4v';
                        else contentType = 'video/mp4';
                    } else {
                        contentType = 'image/jpeg';
                    }
                }

                console.log('Uploading:', filePath, 'contentType:', contentType);
                const { error: uploadError } = await supabase.storage.from('portfolio-media').upload(filePath, file, {
                    contentType: contentType
                });
                
                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    throw new Error(uploadError.message || JSON.stringify(uploadError));
                }

                const { data } = supabase.storage.from('portfolio-media').getPublicUrl(filePath);
                media_url = data.publicUrl;
            } else if (!id) {
                // New projects no longer require a media file.
                // It will be saved without media.
            }

            const projectData = {
                title, category, description, project_link, published
            };

            if (media_url) {
                projectData.media_url = media_url;
                projectData.type = type;
            }

            if (id) {
                const { error } = await supabase.from('projects').update(projectData).eq('id', id);
                if (error) throw error;
                projectFormStatus.textContent = 'Project updated successfully!';
            } else {
                const { error } = await supabase.from('projects').insert([projectData]);
                if (error) throw error;
                projectFormStatus.textContent = 'Project created successfully!';
            }

            projectFormStatus.className = 'status-msg success';
            setTimeout(() => {
                projectModal.classList.remove('active');
                loadProjects();
            }, 1000);

        } catch (error) {
            projectFormStatus.textContent = error.message;
            projectFormStatus.className = 'status-msg error';
        } finally {
            projectSaveBtn.disabled = false;
            projectSaveBtn.textContent = 'Save Project';
        }
    });

    async function deleteProject(id) {
        if (!confirm("Are you sure you want to delete this project?")) return;
        
        try {
            const { error } = await supabase.from('projects').delete().eq('id', id);
            if (error) throw error;
            loadProjects();
        } catch (error) {
            alert(`Error deleting project: ${error.message}`);
        }
    }

    // ==========================================
    // CLIENTS MANAGEMENT
    // ==========================================
    const clientsTbody = document.getElementById('clients-tbody');
    const clientModal = document.getElementById('client-modal');
    const addClientBtn = document.getElementById('add-client-btn');
    const clientForm = document.getElementById('client-form');
    const clientSaveBtn = document.getElementById('client-save-btn');
    const clientFormStatus = document.getElementById('client-form-status');

    async function loadClients() {
        clientsTbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
        const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
        
        if (error) {
            clientsTbody.innerHTML = `<tr><td colspan="3" style="color:var(--danger)">Error loading clients: ${error.message}</td></tr>`;
            return;
        }
        
        clientsData = data || [];
        renderClients();
    }

    function renderClients() {
        clientsTbody.innerHTML = '';
        if (clientsData.length === 0) {
            clientsTbody.innerHTML = '<tr><td colspan="3">No clients found.</td></tr>';
            return;
        }

        clientsData.forEach(c => {
            const tr = document.createElement('tr');
            
            let logoHtml = c.logo_url 
                ? `<img src="${c.logo_url}" class="thumb" style="object-fit: contain;">` 
                : `<div class="thumb" style="background:#333;display:flex;align-items:center;justify-content:center;font-size:10px;">No Logo</div>`;

            const statusClass = c.published ? 'published' : 'draft';
            const statusText = c.published ? 'Published' : 'Draft';

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap: 1rem;">
                        ${logoHtml}
                        <span><strong>${c.name}</strong></span>
                    </div>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="action-btn edit-client" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="action-btn delete delete-client" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            clientsTbody.appendChild(tr);
        });

        document.querySelectorAll('.edit-client').forEach(btn => {
            btn.addEventListener('click', (e) => openClientModal(e.currentTarget.getAttribute('data-id')));
        });
        document.querySelectorAll('.delete-client').forEach(btn => {
            btn.addEventListener('click', (e) => deleteClient(e.currentTarget.getAttribute('data-id')));
        });
    }

    addClientBtn.addEventListener('click', () => openClientModal());

    function openClientModal(id = null) {
        clientForm.reset();
        clientFormStatus.textContent = '';
        clientFormStatus.className = 'status-msg';
        
        if (id) {
            const client = clientsData.find(c => c.id == id);
            if (client) {
                document.getElementById('client-modal-title').textContent = 'Edit Client';
                document.getElementById('client-id').value = client.id;
                document.getElementById('client-name').value = client.name || '';
                document.getElementById('client-link').value = client.website_link || '';
                document.getElementById('client-published').checked = client.published;
            }
        } else {
            document.getElementById('client-modal-title').textContent = 'Add Client';
            document.getElementById('client-id').value = '';
        }
        
        clientModal.classList.add('active');
    }

    clientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clientSaveBtn.disabled = true;
        clientSaveBtn.textContent = 'Saving...';
        clientFormStatus.textContent = '';

        const id = document.getElementById('client-id').value;
        const name = document.getElementById('client-name').value;
        const website_link = document.getElementById('client-link').value;
        const published = document.getElementById('client-published').checked;
        const fileInput = document.getElementById('client-file');
        
        try {
            let logo_url = '';

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `client_${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `clients/${fileName}`;

                const { error: uploadError } = await supabase.storage.from('portfolio-media').upload(filePath, file);
                
                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('portfolio-media').getPublicUrl(filePath);
                logo_url = data.publicUrl;
            }

            const clientData = { name, website_link, published };
            if (logo_url) clientData.logo_url = logo_url;

            if (id) {
                const { error } = await supabase.from('clients').update(clientData).eq('id', id);
                if (error) throw error;
                clientFormStatus.textContent = 'Client updated successfully!';
            } else {
                const { error } = await supabase.from('clients').insert([clientData]);
                if (error) throw error;
                clientFormStatus.textContent = 'Client created successfully!';
            }

            clientFormStatus.className = 'status-msg success';
            setTimeout(() => {
                clientModal.classList.remove('active');
                loadClients();
            }, 1000);

        } catch (error) {
            clientFormStatus.textContent = error.message;
            clientFormStatus.className = 'status-msg error';
        } finally {
            clientSaveBtn.disabled = false;
            clientSaveBtn.textContent = 'Save Client';
        }
    });

    async function deleteClient(id) {
        if (!confirm("Are you sure you want to delete this client?")) return;
        
        try {
            const { error } = await supabase.from('clients').delete().eq('id', id);
            if (error) throw error;
            loadClients();
        } catch (error) {
            alert(`Error deleting client: ${error.message}`);
        }
    }

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
        });
    });

    // ==========================================
    // PROFILE PHOTO MANAGEMENT
    // ==========================================
    const profilePhotoForm = document.getElementById('profile-photo-form');
    const profileUploadBtn = document.getElementById('upload-profile-btn');
    const profileStatus = document.getElementById('profile-photo-status');

    if (profilePhotoForm) {
        profilePhotoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('profile-photo-upload');
            
            if (fileInput.files.length === 0) {
                profileStatus.textContent = 'Please select an image first.';
                profileStatus.className = 'status-msg error';
                return;
            }

            profileUploadBtn.disabled = true;
            profileUploadBtn.textContent = 'Uploading...';
            profileStatus.textContent = '';
            
            try {
                const file = fileInput.files[0];
                const fileExt = file.name.split('.').pop();
                const fileName = `profile_${Date.now()}.${fileExt}`;
                const filePath = `profile/${fileName}`;

                // Upload to storage
                const { error: uploadError } = await supabase.storage.from('portfolio-media').upload(filePath, file);
                if (uploadError) throw uploadError;

                // Get public URL
                const { data } = supabase.storage.from('portfolio-media').getPublicUrl(filePath);
                const publicUrl = data.publicUrl;

                // Save to settings table
                const { error: updateError } = await supabase.from('settings').upsert({ id: 1, profile_photo_url: publicUrl });
                if (updateError) throw updateError;

                profileStatus.textContent = 'Profile photo updated successfully!';
                profileStatus.className = 'status-msg success';
                profilePhotoForm.reset();
            } catch (error) {
                profileStatus.textContent = error.message;
                profileStatus.className = 'status-msg error';
            } finally {
                profileUploadBtn.disabled = false;
                profileUploadBtn.textContent = 'Upload & Save Photo';
            }
        });
    }

    // Start App
    init();
});
